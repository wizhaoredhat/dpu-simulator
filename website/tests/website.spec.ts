import { expect, test } from '@playwright/test';

test('guided tour, exploration return, browser history and start over', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A DPU lab');
  await page.getByRole('button', { name: 'Take the tour', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One packet. Two hosts.');
  await page.getByRole('button', { name: 'Explore topology', exact: true }).click();
  await page.getByRole('button', { name: 'Return to your tour' }).click();
  await expect(page).toHaveURL(/#networking$/);
  await page.getByRole('button', { name: 'On the DPU', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DPU offload', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One packet. Two hosts.');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A DPU lab');
});

test('packet playback, manual stepping, pause, mode reset and timer cleanup', async ({ page }) => {
  await page.clock.install();
  await page.goto('./#networking');
  const step = page.locator('.journey-status h3');
  await page.getByRole('button', { name: 'Play journey', exact: true }).click();
  await page.clock.runFor(2700);
  await expect(step).toHaveText('Source networking');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(6000);
  await expect(step).toHaveText('Source networking');
  await page.getByRole('button', { name: 'Next packet step', exact: true }).click();
  await expect(step).toHaveText('The underlay');
  await page.getByRole('button', { name: 'DPU offload', exact: true }).click();
  await expect(step).toHaveText('Pod A');
  await page.clock.runFor(6000);
  await expect(step).toHaveText('Pod A');
  await page.getByRole('button', { name: 'Play journey', exact: true }).click();
  for (const label of ['Source networking', 'The underlay', 'Destination networking', 'Pod B']) {
    await page.clock.runFor(2700);
    await expect(step).toHaveText(label);
  }
  await expect(page.getByRole('button', { name: 'Next packet step', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restart packet journey' }).click();
  await expect(step).toHaveText('Pod A');
  await expect(
    page.getByRole('button', { name: 'Previous packet step', exact: true }),
  ).toBeDisabled();
});

test('topology explains components and switches the runtime without changing selection', async ({
  page,
}) => {
  await page.goto('./#lab');
  await page.getByRole('button', { name: 'Inspect host 1 to DPU 1 connection' }).click();
  await expect(page.locator('.inspector')).toContainText('veth pair');
  await page.getByRole('button', { name: 'VMs', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('libvirt networks');
  await expect(page.locator('.runtime-explainer')).toContainText('config-ovnk-offload.yaml');
  await page.getByText('Under the hood', { exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('16 links');
  await page.getByRole('button', { name: 'Kind', exact: true }).click();
  await page.getByText('Under the hood', { exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('128 pairs');
  await page.getByRole('button', { name: 'DPU cluster', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('The DPU cluster');
  await page.getByText('Under the hood', { exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('Flannel');
  await page.getByRole('button', { name: 'Pod B workload', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('Application pod B');
});

test('dialogs support keyboard dismissal, public QR destination, and presenter affiliations', async ({
  page,
}) => {
  await page.goto('./');
  await expect(
    page.getByText('Principal Software Engineer, Red Hat', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Principal Software Engineer, NVIDIA', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Share this demo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.public-url')).toHaveAttribute(
    'href',
    process.env.VITE_PUBLIC_URL || 'https://ovn-kubernetes.github.io/dpu-simulator/',
  );
  await expect(dialog.locator('.share-qr svg title')).toHaveText('Public demo QR code');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Share this demo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Glossary', exact: true }).click();
  await expect(dialog).toContainText('Representor');
  await page.keyboard.press('Escape');
});

test('quickstart commands copy correctly and skip navigation preserves the chapter', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#quickstart');
  await page.getByRole('button', { name: 'Copy commands: Bring up the Kind lab' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    './bin/dpu-sim --config config-kind-ovnk-offload.yaml',
  );
  await page.keyboard.press('Control+Home');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bring up your own DPU lab.');
  await expect(page.locator('main')).toBeFocused();
});

test('mobile layouts remain within the viewport and reduced motion keeps a static packet path', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const chapter of ['welcome', 'networking', 'offload', 'lab', 'quickstart']) {
    await page.goto(`./#${chapter}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto('./#offload');
  await expect(page.locator('.mobile-packet-path')).toBeVisible();
  await page.getByRole('button', { name: 'Next packet step', exact: true }).click();
  await expect(page.locator('.journey-status')).toContainText('DPU 1');
  await expect(page.locator('animateMotion')).toHaveCount(0);
});

test('production site and bundled assets load with external traffic blocked', async ({
  page,
  context,
  baseURL,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('./');
  for (const logo of ['Red Hat', 'NVIDIA']) {
    expect(
      await page
        .getByRole('img', { name: logo, exact: true })
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Take the tour', exact: true }).click();
  await page.getByRole('button', { name: 'Next packet step', exact: true }).click();
  await expect(page.locator('.journey-status h3')).toHaveText('Source networking');
  await page.getByRole('button', { name: 'Explore topology', exact: true }).click();
  await page.getByRole('button', { name: 'VMs', exact: true }).click();
  await page.getByRole('button', { name: 'Quickstart', exact: true }).click();
  await expect(page.locator('.quickstart-step')).toHaveCount(5);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
