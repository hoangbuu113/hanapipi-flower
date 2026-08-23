import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/worker.js',
    outDir: 'dist/server',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
  },
})
