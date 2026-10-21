import { toCells } from './display/font'
import { COLS, ROWS, TextScreen } from './display/screen'
import { keyCode } from './keys'
import { normalizeSource } from './lang/tokenizer'
import { parseProgram } from './lang/parser'
import { Interpreter, Memory, type ProgramIO } from './lang/interpreter'
import { TiError, formatValue, isStr, type Value } from './lang/values'

/**
 * Keys the calculator understands. The window maps the computer keyboard onto
 * these: the arrows, Enter, Escape (back / break, like QUIT and ON), Backspace
 * (DEL), Clear, 2nd, or a single typed character.
 */
export type CalcKey = 'Up' | 'Down' | 'Left' | 'Right' | 'Enter' | 'Escape' | 'Backspace' | 'Clear' | '2nd' | string

/**
 * prgm    — the PRGM menu
 * home    — typing an entry on the home screen
 * running — a program or entry is executing (keys go to getKey / Input / Pause)
 * overlay — a full-screen Menu( or error screen, drawn over the home screen
 */
type Mode = 'prgm' | 'home' | 'running' | 'overlay'

const TABS = ['EXEC', 'EDIT', 'NEW'] as const
const MENU_ROWS = ROWS - 1  // row 0 holds the tab / menu title

/** The key shown beside the nth menu item: 1–9, then 0, then A–Z, then θ. */
function menuKey(i: number): string {
  if (i < 9) return String(i + 1)
  if (i === 9) return '0'
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZθ'[i - 10] ?? ' '
}

/** A program the calculator holds: name (up to 8 letters/digits, starting with a letter) and TI-BASIC source */
export interface TiProgram {
  name: string
  source: string
}

/** What a running program is waiting on, if anything */
type Waiting =
  | { kind: 'input'; prompt: string; buffer: string; resolve: (s: string) => void; reject: (e: unknown) => void }
  | { kind: 'pause'; resolve: () => void; reject: (e: unknown) => void }
  | { kind: 'menu'; title: string; items: string[]; sel: number; resolve: (i: number) => void; reject: (e: unknown) => void }
  | { kind: 'error'; code: string }

/**
 * The calculator's state outside of React: which screen is showing, the menus,
 * the home screen's contents, and the program interpreter. Every change updates
 * the screen buffers and then notifies subscribers so the window can repaint.
 */
export class TiCalculator implements ProgramIO {
  /** This session's programs; edits and new programs live here until the calculator is discarded */
  programs: TiProgram[]

  private listeners = new Set<() => void>()
  private mode: Mode = 'prgm'

  // PRGM menu
  private prgmScreen = new TextScreen()
  private tab = 0
  private sel = 0
  private top = 0  // first item shown in the visible window

  // Home screen — kept separate so leaving the menu restores what was there
  private home = new TextScreen()
  private row = 0        // the line the next Disp / entry goes on
  private entry = ''
  private lastEntry = ''

  // Menu( and error screens
  private overlay = new TextScreen()

  // Running programs
  private memory = new Memory()
  private interpreter = new Interpreter(this, this.memory, name => this.programs.find(p => p.name === name)?.source)
  private waiting: Waiting | null = null
  private lastKey = 0
  private breakFlag = false

  /** @param programs the programs to start with — copied, so the caller's array is never changed */
  constructor(programs: TiProgram[] = []) {
    this.programs = programs.map(p => ({ ...p }))
    this.renderMenu()
    this.renderEntry()
  }

