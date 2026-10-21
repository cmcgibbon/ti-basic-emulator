import { describe, expect, it } from 'vitest'
import { run } from './harness'
import { parseProgram } from '../src/lang/parser'

/** The single line a Disp of this expression shows */
const show = async (expr: string) => (await run(`Disp ${expr}`))[0]

describe('expressions', () => {
  it.each([
    ['-2^2', '⁻4', 'negation binds looser than ^'],
    ['-2²', '⁻4', 'negation binds looser than ²'],
    ['2^3^2', '64', '^ is left-associative'],
    ['2(3+4)', '14', 'implied multiplication'],
    ['√(9+7', '4', 'a closing paren may be left off'],
    ['sqrt(16)', '4', 'ASCII stand-in for √('],
    ['round(pi,4)', '3.1416', 'pi stand-in'],
    ['3>2', '1', 'tests give 1/0'],
    ['(1 and 0) or 1', '1', 'and / or'],
    ['int(-2.5)+fPart(2.75)', '⁻2.25', 'int rounds down'],
    ['"AB"+"CD"', 'ABCD', 'string join'],
    ['sub("HELLO",2,3)', 'ELL', 'sub('],
    ['inString("HELLO","L")', '3', 'inString('],
    ['{1,2,3}*2', '{2 4 6}', 'list arithmetic'],
    ['expr("2+3")', '5', 'expr('],
  ])('%s → %s (%s)', async (expr, expected) => {
    expect(await show(expr)).toBe(expected)
  })
})

describe('number formatting', () => {
  it.each([
    ['1/4', '.25', 'no leading zero'],
    ['-1/2', '⁻.5', 'raised negative sign'],
    ['2/3', '.6666666667', '10 significant digits'],
    ['2^40', '1.099511628ᴇ12', 'large → scientific'],
    ['1/2000', '5ᴇ⁻4', 'small → scientific'],
  ])('%s → %s (%s)', async (expr, expected) => {
    expect(await show(expr)).toBe(expected)
  })
})

describe('variables', () => {
  it('stores into numbers, strings and lists', async () => {
    expect(await run('3→A:"YO"→Str1:{4,5,6}→L1:Disp A,Str1,L1(2),dim(L1),sum(L1)')).toEqual(['3', 'YO', '5', '3', '15'])
  })
  it('reads an unset number variable as 0', async () => {
    expect(await run('Disp Q')).toEqual(['0'])
  })
  it('grows a list when storing one past its end', async () => {
    expect(await run('{1}→L1:9→L1(2):Disp L1')).toEqual(['{1 9}'])
  })
  it('keeps an expression statement in Ans', async () => {
    expect(await run('3→A:2A+A²:Disp Ans')).toEqual(['15'])
  })
  it('allows an unterminated string at the end of a line', async () => {
    expect(await run('Disp "HI THERE')).toEqual(['HI THERE'])
  })
})

