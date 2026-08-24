import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sites } from '@openai/sites-vite-plugin'

export default defineConfig(({ command, mode }) => {
  const useWorkerRuntime = command === 'build' || mode === 'worker'

  return {
    assetsInclude: ['**/*.jfif'],
    plugins: [
      react(),
      tailwindcss(),
      sites(),
      ...(useWorkerRuntime ? [cloudflare({
        viteEnvironment: { name: 'server' },
        config: {
          main: 'src/worker.js',
          compatibility_date: '2026-08-23',
          assets: {
            binding: 'ASSETS',
            not_found_handling: 'single-page-application',
          },
        },
      })] : []),
    ],
  }
})
