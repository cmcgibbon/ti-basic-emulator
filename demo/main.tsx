import { createRoot } from 'react-dom/client'
import { TiBasic } from '../src'

// A sample program to try; the package itself ships with none
const programs = [
  { name: 'HELLO', source: 'Disp "HELLO WORLD"' },
]

createRoot(document.getElementById('root')!).render(<TiBasic programs={programs} />)
