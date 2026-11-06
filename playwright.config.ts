import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'tests/browser',
  timeout:30000,
  workers:1,
  use:{
    baseURL:'http://127.0.0.1:4182',
    viewport:{width:1080,height:1920},
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {},
  },
  webServer:{
    command:'npm --prefix supplier-host run preview -- --host 127.0.0.1 --port 4182 --strictPort',
    url:'http://127.0.0.1:4182',
    reuseExistingServer:false,
  },
});
