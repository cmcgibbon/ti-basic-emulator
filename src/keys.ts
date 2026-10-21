// getKey codes. The TI numbers each key by row and column of the keypad (row
// 1 = Y= … GRAPH, row 10 = ON 0 . (−) ENTER), and getKey reports that number no
// matter what the key would type. Programs compare against these directly
// (e.g. `If getKey=105`), so the computer keyboard maps onto the same codes.

const CODES: Record<string, number> = {
  // Navigation and editing
  Up: 25, Down: 34, Left: 24, Right: 26, Enter: 105,
  Backspace: 23,   // DEL
  Clear: 45,       // CLEAR (the Delete key)
  '2nd': 21,       // 2nd (the Shift key)

  // Digits and operators, on their own keys
  '0': 102, '1': 92, '2': 93, '3': 94, '4': 82, '5': 83, '6': 84, '7': 72, '8': 73, '9': 74,
  '.': 103, '+': 95, '-': 85, '*': 75, '/': 65, '^': 55, '(': 63, ')': 64, ',': 62,

  // Letters are typed with ALPHA + the key printed with that letter, so they
  // report that key's code
  A: 41, B: 42, C: 43, D: 51, E: 52, F: 53, G: 54, H: 55, I: 61, J: 62, K: 63, L: 64, M: 65,
  N: 71, O: 72, P: 73, Q: 74, R: 75, S: 81, T: 82, U: 83, V: 84, W: 85, X: 91, Y: 92, Z: 93,
  'θ': 94, ' ': 102, ':': 103, '?': 104, '"': 95,
}

/** The getKey code for a calculator key, or 0 for keys getKey doesn't report */
export function keyCode(key: string): number {
  return CODES[key] ?? CODES[key.toUpperCase()] ?? 0
}
