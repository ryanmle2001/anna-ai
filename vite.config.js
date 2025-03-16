import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        options: resolve(__dirname, 'options.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        manualChunks: undefined
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    terserOptions: {
      format: {
        comments: false,
        ecma: 2020,
      },
    },
  },
})