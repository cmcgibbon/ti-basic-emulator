import { expect, it } from 'vitest'
import { parseProgram, Interpreter, Memory, type ProgramIO } from '../src'

// The interpreter runs on its own, without React or the calculator UI
it('core runs without React', async () => {
  const shown: unknown[] = []
  const io: ProgramIO = {
    disp: v => shown.push(v),
    output: () => {},
    clrHome: () => {},
    input: async () => '42',
    pause: async () => {},
    menu: async () => 0,
    getKey: () => 0,
    breakRequested: () => false,
  }
  await new Interpreter(io, new Memory(), () => undefined).runTop(parseProgram('Disp 6*7'))
  expect(shown).toEqual([42])
})
