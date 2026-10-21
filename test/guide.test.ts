import { describe, expect, it } from 'vitest'
import { run } from './harness'

// Every example in the in-app quick guide (src/react/KeyGuide.tsx) must do
// what the guide says it does.

describe('quick guide examples', () => {
  it.each<[string, string, string[], { inputs?: string[]; keys?: number[] }?]>([
    ['Disp "HI",A', '7→A:Disp "HI",A', ['HI', '7']],
    ['Output(2,5,"HI")', 'Output(2,5,"HI")', ['@2,5:HI']],
    ['Pause', 'Pause', ['<pause>']],
    ['Input "AGE?",A', 'Input "AGE?",A:Disp A', ['AGE?12', '12'], { inputs: ['12'] }],
    ['Prompt A,B', 'Prompt A,B:Disp A,B', ['A=?1', 'B=?2', '1', '2'], { inputs: ['1', '2'] }],
    ['getKey→K', 'getKey→K:Disp K', ['105'], { keys: [105] }],
    ['5→A', '5→A:Disp A', ['5']],
    ['"HI"→Str1', '"HI"→Str1:Disp Str1', ['HI']],
    ['{1,2,3}→L1, L1(2)', '{1,2,3}→L1:Disp L1(2)', ['2']],
    ['If (true)', '6→A:If A>5:Disp "BIG":Disp "NEXT"', ['BIG', 'NEXT']],
    ['If (false)', '2→A:If A>5:Disp "BIG":Disp "NEXT"', ['NEXT']],
    ['If/Then/Else/End', '2→A:If A>5:Then:Disp "BIG":Else:Disp "SMALL":End', ['SMALL']],
    ['For(I,1,10)', 'For(I,1,10):End:Disp I', ['11']],
    ['While A<10', '0→A:While A<10:A+1→A:End:Disp A', ['10']],
    ['Repeat K', 'Repeat K:getKey→K:End:Disp K', ['93'], { keys: [0, 93] }],
    ['Lbl/Goto', '0→A:Lbl A:A+1→A:If A<3:Goto A:Disp A', ['3']],
    ['Menu( GO/QUIT', 'Menu("PICK","GO",A,"QUIT",B):Lbl A:Disp "GO":Stop:Lbl B:Disp "QUIT"', ['<menu PICK: GO|QUIT → QUIT>', 'QUIT'], { inputs: ['2'] }],
    ['Stop', 'Disp 1:Stop:Disp 2', ['1']],
    ['√( ² ^', '4→X:Disp √(X),X²,X^3', ['2', '16', '64']],
    ['abs( int( round(', 'Disp abs(-4),int(2.7),round(3.14159,2)', ['4', '2', '3.14']],
    ['min( max( remainder(', 'Disp min(3,8),max(3,8),remainder(7,3)', ['3', '8', '1']],
    ['tests', '5→A:Disp A=5,A≠5,A<5,A>5', ['1', '0', '0', '0']],
    ['and / or', '5→A:Disp A>1 and A<9,A>9 or A<9', ['1', '1']],
    ['join + sub(', 'Disp "AB"+"CD",sub("HELLO",1,2)', ['ABCD', 'HE']],
    ['length( inString(', 'Disp length("HI"),inString("HELLO","L"),inString("HELLO","Z")', ['2', '3', '0']],
    ['typing symbols', '5->A:Disp sqrt(9),1!=2,1<=1,2>=3,round(pi,2)', ['3', '1', '1', '0', '3.14']],
    ['theta, L1, ^-1, ~', '4->theta:{9}->L1:Disp θ,L1(1),4^-1,~5', ['4', '9', '.25', '⁻5']],
    ['first program: HELLO WORLD', 'Disp "HELLO WORLD"', ['HELLO WORLD']],
  ])('%s', async (_name, src, expected, opts) => {
    expect(await run(src, opts)).toEqual(expected)
  })

  it('randInt(1,6) stays within 1–6, including both ends', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) (await run('Disp randInt(1,6)')).forEach(v => seen.add(v))
    expect([...seen].sort()).toEqual(['1', '2', '3', '4', '5', '6'])
  })
})
