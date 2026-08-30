import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function loadEnvFile() {
  try {
    const source = await readFile(resolve(root, '.env'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

await loadEnvFile();
const dropsDir = resolve(root, 'src', 'content', 'drops');
const files = (await readdir(dropsDir)).filter((file) => file.endsWith('.json')).sort();
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const integer = (value, minimum = 0) => Number.isInteger(value) && value >= minimum;
const validateDrop = (drop, file) => {
  const errors = [];
  for (const field of ['id', 'slug', 'title', 'description', 'opensAt', 'currency', 'paymentInstructions']) {
    if (!text(drop[field])) errors.push(`${field} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(drop.opensAt || '') || Number.isNaN(Date.parse(drop.opensAt))) errors.push('opensAt must be an ISO timestamp with an offset');
  if (drop.closesAt && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(drop.closesAt) || Number.isNaN(Date.parse(drop.closesAt)))) errors.push('closesAt must be an ISO timestamp with an offset');
  if (drop.closesAt && Date.parse(drop.closesAt) <= Date.parse(drop.opensAt)) errors.push('closesAt must follow opensAt');
  if (drop.currency !== 'USD') errors.push('currency must be USD for the $10 flat shipping policy');
  if (drop.shippingAmountMinor !== 1000) errors.push('shippingAmountMinor must be 1000 ($10.00)');
  if (!Array.isArray(drop.paymentMethods) || drop.paymentMethods.length !== 1 || drop.paymentMethods[0] !== 'PayPal') errors.push('paymentMethods must be ["PayPal"]');
  if (typeof drop.active !== 'boolean') errors.push('active must be boolean');
  if (!Array.isArray(drop.items) || !drop.items.length) errors.push('at least one item is required');
  const itemIds = new Set(), skus = new Set();
  for (const [index, item] of (drop.items || []).entries()) {
    for (const field of ['id', 'sku', 'name', 'type', 'artist', 'image', 'description']) if (!text(item[field])) errors.push(`items[${index}].${field} is required`);
    if (itemIds.has(item.id)) errors.push(`duplicate item id ${item.id}`); itemIds.add(item.id);
    if (skus.has(item.sku)) errors.push(`duplicate SKU ${item.sku}`); skus.add(item.sku);
    if (!integer(item.amountMinor)) errors.push(`items[${index}].amountMinor must be a non-negative integer`);
    if (!integer(item.stockTotal)) errors.push(`items[${index}].stockTotal must be a non-negative integer`);
    if (!integer(item.maxPerOrder, 1)) errors.push(`items[${index}].maxPerOrder must be a positive integer`);
    if (typeof item.active !== 'boolean') errors.push(`items[${index}].active must be boolean`);
  }
  if (errors.length) throw new Error(`${file}:\n- ${errors.join('\n- ')}`);
};
const catalog = [];
for (const file of files) {
  const drop = JSON.parse(await readFile(resolve(dropsDir, file), 'utf8'));
  validateDrop(drop, file);
  catalog.push({ file, drop });
}
if (process.argv.includes('--check')) {
  console.log(`Validated ${catalog.length} drop definition(s).`);
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_SUPABASE_URL || process.env.SUPABASE_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SUPABASE_SECRET_KEY || process.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !secret) {
  throw new Error('Catalog is valid. Set SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY before syncing drops.');
}

for (const { file, drop } of catalog) {
  const headers = { apikey: secret, 'Content-Type': 'application/json' };
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sync_drop_catalog`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_drop: drop, p_items: drop.items }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${file}: ${payload?.message || response.statusText}`);
  console.log(`${drop.active ? 'active' : 'inactive'} ${drop.id}: ${payload.syncedItems} item(s)`);
}
