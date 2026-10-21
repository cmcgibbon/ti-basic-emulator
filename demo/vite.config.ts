import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The demo page used by `npm run dev`
export default defineConfig({ plugins: [react()] })
