import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const cache = new Map();
const loadTypeScript = (filename) => {
  const path = resolve(filename);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const source = readFileSync(path, 'utf8');
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
const fixture = JSON.parse(readFileSync('src/content/drops/example.json', 'utf8'));

const activeDrop = {
  id: 'd1', slug: 'd1', title: 'Drop', description: 'Drop',
  opens_at: '2026-01-01T00:00:00Z', closes_at: '2027-01-01T00:00:00Z',
  currency: 'USD', shipping_amount_minor: 1000, payment_methods: ['PayPal'], active: true,
  drop_items: [{ id: 'i1', drop_id: 'd1', sku: 'SKU', name: 'Item', item_type: 'Sticker', artist: 'Artist', image_path: '/item.png', description: 'Item', amount_minor: 2500, stock_total: 2, stock_available: 2, max_per_order: 1, active: true }],
};

test('drop states cover upcoming, active, sold out, and closed', () => {
  assert.equal(drops.getDropStatus(activeDrop, new Date('2025-12-01T00:00:00Z')), 'upcoming');
  assert.equal(drops.getDropStatus(activeDrop, new Date('2026-06-01T00:00:00Z')), 'active');
  assert.equal(drops.getDropStatus({ ...activeDrop, drop_items: [{ ...activeDrop.drop_items[0], stock_available: 0 }] }, new Date('2026-06-01T00:00:00Z')), 'sold_out');
  assert.equal(drops.getDropStatus(activeDrop, new Date('2027-01-01T00:00:00Z')), 'closed');
});

test('money uses integer minor units', () => {
  const value = drops.formatMoney(3050, 'USD');
  assert.match(value, /30[,.]50/);
});

test('launch catalog uses USD, flat $10 shipping, and PayPal', () => {
  assert.equal(fixture.currency, 'USD');
  assert.equal(fixture.shippingAmountMinor, 1000);
  assert.deepEqual(fixture.paymentMethods, ['PayPal']);
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
