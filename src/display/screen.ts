import { CELL_H, CELL_W, glyph, toCells } from './font'

// The TI-84 Plus home screen: a 96×64 LCD showing a 16×8 grid of character cells.
export const COLS = 16
export const ROWS = 8
export const LCD_W = COLS * CELL_W  // 96
export const LCD_H = ROWS * CELL_H  // 64

// Muted grey-green LCD, like the original monochrome TI-84 Plus
export const LCD_BG = '#b3bfa1'
const LCD_GHOST  = '#a7b394'  // the faint grid between pixels
const LCD_SHADOW = '#97a386'  // each lit pixel's shadow on the reflector behind it
const LCD_INK    = '#141812'

/**
 * Everything the screen shows, as character cells. Menus, the home screen and
 * running programs all draw by writing into this buffer; the canvas only ever
 * renders it, so the display is always exactly 16 columns by 8 rows.
 */
export class TextScreen {
  cells: string[][] = []
  inverted: boolean[][] = []
  /** Blinking cursor position, or null for none */
  cursor: { row: number; col: number } | null = null

  constructor() { this.clear() }

  clear() {
    this.cells = Array.from({ length: ROWS }, () => Array<string>(COLS).fill(' '))
    this.inverted = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false))
    this.cursor = null
  }

  /** Write text starting at (row, col), clipped at the right edge. */
  write(row: number, col: number, text: string, invert = false) {
    if (row < 0 || row >= ROWS) return
    for (const ch of toCells(text)) {
      if (col >= COLS) break
      if (col >= 0) { this.cells[row][col] = ch; this.inverted[row][col] = invert }
      col++
    }
  }

  /** Shift every row up one and blank the bottom row — the home screen's scroll. */
  scrollUp() {
    this.cells.shift(); this.inverted.shift()
    this.cells.push(Array<string>(COLS).fill(' '))
    this.inverted.push(Array<boolean>(COLS).fill(false))
  }
}

/**
 * Draw the screen at an integer scale. At 3× and up, unlit pixels are drawn a
 * little smaller so the faint dot-matrix grid shows in blank areas. Lit pixels
 * always fill their whole square, so neighbouring dark pixels merge into solid
 * strokes and highlighted (inverted) text stays crisp instead of being cut up
 * by the grid — the way a real LCD looks.
 */
export function drawLcd(ctx: CanvasRenderingContext2D, screen: TextScreen, scale: number, cursorOn: boolean) {
  const gap = scale >= 3 ? 1 : 0
  const dot = scale - gap

  ctx.fillStyle = LCD_BG
  ctx.fillRect(0, 0, LCD_W * scale, LCD_H * scale)

  const pixels: boolean[][] = Array.from({ length: LCD_H }, () => Array<boolean>(LCD_W).fill(false))
  // Pixels inside a highlighted cell or the cursor block — see the shadow pass
  const solid: boolean[][] = Array.from({ length: LCD_H }, () => Array<boolean>(LCD_W).fill(false))
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isCursor = cursorOn && screen.cursor?.row === r && screen.cursor?.col === c
      const rows = glyph(screen.cells[r][c])
      const invert = screen.inverted[r][c] !== isCursor  // the cursor is a solid block over its cell
      for (let y = 0; y < CELL_H; y++) {
        const bits = y < rows.length ? rows[y] : 0
        for (let x = 0; x < CELL_W; x++) {
          // Glyphs sit in columns 1–5 with the blank column on the left, as on
          // the real calculator — so highlighted text keeps a dark edge before
          // its first letter, and text never touches the screen's left edge
          const on = x >= 1 && ((bits >> (5 - x)) & 1) === 1
          pixels[r * CELL_H + y][c * CELL_W + x] = on !== invert
          solid[r * CELL_H + y][c * CELL_W + x] = invert
        }
      }
    }
  }

  // Unlit pixels: the faint dot grid
  ctx.fillStyle = LCD_GHOST
  for (let y = 0; y < LCD_H; y++) {
    for (let x = 0; x < LCD_W; x++) {
      if (!pixels[y][x]) ctx.fillRect(x * scale, y * scale, dot, dot)
    }
  }

  // On a passive LCD the crystal layer sits above the reflector, so every dark
  // pixel casts a faint shadow down and to the right. It is most of what makes
  // the screen read as a real LCD rather than a flat image. Skipped inside
  // highlighted cells: there the letters are thin holes of unlit pixels, and
  // shadow falling into them blurs the text.
  const offset = Math.max(1, Math.round(scale / 4))
  ctx.fillStyle = LCD_SHADOW
  for (let y = 0; y < LCD_H; y++) {
    for (let x = 0; x < LCD_W; x++) {
      if (pixels[y][x] && !solid[y][x]) ctx.fillRect(x * scale + offset, y * scale + offset, scale, scale)
    }
  }

  // Lit pixels fill their whole square so neighbours merge into solid strokes
  ctx.fillStyle = LCD_INK
  for (let y = 0; y < LCD_H; y++) {
    for (let x = 0; x < LCD_W; x++) {
      if (pixels[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}
