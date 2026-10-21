// ti-basic-emulator — a TI-84 Plus style TI-BASIC interpreter and calculator.
//
// Most projects only need the React component:
//   import { TiBasic } from 'ti-basic-emulator'
//
// The calculator and the language core work without React too, e.g. to run
// TI-BASIC in Node or drive your own UI.

// React component
export { default as TiBasic, type TiBasicProps } from './react/TiBasic'

// Calculator (menus, home screen, running programs) — UI-agnostic
export { TiCalculator, type TiProgram, type CalcKey } from './calculator'

// Display: the 16×8 text screen and its LCD renderer
export { TextScreen, drawLcd, COLS, ROWS, LCD_W, LCD_H } from './display/screen'

// Language core: parse and run TI-BASIC with your own I/O
export { parseProgram, parseExpression, type Stmt, type Expr } from './lang/parser'
export { Interpreter, Memory, type ProgramIO } from './lang/interpreter'
export { TiError, formatNumber, formatValue, type Value, type ErrorCode } from './lang/values'
export { normalizeSource } from './lang/tokenizer'
export { keyCode } from './keys'
