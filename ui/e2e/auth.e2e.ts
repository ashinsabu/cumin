import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { E2E_LOG } from '../playwright.config'

const PASSWORD = 'correct-horse-battery'

// The dev log mailer prints each mail as a log line; the newest link for the address wins.
async function emailedToken(email: string, path: 'verify-email' | 'reset-password'): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const log = readFileSync(E2E_LOG, 'utf8')
    const hits = [...log.matchAll(new RegExp(`${email.replace('+', '\\+')}[^\\n]*?${path}\\?token=([A-Za-z0-9_-]+)`, 'g'))]
    if (hits.length) return hits[hits.length - 1][1]
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no ${path} mail for ${email} in ${E2E_LOG}`)
}

async function signUpAndVerify(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await expect(page.getByText('Check your email')).toBeVisible()

  const token = await emailedToken(email, 'verify-email')
  await page.goto(`/verify-email?token=${token}`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Verify email' }).click()
  await expect(page.getByText('Email verified')).toBeVisible()
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const freshEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`

test('signup -> verify -> login -> reload keeps the session -> logout', async ({ page }) => {
  const email = freshEmail()
  await signUpAndVerify(page, email)
  await signIn(page, email)
  await expect(page.getByRole('link', { name: /dashboards/i }).or(page.getByText(/sprint/i).first())).toBeVisible()

  // The access token lives in memory only: surviving a reload proves the refresh cookie works.
  await page.reload()
  await expect(page.getByLabel('Email')).toHaveCount(0)

  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Email')).toBeVisible() // logout revoked the refresh token
})

test('unverified account cannot sign in; wrong password is rejected', async ({ page }) => {
  const email = freshEmail()
  await page.goto('/')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await expect(page.getByText('Check your email')).toBeVisible()

  await signIn(page, email)
  await expect(page.getByText(/verify your email first/i)).toBeVisible()
})

test('password reset: old password stops working, new one works', async ({ page }) => {
  const email = freshEmail()
  await signUpAndVerify(page, email)

  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()

  const token = await emailedToken(email, 'reset-password')
  const NEW_PASSWORD = 'brand-new-password-123'
  await page.goto(`/reset-password?token=${token}`)
  await expect(page).not.toHaveURL(/token=/) // emailed token is stripped from the address bar
  await page.getByLabel(/password/i).first().fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password updated')).toBeVisible()

  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toBeVisible()
  await signIn(page, email, NEW_PASSWORD)
  await expect(page.getByLabel('Email')).toHaveCount(0)
})