  /** Call fn after every change to the screen; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private changed() {
    for (const fn of this.listeners) fn()
  }

  get screen(): TextScreen {
    switch (this.mode) {
      case 'prgm': return this.prgmScreen
      case 'overlay': return this.overlay
      default: return this.home
    }
  }

  key(k: CalcKey) {
    switch (this.mode) {
      case 'prgm': this.menuKeyPress(k); break
      case 'home': this.homeKeyPress(k); break
      case 'running': this.runningKeyPress(k); break
      case 'overlay': this.overlayKeyPress(k); break
    }
    this.changed()
  }

  // ── PRGM menu ──────────────────────────────────────────────────────────────

  private sortedPrograms(): TiProgram[] {
    return [...this.programs].sort((a, b) => a.name.localeCompare(b.name))
  }

  private menuItems(): string[] {
    return TABS[this.tab] === 'NEW' ? ['Create New'] : this.sortedPrograms().map(p => p.name)
  }

  private menuKeyPress(k: CalcKey) {
    const items = this.menuItems()
    switch (k) {
      case 'Left':
      case 'Right':
        this.tab = (this.tab + (k === 'Right' ? 1 : TABS.length - 1)) % TABS.length
        this.sel = 0
        this.top = 0
        break
      case 'Up':
      case 'Down':
        if (items.length === 0) break
        // Wraps top↔bottom like the real menus
        this.sel = (this.sel + (k === 'Down' ? 1 : items.length - 1)) % items.length
        if (this.sel < this.top) this.top = this.sel
        if (this.sel >= this.top + MENU_ROWS) this.top = this.sel - MENU_ROWS + 1
        break
      case 'Enter':
        this.activate(this.sel)
        return
      case 'Escape':
        this.mode = 'home'
        return
      default: {
        // Pressing an item's number/letter selects and opens it immediately
        const i = items.findIndex((_, idx) => menuKey(idx) === k.toUpperCase())
        if (i >= 0) { this.activate(i); return }
      }
    }
    this.renderMenu()
  }

  private activate(i: number) {
    const tab = TABS[this.tab]
    if (tab === 'EXEC') {
      const program = this.sortedPrograms()[i]
      if (!program) return
      // Like the real EXEC: paste "prgmNAME" onto the home screen; Enter runs it
      this.mode = 'home'
      this.entry += `prgm${program.name}`
      this.renderEntry()
    }
    // EDIT and NEW open the program editor — added with the editor
  }

  private renderMenu() {
    const s = this.prgmScreen
    s.clear()
    let col = 0
    TABS.forEach((name, i) => {
      s.write(0, col, name, i === this.tab)
      col += name.length + 1
    })
    this.renderMenuItems(s, this.menuItems(), this.sel, this.top)
  }

  /** Numbered menu rows 1–7, shared by PRGM and Menu( */
  private renderMenuItems(s: TextScreen, items: string[], sel: number, top: number) {
    for (let row = 0; row < MENU_ROWS; row++) {
      const i = top + row
      if (i >= items.length) break
      const moreBelow = row === MENU_ROWS - 1 && i < items.length - 1
      const moreAbove = row === 0 && top > 0
      const sep = moreBelow ? '↓' : moreAbove ? '↑' : ':'
      s.write(row + 1, 0, menuKey(i) + sep, i === sel)
      s.write(row + 1, 2, items[i])
    }
  }

  // ── Home screen ────────────────────────────────────────────────────────────

  private homeKeyPress(k: CalcKey) {
    switch (k) {
      case 'Escape':
        this.mode = 'prgm'
        this.renderMenu()
        return
      case 'Backspace':
        this.entry = toCells(this.entry).slice(0, -1).join('')
        break
      case 'Clear':
        // CLEAR empties the entry line; on an empty line it clears the screen
        if (this.entry) this.entry = ''
        else { this.home.clear(); this.row = 0 }
        break
      case 'Enter':
        // ENTER on a blank line re-runs the previous entry, as on the calculator
        if (!this.entry && this.lastEntry) { this.entry = this.lastEntry; this.renderEntry() }
        if (this.entry) void this.execute()
        return
      case 'Up': case 'Down': case 'Left': case 'Right': case '2nd':
        return
      default:
        if (k.length > 0 && !['Enter', 'Escape'].includes(k)) {
          // Turn typed stand-ins into TI symbols as they complete (-> becomes →)
          this.entry = normalizeSource(this.entry + k)
        }
    }
    this.renderEntry()
  }

