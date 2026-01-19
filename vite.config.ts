import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/webview'),
  build: {
    outDir: resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/webview/main.tsx'),
        editor: resolve(__dirname, 'src/webview/editor/main.tsx')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
        // Split vendor deps into separate chunks for parallel loading
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'icons': ['lucide-react']
        }
      }
    },
    cssCodeSplit: false,
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 300
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
