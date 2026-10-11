import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), VitePWA({
    strategies: 'generateSW',
    registerType: 'prompt',
    injectRegister: false,
    scope: '/fishing-log/',
    manifest: {
      id: '/fishing-log/', start_url: '/fishing-log/', scope: '/fishing-log/',
      name: 'Fishing Log', short_name: 'Fishing Log', display: 'standalone',
      theme_color: '#f4f7f6', background_color: '#f4f7f6',
      icons: [192, 512].map(size => ({ src: `pwa-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' })),
    },
    includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png', 'pwa-client-check.js'],
    workbox: {
      globPatterns: ['**/*.{html,js,css}'],
      navigateFallback: '/fishing-log/index.html',
      navigateFallbackAllowlist: [/^\/fishing-log\/(?:index\.html)?$/],
      runtimeCaching: [], skipWaiting: false, clientsClaim: false,
      cacheId: 'fishing-log', cleanupOutdatedCaches: true,
      importScripts: ['pwa-client-check.js'],
    },
  })],
  base: '/fishing-log/',
})
