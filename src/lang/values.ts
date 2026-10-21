// Runtime values, errors and TI-style number formatting.

/** TI-BASIC values: real numbers, strings and lists of reals */
export type Value = number | string | number[]

/** Error codes as the calculator names them ("ERR:" + code) */
export type ErrorCode =
  | 'SYNTAX' | 'DATA TYPE' | 'DIVIDE BY 0' | 'DOMAIN' | 'UNDEFINED' | 'INVALID DIM'
  | 'LABEL' | 'NONREAL ANS' | 'OVERFLOW' | 'ARGUMENT' | 'BREAK' | 'INVALID'

export class TiError extends Error {
  constructor(public code: ErrorCode) {
    super(`ERR:${code}`)
  }
}

/** Thrown by Stop: ends the program and any program that called it */
export class StopSignal extends Error {}

export function isNum(v: Value): v is number { return typeof v === 'number' }
export function isStr(v: Value): v is string { return typeof v === 'string' }
export function isList(v: Value): v is number[] { return Array.isArray(v) }

export function num(v: Value): number {
  if (!isNum(v)) throw new TiError('DATA TYPE')
  return v
}

export function str(v: Value): string {
  if (!isStr(v)) throw new TiError('DATA TYPE')
  return v
}

/** Guard every arithmetic result: NaN/∞ never reach a variable */
export function checked(n: number): number {
  if (Number.isNaN(n)) throw new TiError('DOMAIN')
  if (!Number.isFinite(n) || Math.abs(n) >= 1e100) throw new TiError('OVERFLOW')
  return n
}

/**
 * Format a number the way the TI-84 shows it in Normal/Float mode: at most 10
 * significant digits, no leading zero (".5"), the raised negative sign ("⁻3"),
 * and scientific notation with ᴇ once the number is too big or too small.
 */
export function formatNumber(n: number): string {
  if (n === 0 || Object.is(n, -0)) return '0'
  const neg = n < 0
  const a = Math.abs(n)
  let body: string
  if (a >= 1e10 || a < 1e-3) {
    const [mant, exp] = a.toExponential(9).split('e')
    const e = Number(exp)
    body = trimZeros(mant) + 'ᴇ' + (e < 0 ? '⁻' : '') + Math.abs(e)
  } else {
    body = trimZeros(Number(a.toPrecision(10)).toString())
    if (body.startsWith('0.')) body = body.slice(1)
  }
  return (neg ? '⁻' : '') + body
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

export function formatValue(v: Value): string {
  if (isStr(v)) return v
  if (isList(v)) return '{' + v.map(formatNumber).join(' ') + '}'
  return formatNumber(v)
}
