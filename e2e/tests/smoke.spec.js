import { test, expect } from '@playwright/test';

test('le site et l’API répondent', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'CampusLens' })).toBeVisible();

  const res = await request.get('http://localhost:3001/api/health');
  expect(res.ok()).toBe(true);
});
