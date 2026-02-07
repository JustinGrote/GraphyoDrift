import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'esnext',
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'flowbite', test: /[\\/]node_modules[\\/]flowbite.*?[\\/]/},
          ]
        }
      }
    }
  },
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,

    pwaAssets: {
      disabled: false,
      config: true,
    },

    manifest: {
      name: 'GraphyoDrift',
      short_name: 'GraphyoDrift',
      description: 'A tool to snapshot and detect changes in Microsoft Graph using Unified Configuration Tenant Management (uctm) APIs',
      theme_color: '#ffffff',
    },

    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    },

    devOptions: {
      enabled: false,
      navigateFallback: 'index.html',
      suppressWarnings: true,
      type: 'module',
    },
  })],
})