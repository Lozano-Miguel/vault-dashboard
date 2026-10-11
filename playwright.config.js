const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/web',
  timeout: 30000,
  webServer: {
    command: 'python3 -m http.server 8799 --bind 127.0.0.1 --directory web',
    url: 'http://127.0.0.1:8799/index.html',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://127.0.0.1:8799', viewport: { width: 1280, height: 800 } },
});
