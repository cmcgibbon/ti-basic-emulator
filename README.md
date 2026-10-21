# ti-basic-emulator

A TI-84 Plus style TI-BASIC interpreter for the web, with a drop-in React component.

> Early: running programs works; the on-calculator editor is in progress.

## Install

```sh
npm install github:cmcgibbon/ti-basic-emulator
```

## Usage

```tsx
import { TiBasic } from 'ti-basic-emulator'

const programs = [{ name: 'HELLO', source: 'Disp "HELLO WORLD"' }]

export default function App() {
  return <TiBasic programs={programs} />
}
```

- `programs` — programs listed in the PRGM menu (none by default)
- `logoSrc` — optional image for the top-right of the calculator

Programs are plain TI-BASIC. ASCII stand-ins like `->` (→), `sqrt(` (√), `!=` (≠) and `L1` (L₁) are
converted for you. The interpreter also works without React; see `src/index.ts`.

## Development

```sh
npm run dev    # demo page
npm test
npm run build
```

## License

MIT © Connor McGibbon. Not affiliated with Texas Instruments.
