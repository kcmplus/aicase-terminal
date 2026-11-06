import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'RsjSharedUI',
      fileName: 'index',
      cssFileName: 'style'
    },
    rollupOptions: {
      external: ['vue', 'vue-i18n', '@tauri-apps/api', '@tauri-apps/plugin-updater', '@tauri-apps/plugin-process', '@openvanilla/mcbopomofoweb'],
      output: {
        globals: {
          vue: 'Vue',
          'vue-i18n': 'VueI18n',
          '@tauri-apps/api': 'TauriApi'
        }
      }
    },
    emptyOutDir: true
  }
});
