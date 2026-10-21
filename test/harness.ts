import { parseProgram } from '../src/lang/parser'
import { Interpreter, Memory, type ProgramIO } from '../src/lang/interpreter'
import { TiError, formatValue } from '../src/lang/values'

export interface RunOptions {
  /** Answers given to Input / Prompt (and menu choices, 1-based), in order */
  inputs?: string[]
  /** getKey codes returned in order, then 0 */
  keys?: number[]
  /** Other programs a prgm call can find */
  programs?: Record<string, string>
}

/**
 * Run a program against a fake screen and return what it showed, one entry per
 * Disp line. Output( is recorded as "@row,col:text", ClrHome as "<clr>", Input
 * as prompt + answer, and an error as its "ERR:..." message.
 */
export async function run(source: string, opts: RunOptions = {}): Promise<string[]> {
  const inputs = [...(opts.inputs ?? [])]
  const keys = [...(opts.keys ?? [])]
  const out: string[] = []
  const io: ProgramIO = {
    disp: v => out.push(formatValue(v)),
    output: (r, c, v) => out.push(`@${r},${c}:${formatValue(v)}`),
    clrHome: () => out.push('<clr>'),
    input: async prompt => { const v = inputs.shift() ?? ''; out.push(prompt + v); return v },
    pause: async v => { out.push(v === null ? '<pause>' : `<pause ${formatValue(v)}>`) },
    menu: async (title, items) => {
      const pick = Number(inputs.shift() ?? '1') - 1
      out.push(`<menu ${title}: ${items.join('|')} → ${items[pick]}>`)
      return pick
    },
    getKey: () => keys.shift() ?? 0,
    breakRequested: () => false,
  }
  try {
    await new Interpreter(io, new Memory(), name => opts.programs?.[name]).runTop(parseProgram(source))
  } catch (e) {
    if (!(e instanceof TiError)) throw e
    out.push(e.message)
  }
  return out
}
