import { defineConfig } from '@playwright/test'

// Real server (ENV=development => log mailer) + real Postgres + the Vite UI, on ports that do not
// collide with the dev stack (8080/3000). The server's stdout is tee'd to E2E_LOG so tests can read
// the "emailed" verification/reset links.
const API_PORT = 8181
const UI_PORT = 3100
export const E2E_LOG = '../tmp/e2e-server.log'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: `http://localhost:${UI_PORT}`, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `mkdir -p ../tmp && cd ../server && go run ./cmd/cumin > ${E2E_LOG.replace('../', '../')} 2>&1`,
      url: `http://localhost:${API_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        PORT: String(API_PORT),
        ENV: 'development',
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123',
        GOOGLE_CLIENT_ID: 'e2e',
        GOOGLE_CLIENT_SECRET: 'e2e',
        GOOGLE_REDIRECT_URL: `http://localhost:${API_PORT}/api/auth/google/callback`,
        ALLOWED_ORIGINS: `http://localhost:${UI_PORT}`,
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable',
      },
    },
    {
      command: `npx vite --port ${UI_PORT} --strictPort`,
      url: `http://localhost:${UI_PORT}`,
      reuseExistingServer: false,
      env: { API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
})
