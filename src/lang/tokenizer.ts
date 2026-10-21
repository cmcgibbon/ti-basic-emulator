import { TiError } from './values'

// The calculator stores programs as tokens — "Disp ", "For(", "√(" are each one
// unit — so source text is split by longest match against this table rather
// than character by character.

/** Statement-level commands (most take arguments after them) */
const COMMANDS = [
  'Disp', 'Output(', 'ClrHome', 'Input', 'Prompt', 'Pause', 'If', 'Then', 'Else', 'End',
  'For(', 'While', 'Repeat', 'Lbl', 'Goto', 'Menu(', 'Stop', 'Return', 'IS>(', 'DS<(', 'prgm', 'DelVar',
] as const

/** Functions; the opening paren is part of the token, as on the calculator */
const FUNCTIONS = [
  'abs(', 'int(', 'iPart(', 'fPart(', 'round(', 'min(', 'max(', 'remainder(', 'gcd(', 'lcm(',
  '√(', 'sin(', 'cos(', 'tan(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'ln(', 'log(', 'e^(', '10^(',
  'randInt(', 'not(', 'length(', 'sub(', 'inString(', 'expr(', 'dim(', 'sum(', 'mean(',
] as const

/** Values that take no arguments */
const CONSTANTS = ['getKey', 'rand', 'π', 'Ans'] as const

const OPERATORS = [
  '→', '+', '-', '*', '/', '^', '²', '⁻¹', '⁻', '=', '≠', '≤', '≥', '<', '>',
  'and', 'xor', 'or', '(', ')', '{', '}', ',',
] as const

export type Token =
  | { t: 'num'; v: number; src: string }
  | { t: 'str'; v: string; src: string }
  | { t: 'var'; name: string; src: string }        // A–Z, θ
  | { t: 'strvar'; n: number; src: string }        // Str0–Str9
  | { t: 'list'; n: number; src: string }          // L₁–L₆
  | { t: 'cmd'; name: string; src: string }
  | { t: 'fn'; name: string; src: string }
  | { t: 'const'; name: string; src: string }
  | { t: 'op'; v: string; src: string }
  | { t: 'raw'; v: string; src: string }           // a Lbl/Goto/prgm name, taken verbatim

// Longest first, so 'randInt(' wins over 'rand' and 'sin⁻¹(' over 'sin('
const WORDS: [string, Token['t']][] = [
  ...COMMANDS.map(w => [w, 'cmd'] as [string, Token['t']]),
  ...FUNCTIONS.map(w => [w, 'fn'] as [string, Token['t']]),
  ...CONSTANTS.map(w => [w, 'const'] as [string, Token['t']]),
  ...OPERATORS.map(w => [w, 'op'] as [string, Token['t']]),
].sort((a, b) => b[0].length - a[0].length)

const SUBSCRIPTS = '₁₂₃₄₅₆'

/**
 * Replace the ASCII stand-ins a person might type with the calculator's own
 * symbols. Text inside strings is left alone — except that, as on the TI, a
 * string ends at a closing quote, the end of the line, or a → (store).
 */
export function normalizeSource(src: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < src.length;) {
    const ch = src[i]
    if (ch === '\n') { inString = false; out += ch; i++; continue }
    if (inString) {
      if (ch === '"') inString = false
      if (src.startsWith('->', i)) { inString = false; out += '→'; i += 2; continue }
      if (ch === '→') inString = false
      out += ch; i++; continue
    }
    if (ch === '"') { inString = true; out += ch; i++; continue }

    const prevIsLetter = /[A-Za-z]/.test(src[i - 1] ?? '')
    const rep = (from: string, to: string): boolean => {
      if (!src.startsWith(from, i)) return false
      out += to; i += from.length; return true
    }
    if (rep('->', '→') || rep('sqrt(', '√(') || rep('!=', '≠') || rep('<=', '≤') || rep('>=', '≥') ||
        rep('asin(', 'sin⁻¹(') || rep('acos(', 'cos⁻¹(') || rep('atan(', 'tan⁻¹(') ||
        rep('^-1', '⁻¹') || rep('theta', 'θ') || rep('×', '*') || rep('÷', '/') || rep('−', '-') || rep('~', '⁻')) continue
    // pi → π and L1–L6 → L₁–L₆, only as whole words (not inside "Input" or "Lbl")
    if (!prevIsLetter && src.startsWith('pi', i) && !/[A-Za-z(]/.test(src[i + 2] ?? '')) { out += 'π'; i += 2; continue }
    if (!prevIsLetter && ch === 'L' && /[1-6]/.test(src[i + 1] ?? '') && !/[0-9]/.test(src[i + 2] ?? '')) {
      out += 'L' + SUBSCRIPTS[Number(src[i + 1]) - 1]; i += 2; continue
    }
    out += ch; i++
  }
  return out
}

/** One statement of a program, with the 1-based line it came from (for Goto on errors) */
export interface SourceStatement {
  text: string
  line: number
}

/** Split a program into statements: one per line, and lines split on ':' outside strings. */
export function splitStatements(src: string): SourceStatement[] {
  const out: SourceStatement[] = []
  src.split('\n').forEach((lineText, idx) => {
    let current = ''
    let inString = false
    for (const ch of lineText) {
      if (ch === '"') inString = !inString
      else if (ch === '→') inString = false
      if (ch === ':' && !inString) {
        out.push({ text: current, line: idx + 1 })
        current = ''
      } else current += ch
    }
    out.push({ text: current, line: idx + 1 })
  })
  return out
}

/** Tokenize one statement. Throws ERR:SYNTAX on anything unrecognized. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t') { i++; continue }

    // String literal: runs to a closing quote, a →, or the end of the statement
    if (ch === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"' && text[j] !== '→') j++
      tokens.push({ t: 'str', v: text.slice(i + 1, j), src: text.slice(i, j + (text[j] === '"' ? 1 : 0)) })
      i = j + (text[j] === '"' ? 1 : 0)
      continue
    }

    // Number: digits with an optional decimal point and ᴇ exponent
    const numMatch = /^(\d+\.?\d*|\.\d+)(ᴇ[⁻-]?\d+)?/.exec(text.slice(i))
    if (numMatch) {
      const v = Number(numMatch[0].replace('ᴇ', 'e').replace('⁻', '-'))
      tokens.push({ t: 'num', v, src: numMatch[0] })
      i += numMatch[0].length
      continue
    }

    const strVar = /^Str(\d)/.exec(text.slice(i))
    if (strVar) {
      tokens.push({ t: 'strvar', n: Number(strVar[1]), src: strVar[0] })
      i += strVar[0].length
      continue
    }
    if (ch === 'L' && SUBSCRIPTS.includes(text[i + 1] ?? '')) {
      tokens.push({ t: 'list', n: SUBSCRIPTS.indexOf(text[i + 1]) + 1, src: text.slice(i, i + 2) })
      i += 2
      continue
    }

    const word = WORDS.find(([w]) => text.startsWith(w, i))
    if (word) {
      const [w, t] = word
      i += w.length
      if (t === 'cmd') {
        tokens.push({ t: 'cmd', name: w, src: w })
        // Label and program names are plain text, not expressions
        if (w === 'Lbl' || w === 'Goto' || w === 'prgm') {
          const name = text.slice(i).trim()
          tokens.push({ t: 'raw', v: name, src: name })
          i = text.length
        }
      } else if (t === 'fn') tokens.push({ t: 'fn', name: w, src: w })
      else if (t === 'const') tokens.push({ t: 'const', name: w, src: w })
      else tokens.push({ t: 'op', v: w, src: w })
      continue
    }

    // Single-letter variables. Lowercase is accepted and read as uppercase,
    // since the calculator only has A–Z.
    if (/[A-Za-zθ]/.test(ch)) {
      const name = ch === 'θ' ? 'θ' : ch.toUpperCase()
      tokens.push({ t: 'var', name, src: ch })
      i++
      continue
    }

    throw new TiError('SYNTAX')
  }
  return tokens
}
