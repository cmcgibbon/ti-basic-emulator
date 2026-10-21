import { parseExpression, parseProgram, type Expr, type Stmt, type Target } from './parser'
import { StopSignal, TiError, checked, isList, isStr, num, str, type Value } from './values'

/** How the interpreter reaches the screen and keyboard; implemented by the calculator. */
export interface ProgramIO {
  /** Disp: print one value on its own line */
  disp(v: Value): void
  /** Output(row, col, value), 1-based */
  output(row: number, col: number, v: Value): void
  clrHome(): void
  /** Show a prompt and resolve with whatever the user types before ENTER */
  input(prompt: string): Promise<string>
  /** Pause [value]: optionally show a value, then wait for ENTER */
  pause(v: Value | null): Promise<void>
  /** Menu(: resolve with the 0-based index of the chosen item */
  menu(title: string, items: string[]): Promise<number>
  /** getKey: the TI key code of the last key pressed (consumed), or 0 */
  getKey(): number
  /** True once the user has pressed ON (Esc) to break */
  breakRequested(): boolean
}

/** Variables shared by every program and the home screen, like the calculator's RAM */
export class Memory {
  reals = new Map<string, number>()
  strings = new Map<number, string>()
  lists = new Map<number, number[]>()
  ans: Value = 0
}

/**
 * Roughly a TI-84 Plus's pace. Programs written for the calculator lean on its
 * speed — empty For( loops as delays, animation timed by the screen — so running
 * them at full JavaScript speed would make those flash by.
 */
const STATEMENTS_PER_SECOND = 2500
const MAX_PROGRAM_DEPTH = 40

type Frame =
  | { kind: 'if'; opener: number }
  | { kind: 'while' | 'repeat'; opener: number }
  | { kind: 'for'; opener: number; v: string; to: number; step: number }

