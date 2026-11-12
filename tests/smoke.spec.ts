import { expect, test, type Page } from '@playwright/test';

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

test('renders the journey without errors', async ({ page }) => {
  const errors = consoleErrors(page);
  await page.goto('/?quality=low');
  await expect(page.locator('html')).toHaveClass(/gl-ready/, { timeout: 60_000 });
  await expect(page.locator('#loader')).toHaveClass(/is-done/, { timeout: 30_000 });
  await expect(page.locator('h1')).toContainText('Dmitrii');
  await expect(page.locator('h1')).toContainText('Malikov');
  for (const id of ['#horizon', '#about', '#experience', '#contact']) await expect(page.locator(id)).toHaveCount(1);
  await expect(page.locator('.role')).toHaveCount(3);
  await expect(page.locator('a.link[href*="linkedin.com/in/dmitrii-malikov"]')).toHaveCount(1);

  // scroll through every chapter
  for (const sel of ['#about', '#experience', '.role:nth-child(2)', '.role:nth-child(3)', '.zoom', '#contact']) {
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);
});

test('ray tracer produces an image', async ({ page }) => {
  await page.goto('/?capture=hero');
  await page.waitForFunction(() => (window as unknown as { __captureReady?: boolean }).__captureReady === true, null, { timeout: 60_000 });
  const stats = await page.evaluate(async () => {
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += l;
      if (l > 120) bright++;
    }
    return { mean: sum / (d.length / 4), bright };
  });
  expect(stats.mean).toBeGreaterThan(4); // not a black frame
  expect(stats.bright).toBeGreaterThan(50); // the accretion disk is there
});

test('content is complete without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByText('Certified System Administrator')).toBeVisible();
  await expect(page.getByText('Personal Projects')).toBeVisible();
  await expect(page.locator('[data-observe]').first()).toBeHidden();
  await ctx.close();
});

test('reduced motion keeps native scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = consoleErrors(page);
  await page.goto('/?quality=low');
  await expect(page.locator('html')).toHaveClass(/gl-ready/, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(page.locator('#contact-title')).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('observatory opens, responds to controls and closes with Escape', async ({ page }) => {
  await page.goto('/?quality=low');
  await expect(page.locator('#loader')).toHaveClass(/is-done/, { timeout: 60_000 });
  const trigger = page.locator('.hero__actions [data-observe]');
  await trigger.click();
  await expect(page.locator('html')).toHaveClass(/observing/);
  await expect(page.locator('#observatory')).toBeVisible();
  await page.locator('label.switch:has(input[name=lensing])').click();
  await expect(page.locator('input[name=lensing]')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/observing/);
  await expect(trigger).toBeFocused();
});

test('mobile layout has no horizontal overflow', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('/?quality=low');
  await expect(page.locator('html')).toHaveClass(/gl-ready/, { timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('Russian page is translated and links back to English', async ({ page }) => {
  const errors = consoleErrors(page);
  await page.goto('/ru/?quality=low');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('html')).toHaveClass(/gl-ready/, { timeout: 60_000 });
  await expect(page.locator('h1')).toContainText('Дмитрий');
  await expect(page.getByText('Проектирование и внедрение приложений')).toHaveCount(1);
  await expect(page.locator('.hud__scale-label')).toHaveText('Поле зрения');
  // the display face for Cyrillic is Playfair Display (Instrument Serif has no Cyrillic glyphs)
  const family = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain('Playfair');
  // live readouts use a decimal comma
  await expect(page.locator('[data-readouts]')).toContainText(',', { timeout: 10_000 });
  const lang = page.locator('[data-lang-switch]');
  await expect(lang).toHaveText('EN');
  await lang.click();
  await expect(page).toHaveURL(/\/$|\/#/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(errors).toEqual([]);
});