  /** Lay the entry line out from the current row, wrapping every 16 cells, with the cursor after it. */
  private renderEntry() {
    const s = this.home
    const cells = toCells(this.entry)
    const rowsNeeded = Math.floor(cells.length / COLS) + 1
    while (this.row + rowsNeeded > ROWS) {
      s.scrollUp()
      this.row--
    }
    for (let r = this.row; r < ROWS; r++) s.write(r, 0, ' '.repeat(COLS))
    cells.forEach((ch, i) => s.write(this.row + Math.floor(i / COLS), i % COLS, ch))
    s.cursor = { row: this.row + Math.floor(cells.length / COLS), col: cells.length % COLS }
  }

  /** Move to a fresh line below `lines` rows of output, scrolling the screen if needed. */
  private advance(lines = 1) {
    this.row += lines
    while (this.row >= ROWS) {
      this.home.scrollUp()
      this.row--
    }
  }

  /** Print one line at the current row: numbers right-aligned, text left-aligned, as Disp does */
  private printLine(v: Value) {
    let cells = toCells(formatValue(v))
    if (cells.length > COLS) cells = [...cells.slice(0, COLS - 1), '…']
    const col = isStr(v) ? 0 : COLS - cells.length
    if (this.row >= ROWS) this.advance(0)
    this.home.write(this.row, 0, ' '.repeat(COLS))
    this.home.write(this.row, col, cells.join(''))
    this.advance()
  }

  /** Run the entry line: a prgm call, or anything else as a one-line program */
  private async execute() {
    const entry = this.entry
    this.lastEntry = entry
    this.home.cursor = null
    this.advance(Math.floor(toCells(entry).length / COLS) + 1)
    this.entry = ''

    this.mode = 'running'
    this.breakFlag = false
    this.lastKey = 0
    this.changed()

    try {
      const prgm = /^prgm(\S+)$/.exec(entry.trim())
      let stmts
      if (prgm) {
        if (!this.programs.some(p => p.name === prgm[1])) throw new TiError('UNDEFINED')
        stmts = parseProgram(`prgm${prgm[1]}`)
      } else {
        stmts = parseProgram(entry)
      }
      await this.interpreter.runTop(stmts)
      // Like the TI: a run that ends on an expression shows its value, anything else shows Done
      if (this.interpreter.lastWasExpr) this.printLine(this.memory.ans)
      else this.printLine(' '.repeat(COLS - 4) + 'Done')
      this.mode = 'home'
      this.renderEntry()
    } catch (e) {
      this.waiting = null
      this.showError(e instanceof TiError ? e.code : 'SYNTAX')
    }
    this.changed()
  }

  // ── While a program runs ───────────────────────────────────────────────────

  private runningKeyPress(k: CalcKey) {
    // ON (Esc) breaks the program at once, even mid-Input
    if (k === 'Escape') {
      this.breakFlag = true
      const w = this.waiting
      if (w && w.kind !== 'error') w.reject(new TiError('BREAK'))
      return
    }

    const w = this.waiting
    if (w?.kind === 'input') {
      if (k === 'Enter') {
        this.waiting = null
        this.home.cursor = null
        this.advance(Math.floor(toCells(w.prompt + w.buffer).length / COLS) + 1)
        w.resolve(w.buffer)
        return
      }
      if (k === 'Backspace') w.buffer = toCells(w.buffer).slice(0, -1).join('')
      else if (k === 'Clear') w.buffer = ''
      else if (k.length === 1 || toCells(k).length === 1) w.buffer = normalizeSource(w.buffer + k)
      this.renderInput()
      return
    }
    if (w?.kind === 'pause') {
      if (k === 'Enter') { this.waiting = null; w.resolve() }
      return
    }
    // Otherwise the key is waiting for getKey (the TI remembers only the latest)
    const code = keyCode(k)
    if (code) this.lastKey = code
  }

