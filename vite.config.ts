import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Library build: one ES module in dist/, with React left to the app using it
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: new URL('./src/index.ts', import.meta.url).pathname,
      formats: ['es'],
      fileName: 'index',
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
})
