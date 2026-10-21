import { normalizeSource, splitStatements, tokenize, type Token } from './tokenizer'
import { TiError, type ErrorCode } from './values'

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'var'; name: string }
  | { k: 'strvar'; n: number }
  | { k: 'list'; n: number }
  | { k: 'listlit'; items: Expr[] }
  | { k: 'index'; n: number; i: Expr }      // L₁(2)
  | { k: 'const'; name: string }            // getKey, rand, π, Ans
  | { k: 'neg'; e: Expr }
  | { k: 'post'; op: '²' | '⁻¹'; e: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'call'; name: string; args: Expr[] }

/** Where → (and Input/Prompt/For() can put a value */
export type Target =
  | { k: 'var'; name: string }
  | { k: 'strvar'; n: number }
  | { k: 'list'; n: number }
  | { k: 'index'; n: number; i: Expr }

export type Stmt = { line: number } & (
  | { s: 'empty' }
  | { s: 'expr'; e: Expr }
  | { s: 'store'; e: Expr; target: Target }
  | { s: 'disp'; args: Expr[] }
  | { s: 'output'; row: Expr; col: Expr; e: Expr }
  | { s: 'clrhome' }
  | { s: 'input'; prompt: Expr | null; target: Target }
  | { s: 'prompt'; targets: Target[] }
  | { s: 'pause'; e: Expr | null }
  | { s: 'if'; cond: Expr }
  | { s: 'then' } | { s: 'else' } | { s: 'end' }
  | { s: 'for'; v: Target; from: Expr; to: Expr; step: Expr | null }
  | { s: 'while'; cond: Expr }
  | { s: 'repeat'; cond: Expr }
  | { s: 'lbl'; name: string }
  | { s: 'goto'; name: string }
  | { s: 'menu'; title: Expr; items: { text: Expr; label: string }[] }
  | { s: 'stop' } | { s: 'return' }
  | { s: 'isg'; v: Target; limit: Expr; dec: boolean }
  | { s: 'prgm'; name: string }
  | { s: 'delvar'; target: Target }
  // Parsing failed; the error is raised only if execution reaches this line,
  // which is when the real calculator would notice it
  | { s: 'syntaxError'; code: ErrorCode }
)

/** Parse a whole program. Never throws — bad lines become syntaxError statements. */
export function parseProgram(source: string): Stmt[] {
  return splitStatements(normalizeSource(source)).map(({ text, line }) => {
    try {
      return { line, ...parseStatement(tokenize(text)) } as Stmt
    } catch (e) {
      return { line, s: 'syntaxError', code: e instanceof TiError ? e.code : 'SYNTAX' } as Stmt
    }
  })
}