describe('control flow', () => {
  it('single-line If skips only the next statement', async () => {
    expect(await run('5→A:If A=5:Disp "YES":If A=4:Disp "NO":Disp "END"')).toEqual(['YES', 'END'])
  })
  it('If/Then/Else/End', async () => {
    expect(await run('1→A\nIf A=2\nThen\nDisp "TWO"\nElse\nDisp "NOT TWO"\nEnd')).toEqual(['NOT TWO'])
  })
  it('nested blocks', async () => {
    expect(await run('For(I,1,3)\nIf I=2:Then:Disp "MID":Else:Disp I:End\nEnd')).toEqual(['1', 'MID', '3'])
  })
  it('For( with a step, and skipped when empty', async () => {
    expect(await run('For(I,10,1,-4):Disp I:End')).toEqual(['10', '6', '2'])
    expect(await run('For(I,5,1):Disp I:End:Disp "OK"')).toEqual(['OK'])
  })
  it('While checks first; Repeat always runs once', async () => {
    expect(await run('0→A:While A<3:A+1→A:End:Disp A')).toEqual(['3'])
    expect(await run('5→A:Repeat 1:Disp A:End')).toEqual(['5'])
  })
  it('Goto out of a loop leaves the loop behind', async () => {
    const src = '0→A\nWhile 1\nA+1→A\nIf A=3:Goto Q\nEnd\nLbl Q\nIf 1:Then\nDisp A\nEnd\nDisp "DONE"'
    expect(await run(src)).toEqual(['3', 'DONE'])
  })
  it('IS>( skips the next statement past its limit', async () => {
    expect(await run('1→A:IS>(A,1):Disp "SKIPPED?":Disp A')).toEqual(['2'])
  })
  it('Menu( jumps to the chosen label', async () => {
    const out = await run('Menu("PICK","ONE",1,"TWO",2):Lbl 1:Disp "1":Stop:Lbl 2:Disp "2"', { inputs: ['2'] })
    expect(out).toEqual(['<menu PICK: ONE|TWO → TWO>', '2'])
  })
  it('subprograms: Return comes back, Stop ends everything', async () => {
    expect(await run('prgmSUB:Disp "BACK"', { programs: { SUB: 'Disp "IN SUB":Return:Disp "NO"' } })).toEqual(['IN SUB', 'BACK'])
    expect(await run('prgmSUB:Disp "NO"', { programs: { SUB: 'Disp "SUB":Stop' } })).toEqual(['SUB'])
  })
})

describe('input and output', () => {
  it('Input and Prompt', async () => {
    expect(await run('Input "X?",X:Prompt Y:Disp X+Y', { inputs: ['3', '4*2'] })).toEqual(['X?3', 'Y=?4*2', '11'])
  })
  it('Input into a string keeps the text as typed', async () => {
    expect(await run('Input "NAME?",Str1:Disp "HI "+Str1', { inputs: ['BOB'] })).toEqual(['NAME?BOB', 'HI BOB'])
  })
  it('getKey returns key codes, 0 when nothing was pressed', async () => {
    expect(await run('Repeat K:getKey→K:End:Disp K', { keys: [0, 0, 105] })).toEqual(['105'])
  })
  it('Output( and ClrHome', async () => {
    expect(await run('ClrHome:Output(3,5,"COOKIES")')).toEqual(['<clr>', '@3,5:COOKIES'])
  })
})

describe('errors', () => {
  it.each([
    ['Disp 1/0', 'ERR:DIVIDE BY 0'],
    ['Goto ZZ', 'ERR:LABEL'],
    ['Disp "A"+1', 'ERR:DATA TYPE'],
    ['Disp √(-1)', 'ERR:NONREAL ANS'],
  ])('%s → %s', async (src, expected) => {
    expect(await run(src)).toEqual([expected])
  })
  it('a syntax error only fires when execution reaches it', async () => {
    expect(await run('Disp "OK":Disp 1+*2')).toEqual(['OK', 'ERR:SYNTAX'])
    expect(parseProgram('Disp 1+*2')[0].s).toBe('syntaxError')
  })
})

describe('programs', () => {
  it('quadratic formula', async () => {
    const src = 'Prompt A,B,C\nB²-4AC→D\nIf D<0:Then\nDisp "NO REAL ROOTS"\nElse\nDisp (-B+√(D))/(2A),(-B-√(D))/(2A)\nEnd'
    expect(await run(src, { inputs: ['1', '-3', '2'] })).toEqual(['A=?1', 'B=?-3', 'C=?2', '2', '1'])
  })
})

describe('pacing', () => {
  it('runs at roughly TI-84 speed rather than instantly', async () => {
    const t = performance.now()
    expect(await run('For(I,1,250):End:Disp I')).toEqual(['251'])
    // 251 statements at ~2500/s ≈ 100ms
    expect(performance.now() - t).toBeGreaterThan(70)
  })
})
