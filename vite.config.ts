import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev tunnels (e.g. trycloudflare.com) hit Vite with a public Host header.
    allowedHosts: true,
  },
})
