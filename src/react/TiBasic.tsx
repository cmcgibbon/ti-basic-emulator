import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { TiCalculator, type CalcKey, type TiProgram } from '../calculator'
import { LCD_BG, LCD_H, LCD_W, drawLcd } from '../display/screen'
import KeyGuide from './KeyGuide'

// Computer keyboard → calculator keys. Escape is "back" everywhere (QUIT out of
// a menu, ON to break a running program); Delete is CLEAR and Shift is 2nd.
const KEY_MAP: Record<string, CalcKey> = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Clear', Shift: '2nd',
}

// Calculator keys that have an on-screen button
const BUTTON_KEYS: Record<string, true> = { Up: true, Down: true, Left: true, Right: true, Enter: true, Escape: true }

// Kept in the hidden text field so Backspace on a phone keyboard has something
// to delete — see handleInput
const SENTINEL = ' '

const BODY   = 'linear-gradient(180deg, #2d2f34 0%, #232529 100%)'  // TI-84 Plus charcoal plastic
const BEZEL  = 'linear-gradient(180deg, #1b1c20 0%, #111215 100%)'
const SILVER = '#d6d8dc'
const ARROW  = 22   // arrow key size
const PAD_GAP = 3
const PAD_W  = 3 * ARROW + 2 * PAD_GAP
const PAD_H  = 2 * ARROW + PAD_GAP  // ↑ and ↓ stacked
const WIDE_W = 68   // ENTER / ESC
const WIDE_H = 30
const BEZEL_PAD = 10
const MARGIN = 2    // blank LCD border around the pixel area, in LCD pixels

// Keys styled as the TI-84 Plus's molded charcoal plastic: a slightly curved
// face (top-lit gradient + thin highlight along the top edge), a dark skirt
// and soft shadow underneath where the key stands off the faceplate. Pressing
// sinks it 1px, tightens the shadow and darkens the face.
const KEY_FACE         = 'linear-gradient(180deg, #5d6068 0%, #44474e 55%, #383a40 100%)'
const KEY_FACE_PRESSED = 'linear-gradient(180deg, #4a4d54 0%, #3a3c42 60%, #323439 100%)'
const KEY_RAISED  = '0 2px 0 #121316, 0 3px 5px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2)'
const KEY_SUNK    = '0 1px 0 #121316, 0 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.35)'
const KEY_LABEL   = '#eef0f3'

// Arrow keys repeat while held, like holding a key on the real calculator
const REPEATING = new Set<CalcKey>(['Up', 'Down', 'Left', 'Right'])
const REPEAT_DELAY = 400
const REPEAT_EVERY = 70

function Arrow({ dir }: { dir: 'Up' | 'Down' | 'Left' | 'Right' }) {
  const points = { Up: '5,1 9,8 1,8', Down: '1,2 9,2 5,9', Left: '1,5 8,1 8,9', Right: '2,1 9,5 2,9' }[dir]
  return (
    <svg width={7} height={7} viewBox="0 0 10 10" aria-hidden="true" style={{ display: 'block' }}>
      <polygon points={points} fill="currentColor" />
    </svg>
  )
}

function CalcButton({ calcKey, label, ariaLabel, width, height, pressed, onPress, onRelease, radius = 5 }: {
  calcKey: CalcKey
  label: React.ReactNode
  ariaLabel: string
  radius?: number | string
  width: number
  height: number
  pressed: boolean
  onPress: (k: CalcKey) => void
  onRelease: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      // Never take focus from the calculator, so the keyboard keeps working
      tabIndex={-1}
      onMouseDown={e => e.preventDefault()}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onPress(calcKey) }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      style={{
        // 98.css restyles every <button>; reset what it sets
        minWidth: 'unset', minHeight: 'unset', padding: 0, border: 'none', textShadow: 'none',
        width, height, borderRadius: radius, color: KEY_LABEL,
        background: pressed ? KEY_FACE_PRESSED : KEY_FACE,
        boxShadow: pressed ? KEY_SUNK : KEY_RAISED,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 'bold', fontSize: 11, letterSpacing: 0.5,
        transform: pressed ? 'translateY(1px)' : 'none',
        cursor: 'pointer', outline: 'none', touchAction: 'none', userSelect: 'none',
      }}
    >
      {label}
    </button>
  )
}

