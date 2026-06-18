import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /tasting-journey/
export default defineConfig({
  base: '/tasting-journey/',
  plugins: [react()],
})
