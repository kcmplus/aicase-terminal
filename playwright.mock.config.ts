import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/mock',timeout:45000,workers:1,
  use:{baseURL:'http://127.0.0.1:4183',viewport:{width:1080,height:1920},
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{},
  },
  webServer:{command:'npm run build:embedded && npm --prefix supplier-host run dev:mock -- --port 4183',url:'http://127.0.0.1:4183',reuseExistingServer:false,timeout:120000},
});