type StmtBody = Stmt extends infer S ? S extends { line: number } ? Omit<S, 'line'> : never : never

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos] }
  next(): Token {
    const t = this.tokens[this.pos++]
    if (!t) throw new TiError('SYNTAX')
    return t
  }
  atEnd(): boolean { return this.pos >= this.tokens.length }
  isOp(v: string): boolean {
    const t = this.peek()
    return t?.t === 'op' && t.v === v
  }
  eatOp(v: string): boolean {
    if (!this.isOp(v)) return false
    this.pos++
    return true
  }
  expectOp(v: string) {
    if (!this.eatOp(v)) throw new TiError('SYNTAX')
  }
  /** A closing ) or } may be left off before the end of the statement or a → */
  close(v: ')' | '}') {
    if (this.eatOp(v)) return
    if (this.atEnd() || this.isOp('→')) return
    throw new TiError('SYNTAX')
  }
  expectEnd() {
    if (!this.atEnd()) throw new TiError('SYNTAX')
  }

  // ── Expressions, loosest-binding first ────────────────────────────────────

  expr(): Expr { return this.orExpr() }

  orExpr(): Expr {
    let a = this.andExpr()
    while (this.isOp('or') || this.isOp('xor')) {
      const op = (this.next() as { v: string }).v
      a = { k: 'bin', op, a, b: this.andExpr() }
    }
    return a
  }

  andExpr(): Expr {
    let a = this.relExpr()
    while (this.eatOp('and')) a = { k: 'bin', op: 'and', a, b: this.relExpr() }
    return a
  }

  relExpr(): Expr {
    let a = this.addExpr()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && ['=', '≠', '<', '>', '≤', '≥'].includes(t.v)) {
        this.pos++
        a = { k: 'bin', op: t.v, a, b: this.addExpr() }
      } else return a
    }
  }

  addExpr(): Expr {
    let a = this.mulExpr()
    for (;;) {
      if (this.eatOp('+')) a = { k: 'bin', op: '+', a, b: this.mulExpr() }
      else if (this.eatOp('-')) a = { k: 'bin', op: '-', a, b: this.mulExpr() }
      else return a
    }
  }

  mulExpr(): Expr {
    let a = this.negExpr()
    for (;;) {
      if (this.eatOp('*')) a = { k: 'bin', op: '*', a, b: this.negExpr() }
      else if (this.eatOp('/')) a = { k: 'bin', op: '/', a, b: this.negExpr() }
      // Implied multiplication: 2A, 3(X+1), Aπ. Same precedence as ×.
      else if (this.startsValue()) a = { k: 'bin', op: '*', a, b: this.powExpr() }
      else return a
    }
  }

  /** Negation binds looser than ^, so ⁻2² is −(2²) = −4, as on the calculator */
  negExpr(): Expr {
    if (this.eatOp('⁻') || this.eatOp('-')) return { k: 'neg', e: this.negExpr() }
    return this.powExpr()
  }

  /** ^ is left-associative on the TI: 2^3^2 = (2^3)^2 = 64 */
  powExpr(): Expr {
    let a = this.postfixExpr()
    while (this.eatOp('^')) {
      const b = (this.eatOp('⁻') || this.eatOp('-')) ? { k: 'neg', e: this.postfixExpr() } as Expr : this.postfixExpr()
      a = { k: 'bin', op: '^', a, b }
    }
    return a
  }

  postfixExpr(): Expr {
    let e = this.primary()
    for (;;) {
      if (this.eatOp('²')) e = { k: 'post', op: '²', e }
      else if (this.eatOp('⁻¹')) e = { k: 'post', op: '⁻¹', e }
      else return e
    }
  }

  startsValue(): boolean {
    const t = this.peek()
    if (!t) return false
    if (t.t === 'num' || t.t === 'var' || t.t === 'strvar' || t.t === 'list' || t.t === 'fn' || t.t === 'const') return true
    return t.t === 'op' && (t.v === '(' || t.v === '{')
  }

  primary(): Expr {
    const t = this.next()
    switch (t.t) {
      case 'num': return { k: 'num', v: t.v }
      case 'str': return { k: 'str', v: t.v }
      case 'var': return { k: 'var', name: t.name }
      case 'strvar': return { k: 'strvar', n: t.n }
      case 'const': return { k: 'const', name: t.name }
      case 'list':
        if (this.eatOp('(')) {
          const i = this.expr()
          this.close(')')
          return { k: 'index', n: t.n, i }
        }
        return { k: 'list', n: t.n }
      case 'fn': {
        const args: Expr[] = []
        if (!this.isOp(')') && !this.atEnd()) {
          args.push(this.expr())
          while (this.eatOp(',')) args.push(this.expr())
        }
        this.close(')')
        return { k: 'call', name: t.name, args }
      }
      case 'op':
        if (t.v === '(') {
          const e = this.expr()
          this.close(')')
          return e
        }
        if (t.v === '{') {
          const items: Expr[] = []
          if (!this.isOp('}')) {
            items.push(this.expr())
            while (this.eatOp(',')) items.push(this.expr())
          }
          this.close('}')
          return { k: 'listlit', items }
        }
    }
    throw new TiError('SYNTAX')
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  target(): Target {
    const e = this.primary()
    if (e.k === 'var' || e.k === 'strvar' || e.k === 'list' || e.k === 'index') return e
    throw new TiError('SYNTAX')
  }

  rawName(): string {
    const t = this.next()
    if (t.t !== 'raw' || !t.v) throw new TiError('SYNTAX')
    return t.v
  }

  /** A Menu( label: whatever tokens sit between commas, read back as text */
  menuLabel(): string {
    let label = ''
    while (!this.atEnd() && !this.isOp(',') && !this.isOp(')')) label += this.next().src
    if (!label) throw new TiError('SYNTAX')
    return label
  }

  statement(): StmtBody {
    if (this.atEnd()) return { s: 'empty' }
    const t = this.peek()!
    if (t.t !== 'cmd') {
      const e = this.expr()
      if (this.eatOp('→')) {
        const target = this.target()
        this.expectEnd()
        return { s: 'store', e, target }
      }
      this.expectEnd()
      return { s: 'expr', e }
    }

    this.pos++
    let out: StmtBody
    switch (t.name) {
      case 'Disp': {
        const args: Expr[] = []
        if (!this.atEnd()) {
          args.push(this.expr())
          while (this.eatOp(',')) args.push(this.expr())
        }
        out = { s: 'disp', args }
        break
      }
      case 'Output(': {
        const row = this.expr(); this.expectOp(',')
        const col = this.expr(); this.expectOp(',')
        const e = this.expr()
        this.close(')')
        out = { s: 'output', row, col, e }
        break
      }
      case 'ClrHome': out = { s: 'clrhome' }; break
      case 'Input': {
        const first = this.expr()
        if (this.eatOp(',')) {
          out = { s: 'input', prompt: first, target: this.target() }
        } else {
          if (first.k !== 'var' && first.k !== 'strvar' && first.k !== 'list' && first.k !== 'index') throw new TiError('SYNTAX')
          out = { s: 'input', prompt: null, target: first }
        }
        break
      }
      case 'Prompt': {
        const targets = [this.target()]
        while (this.eatOp(',')) targets.push(this.target())
        out = { s: 'prompt', targets }
        break
      }
      case 'Pause': out = { s: 'pause', e: this.atEnd() ? null : this.expr() }; break
      case 'If': out = { s: 'if', cond: this.expr() }; break
      case 'Then': out = { s: 'then' }; break
      case 'Else': out = { s: 'else' }; break
      case 'End': out = { s: 'end' }; break
      case 'For(': {
        const v = this.target()
        if (v.k !== 'var') throw new TiError('SYNTAX')
        this.expectOp(',')
        const from = this.expr(); this.expectOp(',')
        const to = this.expr()
        const step = this.eatOp(',') ? this.expr() : null
        this.close(')')
        out = { s: 'for', v, from, to, step }
        break
      }
      case 'While': out = { s: 'while', cond: this.expr() }; break
      case 'Repeat': out = { s: 'repeat', cond: this.expr() }; break
      case 'Lbl': out = { s: 'lbl', name: this.rawName() }; break
      case 'Goto': out = { s: 'goto', name: this.rawName() }; break
      case 'prgm': out = { s: 'prgm', name: this.rawName() }; break
      case 'Menu(': {
        const title = this.expr()
        const items: { text: Expr; label: string }[] = []
        while (this.eatOp(',')) {
          const text = this.expr()
          this.expectOp(',')
          items.push({ text, label: this.menuLabel() })
        }
        this.close(')')
        if (items.length === 0 || items.length > 7) throw new TiError('ARGUMENT')
        out = { s: 'menu', title, items }
        break
      }
      case 'Stop': out = { s: 'stop' }; break
      case 'Return': out = { s: 'return' }; break
      case 'IS>(':
      case 'DS<(': {
        const v = this.target()
        if (v.k !== 'var') throw new TiError('SYNTAX')
        this.expectOp(',')
        const limit = this.expr()
        this.close(')')
        out = { s: 'isg', v, limit, dec: t.name === 'DS<(' }
        break
      }
      case 'DelVar': out = { s: 'delvar', target: this.target() }; break
      default: throw new TiError('SYNTAX')
    }
    this.expectEnd()
    return out
  }
}

function parseStatement(tokens: Token[]): StmtBody {
  return new Parser(tokens).statement()
}

/** Parse a single expression (used by expr( and Input of a number). */
export function parseExpression(text: string): Expr {
  const p = new Parser(tokenize(normalizeSource(text)))
  const e = p.expr()
  p.expectEnd()
  return e
}
