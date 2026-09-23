import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  expect:{timeout:7_500},
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI?1:0,
  workers:process.env.CI?2:undefined,
  reporter:process.env.CI?'github':'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off'
  },
  projects:[
    {name:'mobile-320',use:{...devices['Pixel 5'],viewport:{width:320,height:760}}},
    {name:'mobile-chromium',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}},
    {name:'tablet-768',use:{...devices['Desktop Chrome'],viewport:{width:768,height:1024}}},
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}}
  ],
  webServer:{
    command:'node scripts/serve-static.mjs',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,
    timeout:15_000
  }
});
