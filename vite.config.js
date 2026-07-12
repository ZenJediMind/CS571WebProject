import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/CS571WebProject/',
  build: {
    outDir: 'docs',
  },
})
