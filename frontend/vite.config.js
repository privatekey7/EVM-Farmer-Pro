import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Отключаем sourcemap для production
    minify: 'esbuild', // Быстрая минификация
    chunkSizeWarningLimit: 500, // Увеличиваем лимит предупреждений
    rollupOptions: {
      output: {
                  manualChunks: {
            // Выносим крупные библиотеки в отдельные чанки
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            icons: ['lucide-react', '@heroicons/react'],
            ui: ['@headlessui/react', 'react-hot-toast'],
            utils: ['clsx', 'tailwind-merge'],
          },
      },
    },
  },
}) 