export interface TiBasicProps {
  /** Programs listed in the PRGM menu. Read once when the component mounts. */
  programs?: TiProgram[]
  /**
   * Image shown top-right on the calculator face (e.g. a logo), drawn white.
   * None ships with the package — TI's logo is their trademark.
   */
  logoSrc?: string
}

export default function TiBasic({ programs = [], logoSrc }: TiBasicProps) {
  // One calculator per mounted component; its programs live as long as it does
  const [calc] = useState(() => new TiCalculator(programs))
  const rootRef   = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(4)
  // Which on-screen key looks pressed — from the pointer or the matching keyboard key
  const [pressed, setPressed] = useState<CalcKey | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const repeat = useRef<{ delay?: number; every?: number }>({})

  // Two sizes only: 4× on desktop, 3× when the window is too narrow for that
  // (phones). Whole numbers keep every LCD pixel square.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const fit = () => {
      const avail = root.clientWidth - 2 * 18 - 2 * 10 - 2 * MARGIN * 4  // body padding, bezel, LCD margin
      setScale(avail >= LCD_W * 4 ? 4 : 3)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  // Repaint whenever the calculator changes, plus a blinking cursor
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = LCD_W * scale * dpr
    canvas.height = LCD_H * scale * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let cursorOn = true
    let frame = 0
    const paint = () => {
      frame = 0
      drawLcd(ctx, calc.screen, scale, cursorOn)
    }
    // Coalesce bursts of changes (a running program can redraw many times a frame)
    const requestPaint = () => { if (!frame) frame = requestAnimationFrame(paint) }
    const unsubscribe = calc.subscribe(() => { cursorOn = true; requestPaint() })

    const blink = setInterval(() => {
      cursorOn = !cursorOn
      if (calc.screen.cursor) requestPaint()
    }, 500)

    paint()
    return () => {
      clearInterval(blink)
      cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [calc, scale])

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])

  function stopRepeat() {
    clearTimeout(repeat.current.delay)
    clearInterval(repeat.current.every)
    repeat.current = {}
  }
  useEffect(() => stopRepeat, [])

  function pressButton(k: CalcKey) {
    stopRepeat()
    setPressed(k)
    calc.key(k)
    if (REPEATING.has(k)) {
      repeat.current.delay = window.setTimeout(() => {
        repeat.current.every = window.setInterval(() => calc.key(k), REPEAT_EVERY)
      }, REPEAT_DELAY)
    }
  }

  function releaseButton() {
    stopRepeat()
    setPressed(null)
  }

  // Physical keyboards report every key here. Handling it and preventing the
  // default means the hidden field's text never changes on desktop.
  function handleKey(e: React.KeyboardEvent) {
    // While the key guide is open, keys belong to it: Esc closes it, nothing
    // else reaches the calculator (so Esc can't also break a running program)
    if (guideOpen) {
      if (e.key === 'Escape') setGuideOpen(false)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const key = KEY_MAP[e.key] ?? (e.key.length === 1 && !e.metaKey && !e.ctrlKey ? e.key : null)
    if (!key) return
    e.preventDefault()
    // Other apps (e.g. Wordle) listen on window; keep typing here from reaching them
    e.stopPropagation()
    // Show the matching on-screen key pressed while the keyboard key is down
    if (key in BUTTON_KEYS) setPressed(key)
    calc.key(key)
  }

  // Phone keyboards often don't say which key was pressed (Android reports
  // "Unidentified"), so their typing arrives here as text instead. The field
  // always holds one sentinel character: anything added was typed, and the
  // sentinel going missing means Backspace. Then it's reset for the next key.
  function handleInput(e: React.FormEvent<HTMLInputElement>) {
    const field = e.currentTarget
    const value = field.value
    if (value.length < SENTINEL.length) calc.key('Backspace')
    else for (const ch of value.slice(SENTINEL.length)) calc.key(ch)
    field.value = SENTINEL
  }

  // Clicking the calculator body shouldn't move focus off the hidden field
  // (it would land on the page and the keyboard would stop working)
  function keepFocus(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
  }

  // Tapping the calculator (but not one of its keys) focuses the hidden field,
  // which is what brings up a phone's on-screen keyboard. It has to happen on
  // click: iOS only opens the keyboard for focus inside a genuine tap.
  function focusInput(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={rootRef}
      onMouseDown={keepFocus}
      onClick={focusInput}
      style={{
        position: 'relative', minHeight: '100%', boxSizing: 'border-box', padding: '14px 18px 12px',
        background: BODY, outline: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      {/* Branding row, as printed above the screen */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: SILVER, fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 'bold', fontStyle: 'italic', fontSize: 20, letterSpacing: 0.5 }}>
            TI-84 <span style={{ fontSize: 15 }}>Plus</span>
          </span>
          {/* Opens the key guide; a small round key in the same plastic as the others */}
          <button
            type="button"
            aria-label="TI-BASIC guide"
            title="TI-BASIC guide"
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setGuideOpen(open => !open)}
            style={{
              // 98.css restyles every <button>; reset what it sets
              minWidth: 'unset', minHeight: 'unset', padding: 0, border: 'none', textShadow: 'none',
              width: 18, height: 18, borderRadius: '50%', background: KEY_FACE, boxShadow: KEY_RAISED,
              color: KEY_LABEL, fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 'bold', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none',
            }}
          >
            i
          </button>
        </span>
        {/* Dimmed slightly so a white logo reads as the silver print */}
        {logoSrc && <img src={logoSrc} alt="" style={{ height: 30, width: 'auto', opacity: 0.85, display: 'block' }} />}
      </div>

      {/* Screen in its bezel. The glass has a blank margin around the pixel
          area and a soft shadow along its top edge, where it sits under the bezel. */}
      <div style={{
        position: 'relative', background: BEZEL, padding: BEZEL_PAD, borderRadius: 6,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 2px 5px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          background: LCD_BG, padding: MARGIN * scale, borderRadius: 2,
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.35)',
        }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: LCD_W * scale, height: LCD_H * scale }}
          />
        </div>

        {/* Invisible text field that receives all typing. Sitting over the
            screen keeps a phone from scrolling away when it focuses; 16px text
            stops iOS from zooming in on focus. */}
        <input
          ref={inputRef}
          defaultValue={SENTINEL}
          onKeyDown={handleKey}
          onKeyUp={() => { if (!repeat.current.delay) setPressed(null) }}
          onInput={handleInput}
          aria-label="Calculator keyboard input"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          style={{
            position: 'absolute', left: 10, top: 10, width: 1, height: 1, padding: 0, border: 'none',
            opacity: 0, fontSize: 16, pointerEvents: 'none',
          }}
        />
      </div>

      {/* Keys: ESC, the TI-84's arrow pad, then ENTER — spread evenly across
          the width of the screen, all centred on one line */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 12,
        width: (LCD_W + 2 * MARGIN) * scale + 2 * BEZEL_PAD,
      }}>
        <CalcButton calcKey="Escape" label="ESC" ariaLabel="Escape" width={WIDE_W} height={WIDE_H}
          pressed={pressed === 'Escape'} onPress={pressButton} onRelease={releaseButton} />
        {/* ↑ and ↓ stacked in the middle, ← and → raised to the pad's centre
            line on either side — the TI-84's arrow layout. The keys sit in a
            recessed oval well, each with its outer edge rounded, so together
            they read as one rocker. */}
        <div style={{ position: 'relative', width: PAD_W, height: PAD_H }}>
          <div style={{
            position: 'absolute', inset: '-7px -9px', borderRadius: '50%', background: '#18191c',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.75), 0 1px 0 rgba(255,255,255,0.06)',
          }} />
          {([
            ['Up',    { left: ARROW + PAD_GAP, top: 0 },               '9px 9px 3px 3px'],
            ['Down',  { left: ARROW + PAD_GAP, bottom: 0 },            '3px 3px 9px 9px'],
            ['Left',  { left: 0, top: (PAD_H - ARROW) / 2 },           '9px 3px 3px 9px'],
            ['Right', { right: 0, top: (PAD_H - ARROW) / 2 },          '3px 9px 9px 3px'],
          ] as const).map(([dir, at, radius]) => (
            <div key={dir} style={{ position: 'absolute', ...at }}>
              <CalcButton calcKey={dir} label={<Arrow dir={dir} />} ariaLabel={dir} width={ARROW} height={ARROW} radius={radius}
                pressed={pressed === dir} onPress={pressButton} onRelease={releaseButton} />
            </div>
          ))}
        </div>
        <CalcButton calcKey="Enter" label="ENTER" ariaLabel="Enter" width={WIDE_W} height={WIDE_H}
          pressed={pressed === 'Enter'} onPress={pressButton} onRelease={releaseButton} />
      </div>

      {guideOpen && <KeyGuide onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