  private renderInput() {
    const w = this.waiting
    if (w?.kind !== 'input') return
    const cells = toCells(w.prompt + w.buffer)
    while (this.row + Math.floor(cells.length / COLS) >= ROWS) {
      this.home.scrollUp()
      this.row--
    }
    for (let r = this.row; r < ROWS; r++) this.home.write(r, 0, ' '.repeat(COLS))
    cells.forEach((ch, i) => this.home.write(this.row + Math.floor(i / COLS), i % COLS, ch))
    this.home.cursor = { row: this.row + Math.floor(cells.length / COLS), col: cells.length % COLS }
  }

  // ── ProgramIO: what the interpreter calls ──────────────────────────────────

  disp(v: Value) {
    this.printLine(v)
    this.changed()
  }

  output(row: number, col: number, v: Value) {
    if (row < 1 || row > ROWS || col < 1 || col > COLS) throw new TiError('DOMAIN')
    // Output( wraps onto following lines and stops at the bottom-right corner
    const cells = toCells(formatValue(v))
    let r = row - 1, c = col - 1
    for (const ch of cells) {
      if (r >= ROWS) break
      this.home.write(r, c, ch)
      if (++c >= COLS) { c = 0; r++ }
    }
    this.changed()
  }

  clrHome() {
    this.home.clear()
    this.row = 0
    this.changed()
  }

  input(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiting = { kind: 'input', prompt, buffer: '', resolve, reject }
      this.renderInput()
      this.changed()
    })
  }

  pause(v: Value | null): Promise<void> {
    if (v !== null) this.printLine(v)
    this.changed()
    return new Promise((resolve, reject) => {
      this.waiting = { kind: 'pause', resolve, reject }
    })
  }

  menu(title: string, items: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
      this.waiting = { kind: 'menu', title, items, sel: 0, resolve, reject }
      this.mode = 'overlay'
      this.renderOverlayMenu()
      this.changed()
    })
  }

  getKey(): number {
    const k = this.lastKey
    this.lastKey = 0
    return k
  }

  breakRequested(): boolean {
    return this.breakFlag
  }

  // ── Menu( and error screens ────────────────────────────────────────────────

  private renderOverlayMenu() {
    const w = this.waiting
    if (w?.kind !== 'menu') return
    const s = this.overlay
    s.clear()
    // The title fills the top row, highlighted
    s.write(0, 0, w.title.slice(0, COLS).padEnd(COLS), true)
    this.renderMenuItems(s, w.items, w.sel, 0)
  }

  private showError(code: string) {
    this.waiting = { kind: 'error', code }
    this.mode = 'overlay'
    const s = this.overlay
    s.clear()
    s.write(0, 0, `ERR:${code}`)
    s.write(1, 0, '1:', true)
    s.write(1, 2, 'Quit')
  }

  private overlayKeyPress(k: CalcKey) {
    const w = this.waiting
    if (w?.kind === 'menu') {
      if (k === 'Escape') { this.breakFlag = true; this.waiting = null; this.mode = 'running'; w.reject(new TiError('BREAK')); return }
      let choice = -1
      if (k === 'Up' || k === 'Down') {
        w.sel = (w.sel + (k === 'Down' ? 1 : w.items.length - 1)) % w.items.length
        this.renderOverlayMenu()
      } else if (k === 'Enter') choice = w.sel
      else choice = w.items.findIndex((_, i) => menuKey(i) === k.toUpperCase())
      if (choice >= 0) {
        this.waiting = null
        this.mode = 'running'
        w.resolve(choice)
      }
      return
    }
    if (w?.kind === 'error') {
      // 1:Quit — back to a fresh line on the home screen
      if (k === 'Enter' || k === '1' || k === 'Escape') {
        this.waiting = null
        this.mode = 'home'
        this.renderEntry()
      }
    }
  }
}
