import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const cache = new Map();
const loadTypeScript = (filename) => {
  const path = resolve(filename);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const source = readFileSync(path, 'utf8').replaceAll('import.meta.env.BASE_URL', '"/eu/"');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
    return loadTypeScript(resolve(dirname(path), `${specifier}.ts`));
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(module.exports, localRequire, module, path, dirname(path));
  return module.exports;
};

const drops = loadTypeScript('src/lib/drops.ts');
const reservation = loadTypeScript('src/lib/reservation.ts');
const basePath = loadTypeScript('src/lib/base-path.ts');
const fixture = JSON.parse(readFileSync('src/content/drops/rainbow-juice-berry-mist.json', 'utf8'));

const activeDrop = {
  id: 'd1', slug: 'd1', title: 'Drop', description: 'Drop',
  opens_at: '2026-01-01T00:00:00Z', closes_at: '2027-01-01T00:00:00Z',
  currency: 'EUR', shipping_amount_minor: 1000, payment_methods: ['PayPal'], active: true,
  drop_items: [{ id: 'i1', drop_id: 'd1', sku: 'SKU', name: 'Item', item_type: 'Sticker', artist: 'Artist', image_path: '/item.png', description: 'Item', amount_minor: 2500, stock_total: 2, stock_available: 2, max_per_order: 1, active: true }],
};

test('EU routes and assets stay beneath the configured base path', () => {
  assert.equal(basePath.BASE_PATH, '/eu');
  assert.equal(basePath.withBase('/'), '/eu/');
  assert.equal(basePath.withBase('/genetics/example'), '/eu/genetics/example');
  assert.equal(basePath.withBase('/eu/genetics/example'), '/eu/genetics/example');
  assert.equal(basePath.withBase('/#newsletter'), '/eu/#newsletter');
  assert.equal(basePath.withBase('https://cdn.example.com/image.png'), 'https://cdn.example.com/image.png');
  assert.equal(basePath.withoutBase('/eu/genetics/example'), '/genetics/example');
  assert.equal(basePath.withoutBase('/eu'), '/');
  assert.throws(() => basePath.withBase('genetics'), /must start/);
});

test('EU genetics contains the first-drop Seeds-only library', () => {
  const entries = readdirSync('src/content/genetics').filter((filename) => filename.endsWith('.mdx')).sort();
  const geneticsPage = readFileSync('src/pages/genetics/index.astro', 'utf8');
  const homePage = readFileSync('src/pages/index.astro', 'utf8');

  assert.deepEqual(entries, ['berry-mist.mdx', 'rainbow-juice.mdx']);
  entries.forEach((filename) => {
    assert.match(readFileSync(`src/content/genetics/${filename}`, 'utf8'), /^category: seed$/m);
  });
  assert.match(geneticsPage, />Seeds</);
  assert.match(geneticsPage, /getCollection\("genetics"\)/);
  assert.doesNotMatch(geneticsPage, /Breeder Cuts|Trainer/);
  assert.doesNotMatch(homePage, /Upcoming Drops|Grape Rainbow Pie F2|Key Lime Grapes|Culture Cup/);
});

test('drop states cover upcoming, active, sold out, and closed', () => {
  assert.equal(drops.getDropStatus(activeDrop, new Date('2025-12-01T00:00:00Z')), 'upcoming');
  assert.equal(drops.getDropStatus(activeDrop, new Date('2026-06-01T00:00:00Z')), 'active');
  assert.equal(drops.getDropStatus({ ...activeDrop, drop_items: [{ ...activeDrop.drop_items[0], stock_available: 0 }] }, new Date('2026-06-01T00:00:00Z')), 'sold_out');
  assert.equal(drops.getDropStatus(activeDrop, new Date('2027-01-01T00:00:00Z')), 'closed');
});

test('money uses integer minor units', () => {
  const value = drops.formatMoney(3050, 'EUR');
  assert.match(value, /30[,.]50/);
});

test('launch catalog uses EUR, flat €10 shipping, and PayPal', () => {
  assert.equal(fixture.currency, 'EUR');
  assert.equal(fixture.shippingAmountMinor, 1000);
  assert.deepEqual(fixture.paymentMethods, ['PayPal']);
  assert.equal(fixture.opensAt, '2026-10-31T12:00:00-04:00');
  assert.equal(fixture.closesAt, undefined);
  assert.equal(fixture.active, false);
  assert.equal(fixture.items.length, 1);
  assert.equal(fixture.items[0].amountMinor, 15000);
  assert.equal(fixture.items[0].stockTotal, 50);
  assert.equal(fixture.items[0].maxPerOrder, 5);
  assert.equal(fixture.items[0].active, false);
  assert.equal(fixture.items[0].image, '/images/genetics/rainbow-juice/hero.png');
  assert.equal(fixture.items[0].secondaryImage, '/images/genetics/berry-mist/hero.png');
});

test('phone normalization accepts international numbers only', () => {
  assert.equal(reservation.normalizePhone('+44 (0)20-1234-5678'), '+442012345678');
  assert.equal(reservation.normalizePhone('+44 20 1234 5678'), '+442012345678');
  assert.equal(reservation.normalizePhone('020 1234 5678'), '');
});

test('reservation validation enforces basket, European destination, and acknowledgements', () => {
  const base = {
    dropId: 'd1', items: [{ itemId: 'i1', quantity: 1 }],
    customer: { name: 'Test Customer', email: 'test@example.com', phone: '+442012345678', paymentMethod: 'PayPal', paymentName: 'test@example.com' },
    shipping: { line1: '1 Test Street', city: 'London', postalCode: 'SW1A 1AA', countryCode: 'GB' },
    privacyAccepted: true, reservationTermsAccepted: true,
    turnstileToken: 'test-token', idempotencyKey: '11111111-1111-4111-8111-111111111111',
  };
  assert.equal(reservation.validateReservation(base).success, true);
  const nonPayPal = reservation.validateReservation({ ...base, customer: { ...base.customer, paymentMethod: 'Other' } });
  assert.equal(nonPayPal.success, false);
  assert.match(nonPayPal.errors.paymentMethod, /PayPal/);
  const invalid = reservation.validateReservation({ ...base, items: [{ itemId: 'i1', quantity: 0 }], shipping: { ...base.shipping, countryCode: 'US' }, privacyAccepted: false });
  assert.equal(invalid.success, false);
  assert.equal(invalid.errors.items.length > 0, true);
  assert.equal(invalid.errors.countryCode.length > 0, true);
  assert.equal(invalid.errors.privacyAccepted.length > 0, true);
});

test('order confirmation warns customers to retain a screenshot when email is disabled', () => {
  const dropsPage = readFileSync('src/pages/drops.astro', 'utf8');
  assert.match(dropsPage, /Take a screenshot before you leave this page/);
  assert.match(dropsPage, /No confirmation email will be sent/);
  assert.match(dropsPage, /previewState === 'confirmation'/);
  assert.match(dropsPage, /data-success-reference/);
  assert.match(dropsPage, /data-success-total/);
  assert.match(dropsPage, /data-success-expiry/);
  assert.match(dropsPage, /data-success-instructions/);
  assert.match(dropsPage, /tabindex="-1"/);
});
