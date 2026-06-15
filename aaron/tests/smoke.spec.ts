import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_CONFIG = {
  name: 'Luma — Rural Health SMS',
  plugins: ['analytics', 'lakebase', 'agents'],
} as const;

interface PluginPage {
  navLabel: string;
  path: string;
  expectedTexts: string[];
}

const PLUGIN_PAGES: Record<string, PluginPage> = {
  sms: {
    navLabel: 'SMS',
    path: '/',
    expectedTexts: ['Rural Health SMS', 'Luma Health'],
  },
  analytics: {
    navLabel: 'Analytics',
    path: '/analytics',
    expectedTexts: ['Healthcare Coverage Analytics'],
  },
};

const enabledPages = Object.entries(PLUGIN_PAGES);

let testArtifactsDir: string;
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let failedRequests: string[] = [];

test('smoke test - app loads and displays SMS page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: APP_CONFIG.name })).toBeVisible();
  await expect(page.getByText('Rural Health SMS')).toBeVisible();
  await expect(page.getByText('Luma Health')).toBeVisible();

  for (const [, plugin] of enabledPages) {
    await expect(page.getByRole('link', { name: plugin.navLabel })).toBeVisible();
  }
});

for (const [name, plugin] of enabledPages) {
  test(`smoke test - ${name} page loads`, async ({ page }) => {
    await page.goto(plugin.path);

    for (const text of plugin.expectedTexts) {
      await expect(page.getByText(text)).toBeVisible();
    }
  });
}

test('smoke test - legacy agents route redirects to SMS', async ({ page }) => {
  await page.goto('/agents');
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Luma Health')).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  consoleLogs = [];
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];

  testArtifactsDir = join(process.cwd(), '.smoke-test');
  mkdirSync(testArtifactsDir, { recursive: true });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (!text.trim() || /^%[osd]$/.test(text.trim())) return;
    const location = msg.location();
    const locationStr = location.url ? ` at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';
    consoleLogs.push(`[${type}] ${text}${locationStr}`);
    if (type === 'error') consoleErrors.push(`${text}${locationStr}`);
  });

  page.on('pageerror', (error) => {
    pageErrors.push(`Page error: ${error.message}\nStack: ${error.stack || 'No stack trace available'}`);
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const testName = testInfo.title.replace(/ /g, '-').toLowerCase();
  const screenshotPath = join(testArtifactsDir, `${testName}-app-screenshot.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const logsPath = join(testArtifactsDir, `${testName}-console-logs.txt`);
  writeFileSync(
    logsPath,
    [
      '=== Console Logs ===',
      ...consoleLogs,
      '\n=== Console Errors ===',
      ...consoleErrors,
      '\n=== Page Errors ===',
      ...pageErrors,
      '\n=== Failed Requests ===',
      ...failedRequests,
    ].join('\n'),
    'utf-8',
  );

  await page.close();
});
