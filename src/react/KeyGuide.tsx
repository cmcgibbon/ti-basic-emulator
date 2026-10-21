import type React from 'react'
import { LCD_BG } from '../display/screen'

// A quick-start card for writing a first TI-BASIC program: a short Hello World
// walkthrough, the commands this calculator understands (each with an example
// and a one-line explanation), plus the keys and typing shortcuts. Deeper
// detail (key codes, every command) is linked out to the TI-Basic Developer
// wiki. Styled like the TI's printed guides: LCD-green paper, dark ink, code
// set in a keycap face.

const INK = '#141812'
const RULE = 'rgba(20,24,18,0.25)'
const CODE_FONT = '"Courier New", Courier, monospace'

type Row = [code: string, meaning: string]

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'SHOW THINGS',
    rows: [
      ['Disp "HI",A', 'Show the text HI, then variable A’s value, each on its own line'],
      ['Output(2,5,"HI")', 'Write HI at row 2, column 5 (rows 1–8, columns 1–16)'],
      ['ClrHome', 'Clear the screen'],
      ['Pause', 'Wait until Enter is pressed'],
    ],
  },
  {
    title: 'ASK THE USER',
    rows: [
      ['Input "AGE?",A', 'Ask AGE? and store the answer in variable A'],
      ['Prompt A,B', 'Ask A=? then B=?, storing each answer'],
      ['getKey→K', 'Store the last key pressed in K, as a number (0 if none)'],
    ],
  },
  {
    title: 'VARIABLES',
    rows: [
      ['5→A', 'Store 5 in variable A (A–Z and θ hold numbers)'],
      ['"HI"→Str1', 'Store text in Str1 (Str0–Str9 hold text)'],
      ['{1,2,3}→L1', 'Store a list in L1; L1(2) is its second item'],
    ],
  },
  {
    title: 'DECISIONS & LOOPS',
    rows: [
      ['If A>5:Disp "BIG"', 'Run only the next line, if the test is true'],
      ['If A>5:Then … Else … End', 'Run one block if true, the other if not'],
      ['For(I,1,10) … End', 'Repeat with I counting from 1 to 10'],
      ['While A<10 … End', 'Repeat while the test is true'],
      ['Repeat K … End', 'Repeat until the test is true (always runs once)'],
    ],
  },
  {
    title: 'JUMPING AROUND',
    rows: [
      ['Lbl A … Goto A', 'Mark a spot named A, then jump back to it'],
      ['Menu("PICK","GO",A,"QUIT",B)', 'Show a menu; GO jumps to Lbl A, QUIT to Lbl B'],
      ['Stop', 'End the program'],
      ['prgmNAME', 'Run another program, then continue'],
    ],
  },
  {
    title: 'MATH & TEXT',
    rows: [
      ['√(X)  X²  X^3', 'Square root, square, power'],
      ['abs( int( round(X,2)', 'Absolute value, round down, round to 2 places'],
      ['randInt(1,6)', 'A random whole number from 1 to 6'],
      ['min( max( remainder(', 'Smaller, larger, remainder after dividing'],
      ['=  ≠  <  >  and  or', 'Tests: give 1 if true, 0 if false'],
      ['"AB"+"CD"  sub(S,1,2)', 'Join text; take 2 characters from position 1'],
      ['length( inString(', 'Length of text; position of text within it'],
    ],
  },
  {
    title: 'KEYS',
    rows: [
      ['↑ ↓ ← →', 'Move through menus'],
      ['Enter', 'Select, run, or answer a question'],
      ['Esc', 'Go back · stop a running program'],
      ['Backspace / Delete', 'Delete a character / clear the line'],
      ['Shift', '2nd'],
      ['Enter on a blank line', 'Run the last thing again'],
    ],
  },
  {
    title: 'TYPING SYMBOLS',
    rows: [
      ['->', '→  store'],
      ['sqrt(', '√('],
      ['!=  <=  >=', '≠  ≤  ≥'],
      ['pi  theta', 'π  θ'],
      ['L1 … L6', 'L₁ … L₆'],
      ['^-1', 'x⁻¹  (1 divided by x)'],
      // Described rather than shown: the TI's raised negative sign renders as a
      // speck in the guide's font
      ['~5', 'Negative 5 (typing -5 works too)'],
    ],
  },
]

const LINKS: [label: string, href: string][] = [
  ['TI-Basic Starter Kit — a beginner’s guide', 'https://tibasicdev.wikidot.com/starter-kit'],
  ['Every command, explained', 'https://tibasicdev.wikidot.com/commands'],
  ['getKey key codes', 'https://tibasicdev.wikidot.com/key-codes'],
]

const code: React.CSSProperties = { fontFamily: CODE_FONT, fontWeight: 'bold' }

/** Inline code / key name */
function K({ children }: { children: React.ReactNode }) {
  return <span style={code}>{children}</span>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12, fontWeight: 'bold', fontSize: 11, letterSpacing: 1.5, borderBottom: `1px solid ${INK}`, paddingBottom: 2, marginBottom: 2 }}>
      {children}
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <table style={{
        // 98.css restyles every <table> as a Win98 list view; reset what it sets
        width: '100%', borderCollapse: 'collapse', background: 'transparent', whiteSpace: 'normal',
        fontFamily: 'inherit', fontSize: 'inherit', WebkitFontSmoothing: 'auto',
      }}>
        <tbody>
          {rows.map(([c, meaning]) => (
            <tr key={c} style={{ borderBottom: `1px dotted ${RULE}` }}>
              <td style={{ ...code, padding: '3px 10px 3px 0', height: 'auto', verticalAlign: 'top', width: '46%', wordBreak: 'break-word' }}>
                {c}
              </td>
              <td style={{ padding: '3px 0', height: 'auto', verticalAlign: 'top' }}>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function KeyGuide({ onClose }: { onClose: () => void }) {
  return (
    // Backdrop: a click outside the card closes it
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
      }}
    >
      <div
        role="dialog"
        aria-label="TI-BASIC guide"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 420, maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
          background: LCD_BG, color: INK, borderRadius: 4, padding: '12px 16px 14px',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.35)',
          fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 'bold', fontSize: 14, letterSpacing: 2 }}>TI-BASIC QUICK GUIDE</span>
          <button
            type="button"
            aria-label="Close guide"
            onClick={onClose}
            style={{
              // 98.css button reset
              minWidth: 'unset', minHeight: 'unset', padding: 0, border: 'none', boxShadow: 'none', textShadow: 'none',
              background: 'none', color: INK, fontSize: 18, lineHeight: 1, cursor: 'pointer', outline: 'none',
            }}
          >
            ×
          </button>
        </div>

        <SectionTitle>YOUR FIRST PROGRAM</SectionTitle>
        <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
          <li>Press <K>→</K> twice to <K>NEW</K>, then <K>Enter</K> on <K>Create New</K></li>
          <li>Type <K>HELLO</K> as the name and press <K>Enter</K></li>
          <li>Type <K>Disp "HELLO WORLD"</K></li>
          <li>Press <K>Esc</K> to save</li>
          <li>On <K>EXEC</K>, pick <K>HELLO</K> and press <K>Enter</K> twice to run it</li>
        </ol>

        {SECTIONS.map(s => <Section key={s.title} {...s} />)}

        <SectionTitle>LEARN MORE</SectionTitle>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {LINKS.map(([label, href]) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 'bold' }}>{label}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
