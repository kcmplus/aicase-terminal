import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

import path from 'path';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(),
  UnoCSS(),
  AutoImport({
    imports: ['vue'],
    resolvers: [ElementPlusResolver({ importStyle: false })]
  }),
  Components({
    resolvers: [ElementPlusResolver({ importStyle: false })]
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@openvanilla/mcbopomofoweb': path.resolve(__dirname, 'src/skins/components/McBopomofoWeb'),
      '@rsj/shared-ui': path.resolve(__dirname, 'src/skins/components/shared-ui/dist'),
    }
  },
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    // 预构建 DIY 常用依赖，减轻首次进入编辑页的冷编译
    include: ['gsap', 'qrcode', 'hammerjs', 'element-plus', 'element-plus/es'],
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1423,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1424,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
