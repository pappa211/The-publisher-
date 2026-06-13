import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// `base` must match the GitHub Pages project path:
//   https://pappa211.github.io/The-publisher-/
export default defineConfig({
  base: '/The-publisher-/',
  plugins: [react()],
})