/** Matching Else/End for every block opener, and where each Lbl is — worked out once per run */
function analyze(stmts: Stmt[]) {
  const endOf = new Map<number, number>()
  const elseOf = new Map<number, number>()
  const labels = new Map<string, number>()
  const open: number[] = []
  stmts.forEach((st, i) => {
    switch (st.s) {
      case 'if': if (stmts[i + 1]?.s === 'then') open.push(i); break
      case 'for': case 'while': case 'repeat': open.push(i); break
      case 'else': { const o = open[open.length - 1]; if (o !== undefined) elseOf.set(o, i); break }
      case 'end': {
        const o = open.pop()
        if (o === undefined) break
        endOf.set(o, i)
        const e = elseOf.get(o)
        if (e !== undefined) endOf.set(e, i)
        break
      }
      case 'lbl': if (!labels.has(st.name)) labels.set(st.name, i); break
    }
  })
  return { endOf, elseOf, labels }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const truthy = (v: Value) => num(v) !== 0
const toBool = (b: boolean) => (b ? 1 : 0)

function targetName(t: Target): string {
  if (t.k === 'var') return t.name
  if (t.k === 'strvar') return `Str${t.n}`
  return 'L' + '₁₂₃₄₅₆'[t.n - 1]
}

export class Interpreter {
  /** Whether the last statement run was an expression or store — the home screen shows its value */
  lastWasExpr = false

  private executed = 0
  private t0 = performance.now()
  private lastYield = performance.now()
  private depth = 0

  constructor(
    private io: ProgramIO,
    private mem: Memory,
    private findProgram: (name: string) => string | undefined,
  ) {}

  /** Restart the pacing clock — after waiting on the user, don't try to "catch up" */
  private resetClock() {
    this.executed = 0
    this.t0 = performance.now()
    this.lastYield = this.t0
  }

  private async tick() {
    if (this.io.breakRequested()) throw new TiError('BREAK')
    this.executed++
    const now = performance.now()
    const ahead = this.executed * 1000 / STATEMENTS_PER_SECOND - (now - this.t0)
    if (ahead > 12) {
      await sleep(ahead)
      this.lastYield = performance.now()
    } else if (now - this.lastYield > 30) {
      // Behind schedule: still hand the browser a frame now and then
      await sleep(0)
      this.lastYield = performance.now()
    }
  }

  /** Run a whole program or home-screen entry. Stop anywhere inside ends it quietly. */
  async runTop(stmts: Stmt[]) {
    this.resetClock()
    this.depth = 0
    try {
      await this.run(stmts)
    } catch (e) {
      if (!(e instanceof StopSignal)) throw e
    }
  }

  private async run(stmts: Stmt[]) {
    if (++this.depth > MAX_PROGRAM_DEPTH) throw new TiError('OVERFLOW')
    const { endOf, elseOf, labels } = analyze(stmts)
    const after = (i: number) => (endOf.get(i) ?? stmts.length - 1) + 1
    const stack: Frame[] = []

    const jumpTo = (label: string): number => {
      const target = labels.get(label)
      if (target === undefined) throw new TiError('LABEL')
      // Drop every block the jump leaves. The calculator keeps them (a
      // "memory leak"), which confuses a later End — so Goto out of a loop
      // behaves the way the program's author meant it to.
      while (stack.length) {
        const top = stack[stack.length - 1]
        const end = endOf.get(top.opener)
        if (end !== undefined && target > top.opener && target < end) break
        stack.pop()
      }
      return target + 1
    }

    let pc = 0
    while (pc < stmts.length) {
      await this.tick()
      const st = stmts[pc]
      this.lastWasExpr = false
      switch (st.s) {
        case 'empty': case 'lbl': case 'then':
          pc++; break
        case 'syntaxError':
          throw new TiError(st.code)
        case 'expr':
          this.mem.ans = this.eval(st.e)
          this.lastWasExpr = true
          pc++; break
        case 'store': {
          const v = this.eval(st.e)
          this.assign(st.target, v)
          this.mem.ans = v
          // A store is an expression too: on the home screen, 5→A shows 5
          this.lastWasExpr = true
          pc++; break
        }
        case 'disp':
          for (const a of st.args) this.io.disp(this.eval(a))
          pc++; break
        case 'output':
          this.io.output(this.int(this.eval(st.row)), this.int(this.eval(st.col)), this.eval(st.e))
          pc++; break
        case 'clrhome':
          this.io.clrHome()
          pc++; break
        case 'input': {
          const prompt = st.prompt ? this.eval(st.prompt) : '?'
          await this.readInto(st.target, isStr(prompt) ? prompt : '?')
          pc++; break
        }
        case 'prompt':
          for (const t of st.targets) await this.readInto(t, `${targetName(t)}=?`)
          pc++; break
        case 'pause':
          await this.io.pause(st.e ? this.eval(st.e) : null)
          this.resetClock()
          pc++; break
        case 'if': {
          const cond = truthy(this.eval(st.cond))
          if (stmts[pc + 1]?.s === 'then') {
            if (cond) { stack.push({ kind: 'if', opener: pc }); pc += 2 }
            else {
              const els = elseOf.get(pc)
              if (els !== undefined) { stack.push({ kind: 'if', opener: pc }); pc = els + 1 }
              else pc = after(pc)
            }
          } else {
            // Single-line If: skip the next statement when false
            pc += cond ? 1 : 2
          }
          break
        }
        case 'else':
          // Reached by finishing the true branch: skip the false one
          stack.pop()
          pc = after(pc)
          break
        case 'end': {
          const top = stack[stack.length - 1]
          if (!top) { pc++; break }
          if (top.kind === 'if') { stack.pop(); pc++ }
          else if (top.kind === 'for') {
            const v = checked((this.mem.reals.get(top.v) ?? 0) + top.step)
            this.mem.reals.set(top.v, v)
            if (top.step > 0 ? v <= top.to : v >= top.to) pc = top.opener + 1
            else { stack.pop(); pc++ }
          } else {
            const opener = stmts[top.opener] as Extract<Stmt, { s: 'while' | 'repeat' }>
            const cond = truthy(this.eval(opener.cond))
            // While loops while true; Repeat loops until true
            if (top.kind === 'while' ? cond : !cond) pc = top.opener + 1
            else { stack.pop(); pc++ }
          }
          break
        }
        case 'for': {
          const from = num(this.eval(st.from))
          const to = num(this.eval(st.to))
          const step = st.step ? num(this.eval(st.step)) : 1
          if (step === 0) throw new TiError('INVALID')
          const name = (st.v as { name: string }).name
          this.mem.reals.set(name, from)
          if (step > 0 ? from <= to : from >= to) {
            stack.push({ kind: 'for', opener: pc, v: name, to, step })
            pc++
          } else pc = after(pc)
          break
        }
        case 'while':
          if (truthy(this.eval(st.cond))) { stack.push({ kind: 'while', opener: pc }); pc++ }
          else pc = after(pc)
          break
        case 'repeat':
          // Body always runs once; the condition is checked at End
          stack.push({ kind: 'repeat', opener: pc })
          pc++; break
        case 'goto':
          pc = jumpTo(st.name)
          break
        case 'menu': {
          const title = str(this.eval(st.title))
          const choice = await this.io.menu(title, st.items.map(it => str(this.eval(it.text))))
          this.resetClock()
          pc = jumpTo(st.items[choice].label)
          break
        }
        case 'stop':
          throw new StopSignal()
        case 'return':
          this.depth--
          return
        case 'isg': {
          const name = (st.v as { name: string }).name
          const v = (this.mem.reals.get(name) ?? 0) + (st.dec ? -1 : 1)
          this.mem.reals.set(name, v)
          const limit = num(this.eval(st.limit))
          // IS>( skips the next statement once the value passes the limit; DS<( once below it
          pc += (st.dec ? v < limit : v > limit) ? 2 : 1
          break
        }
        case 'prgm': {
          const src = this.findProgram(st.name)
          if (src === undefined) throw new TiError('UNDEFINED')
          await this.run(parseProgram(src))
          pc++; break
        }
        case 'delvar': {
          const t = st.target
          if (t.k === 'var') this.mem.reals.delete(t.name)
          else if (t.k === 'strvar') this.mem.strings.delete(t.n)
          else if (t.k === 'list') this.mem.lists.delete(t.n)
          pc++; break
        }
      }
    }
    this.depth--
  }

  /** Input / Prompt: show the prompt, then store what was typed */
  private async readInto(target: Target, prompt: string) {
    const typed = await this.io.input(prompt)
    this.resetClock()
    // Strings keep exactly what was typed; anything else is read as an expression
    this.assign(target, target.k === 'strvar' ? typed : this.eval(parseExpression(typed)))
  }

  private int(v: Value): number {
    const n = num(v)
    if (!Number.isInteger(n)) throw new TiError('DOMAIN')
    return n
  }

  private assign(t: Target, v: Value) {
    switch (t.k) {
      case 'var': this.mem.reals.set(t.name, num(v)); break
      case 'strvar': this.mem.strings.set(t.n, str(v)); break
      case 'list':
        if (!isList(v)) throw new TiError('DATA TYPE')
        this.mem.lists.set(t.n, [...v])
        break
      case 'index': {
        const list = this.mem.lists.get(t.n) ?? []
        const i = this.int(this.eval(t.i))
        // Storing one past the end grows the list, as on the calculator
        if (i < 1 || i > list.length + 1) throw new TiError('INVALID DIM')
        list[i - 1] = num(v)
        this.mem.lists.set(t.n, list)
        break
      }
    }
  }

  eval(e: Expr): Value {
    switch (e.k) {
      case 'num': return e.v
      case 'str': return e.v
      case 'var': return this.mem.reals.get(e.name) ?? 0
      case 'strvar': {
        const s = this.mem.strings.get(e.n)
        if (s === undefined) throw new TiError('UNDEFINED')
        return s
      }
      case 'list': {
        const l = this.mem.lists.get(e.n)
        if (!l) throw new TiError('UNDEFINED')
        return [...l]
      }
      case 'listlit': return e.items.map(it => num(this.eval(it)))
      case 'index': {
        const l = this.mem.lists.get(e.n)
        if (!l) throw new TiError('UNDEFINED')
        const i = this.int(this.eval(e.i))
        if (i < 1 || i > l.length) throw new TiError('INVALID DIM')
        return l[i - 1]
      }
      case 'const':
        switch (e.name) {
          case 'getKey': return this.io.getKey()
          case 'rand': return Math.random() || Number.MIN_VALUE
          case 'π': return Math.PI
          default: return this.mem.ans
        }
      case 'neg': return this.map(this.eval(e.e), x => -x)
      case 'post':
        return e.op === '²'
          ? this.map(this.eval(e.e), x => x * x)
          : this.map(this.eval(e.e), x => { if (x === 0) throw new TiError('DIVIDE BY 0'); return 1 / x })
      case 'bin': return this.binary(e.op, this.eval(e.a), this.eval(e.b))
      case 'call': return this.call(e.name, e.args)
    }
  }

  /** Apply a number function to a number or element-wise to a list */
  private map(v: Value, f: (x: number) => number): Value {
    if (isList(v)) return v.map(x => checked(f(x)))
    return checked(f(num(v)))
  }

  private binary(op: string, a: Value, b: Value): Value {
    // Strings: + joins them, = and ≠ compare them; nothing else applies
    if (isStr(a) || isStr(b)) {
      if (!isStr(a) || !isStr(b)) throw new TiError('DATA TYPE')
      if (op === '+') return a + b
      if (op === '=') return toBool(a === b)
      if (op === '≠') return toBool(a !== b)
      throw new TiError('DATA TYPE')
    }
    // Lists combine element-wise, with each other or with a number
    if (isList(a) || isList(b)) {
      if (isList(a) && isList(b) && a.length !== b.length) throw new TiError('INVALID DIM')
      const n = isList(a) ? a.length : (b as number[]).length
      return Array.from({ length: n }, (_, i) =>
        num(this.binary(op, isList(a) ? a[i] : a, isList(b) ? b[i] : b)))
    }
    const x = a as number, y = b as number
    switch (op) {
      case '+': return checked(x + y)
      case '-': return checked(x - y)
      case '*': return checked(x * y)
      case '/': if (y === 0) throw new TiError('DIVIDE BY 0'); return checked(x / y)
      case '^':
        if (x === 0 && y === 0) throw new TiError('DOMAIN')
        if (x < 0 && !Number.isInteger(y)) throw new TiError('NONREAL ANS')
        return checked(x ** y)
      case '=': return toBool(x === y)
      case '≠': return toBool(x !== y)
      case '<': return toBool(x < y)
      case '>': return toBool(x > y)
      case '≤': return toBool(x <= y)
      case '≥': return toBool(x >= y)
      case 'and': return toBool(x !== 0 && y !== 0)
      case 'or': return toBool(x !== 0 || y !== 0)
      case 'xor': return toBool((x !== 0) !== (y !== 0))
    }
    throw new TiError('SYNTAX')
  }

  private call(name: string, argExprs: Expr[]): Value {
    const args = argExprs.map(a => this.eval(a))
    const arity = (min: number, max = min) => {
      if (args.length < min || args.length > max) throw new TiError('ARGUMENT')
    }
    const n = (i: number) => num(args[i])
    const list = (i: number) => { if (!isList(args[i])) throw new TiError('DATA TYPE'); return args[i] as number[] }
    const unary = (f: (x: number) => number) => { arity(1); return this.map(args[0], f) }
    const domain = (ok: boolean, code: 'DOMAIN' | 'NONREAL ANS' = 'DOMAIN') => { if (!ok) throw new TiError(code) }

    switch (name) {
      case 'abs(': return unary(Math.abs)
      case 'int(': return unary(Math.floor)
      case 'iPart(': return unary(Math.trunc)
      case 'fPart(': return unary(x => x - Math.trunc(x))
      case 'round(': {
        arity(1, 2)
        const d = args.length > 1 ? n(1) : 9
        return this.map(args[0], x => Number(x.toFixed(Math.max(0, Math.min(9, d)))))
      }
      case 'min(': case 'max(': {
        const pick = name === 'min(' ? Math.min : Math.max
        if (args.length === 1) { const l = list(0); domain(l.length > 0); return pick(...l) }
        arity(2)
        return pick(n(0), n(1))
      }
      case 'remainder(': arity(2); if (n(1) === 0) throw new TiError('DIVIDE BY 0'); return n(0) % n(1)
      case 'gcd(': case 'lcm(': {
        arity(2)
        const a = Math.abs(n(0)), b = Math.abs(n(1))
        domain(Number.isInteger(a) && Number.isInteger(b))
        const g = (p: number, q: number): number => (q === 0 ? p : g(q, p % q))
        return name === 'gcd(' ? g(a, b) : (a === 0 || b === 0 ? 0 : (a / g(a, b)) * b)
      }
      case '√(': return unary(x => { domain(x >= 0, 'NONREAL ANS'); return Math.sqrt(x) })
      case 'sin(': return unary(Math.sin)
      case 'cos(': return unary(Math.cos)
      case 'tan(': return unary(Math.tan)
      case 'sin⁻¹(': return unary(x => { domain(Math.abs(x) <= 1); return Math.asin(x) })
      case 'cos⁻¹(': return unary(x => { domain(Math.abs(x) <= 1); return Math.acos(x) })
      case 'tan⁻¹(': return unary(Math.atan)
      case 'ln(': return unary(x => { domain(x !== 0); domain(x > 0, 'NONREAL ANS'); return Math.log(x) })
      case 'log(': return unary(x => { domain(x !== 0); domain(x > 0, 'NONREAL ANS'); return Math.log10(x) })
      case 'e^(': return unary(Math.exp)
      case '10^(': return unary(x => 10 ** x)
      case 'not(': return unary(x => toBool(x === 0))
      case 'randInt(': {
        arity(2, 3)
        const lo = Math.ceil(Math.min(n(0), n(1))), hi = Math.floor(Math.max(n(0), n(1)))
        const pick = () => lo + Math.floor(Math.random() * (hi - lo + 1))
        return args.length === 3 ? Array.from({ length: n(2) }, pick) : pick()
      }
      case 'length(': arity(1); return str(args[0]).length
      case 'sub(': {
        arity(3)
        const s = str(args[0]), start = n(1), len = n(2)
        domain(start >= 1 && len >= 1 && start + len - 1 <= s.length)
        return s.substr(start - 1, len)
      }
      case 'inString(': {
        arity(2, 3)
        const from = args.length === 3 ? n(2) - 1 : 0
        return str(args[0]).indexOf(str(args[1]), from) + 1
      }
      case 'expr(': arity(1); return this.eval(parseExpression(str(args[0])))
      case 'dim(': arity(1); return list(0).length
      case 'sum(': arity(1); return checked(list(0).reduce((s, x) => s + x, 0))
      case 'mean(': { arity(1); const l = list(0); domain(l.length > 0); return checked(l.reduce((s, x) => s + x, 0) / l.length) }
    }
    throw new TiError('SYNTAX')
  }
}

