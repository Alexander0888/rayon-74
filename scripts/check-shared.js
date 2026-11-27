import { todayInZurich } from '../src/app/calendar.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createSharedPlanStore } from '../src/features/herbs/data/sharedPlanStore.js';
import { checked, localSettings, sessionlessClient } from './localSupabase.js';

// Use the same local endpoint as the browser even after switching Git branches.
// A named stack can still be selected explicitly via the existing CLI argument.
const settings = process.argv[2] ? null : parseEnv(readFileSync('.env.shared.local', 'utf8'));
const { url, key } = settings
  ? { url: settings.VITE_SUPABASE_URL, key: settings.VITE_SUPABASE_PUBLISHABLE_KEY }
  : localSettings(process.argv[2]);
if (!key || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Permission checks may use only a local Supabase instance.');
}
const accounts = JSON.parse(readFileSync('supabase/demo-accounts.local', 'utf8'));
const anonymous = sessionlessClient(url, key);

async function signIn(role) {
  const { email, password } = accounts.find((account) => account.role === role);
  const client = sessionlessClient(url, key);
  const session = checked(await client.auth.signInWithPassword({ email, password }));
  return { client, id: session.user.id };
}

const { client: manager } = await signIn('manager');
const { client: employee, id: employeeId } = await signIn('employee');
const managerStore = createSharedPlanStore(manager);
const employeeStore = createSharedPlanStore(employee);
const initial = await managerStore.load(true);
assert.ok(initial.published, 'Publish a plan before running this check');
assert.ok(initial.templates.length >= 1, 'Create a template before running this check');
const model = initial.templates[0];

const publicStore = createSharedPlanStore(anonymous);
assert.deepEqual(await publicStore.load(false), { templates: [], published: initial.published });
assert.ok((await anonymous.from('plan_templates').select('id')).error);
assert.ok((await anonymous.from('rayon_members').select('role')).error);
assert.ok((await anonymous.from('published_plan').update({ name: initial.published.name }).eq('id', 1)).error);
assert.ok((await anonymous.rpc('apply_plan', {
  source_id: model.id, source_revision: model.revision, snapshot_name: model.name, snapshot_slots: model.slots,
})).error);
assert.deepEqual(checked(await employee.from('plan_templates').select('id')), []);
assert.equal(checked(await employee.from('rayon_members').select('role').eq('user_id', employeeId).single()).role, 'employee');
assert.ok((await employee.from('rayon_members').update({ role: 'manager' }).eq('user_id', employeeId)).error);
assert.ok((await employee.from('plan_templates').insert({
  id: randomUUID(), name: model.name, slots: model.slots,
})).error);
assert.deepEqual(checked(await employee.from('plan_templates').update({ name: model.name }).eq('id', model.id)
  .select('id')), []);
assert.deepEqual(checked(await employee.from('plan_templates').delete().eq('id', model.id).select('id')), []);
assert.ok((await employee.from('published_plan').update({ name: initial.published.name }).eq('id', 1)).error);
assert.ok((await employee.rpc('apply_plan', {
  source_id: model.id, source_revision: model.revision, snapshot_name: model.name, snapshot_slots: model.slots,
})).error);
assert.deepEqual(await employeeStore.load(false), { templates: [], published: initial.published });
assert.ok((await anonymous.rpc('get_waste_dashboard')).error);
assert.equal(checked(await employee.rpc('get_waste_dashboard')), null);
const wasteSnapshot = checked(await manager.rpc('get_waste_dashboard'));
assert.ok(Array.isArray(wasteSnapshot.coverage));
assert.ok(Array.isArray(wasteSnapshot.products));
assert.ok(Array.isArray(wasteSnapshot.entries));
assert.ok((await anonymous.from('waste_products').select('variant')).error);
assert.ok((await anonymous.from('waste_daily').select('recorded_on')).error);
assert.ok((await anonymous.schema('waste_demo').from('entries').select('recorded_on')).error);
assert.ok((await anonymous.schema('waste_demo').rpc('generate_days')).error);
assert.ok((await anonymous.schema('rayon_demo').from('products').select('order_key')).error);
assert.ok((await anonymous.schema('rayon_demo').rpc('generate_history')).error);
assert.ok((await employee.from('waste_daily').select('recorded_on')).data?.length === 0);
assert.ok((await employee.rpc('get_demo_waste_report')).error);
const guestWaste = checked(await anonymous.rpc('get_demo_waste_report'));
assert.deepEqual(Object.keys(guestWaste).sort(), ['coverage', 'days', 'entries', 'products']);
assert.deepEqual(checked(await anonymous.rpc('get_demo_waste_report')), guestWaste);
const legacyWaste = checked(await anonymous.rpc('get_waste_demo_dashboard'));
assert.deepEqual(legacyWaste.products, guestWaste.products);
assert.equal(legacyWaste.entries.length, guestWaste.entries.length);
if (legacyWaste.entries.length) {
  assert.equal(legacyWaste.entries[0][0], guestWaste.days[guestWaste.entries[0][0]]);
}
const realArticles = new Set(wasteSnapshot.products.map((product) => product[5].replace(/[^0-9]/g, '')));
const demoArticles = new Set(guestWaste.products.map((product) => product[5]));
assert.equal(demoArticles.size, guestWaste.products.length);
for (const reference of demoArticles) {
  assert.match(reference, /^\d+$/);
  assert.ok(!realArticles.has(reference));
}

const ordersDate = { p_delivery_date: '2026-11-23' };
assert.ok((await anonymous.rpc('get_orders_for_delivery', ordersDate)).error);
assert.equal(checked(await employee.rpc('get_orders_for_delivery', ordersDate)), null);
assert.ok(Array.isArray(checked(await manager.rpc('get_orders_for_delivery', ordersDate)).lines));
assert.ok((await manager.from('klarys_order_lines').select('id')).error);

const hudProduct = { p_product: 'avocado' };
assert.ok((await anonymous.rpc('get_cart_product_hud', hudProduct)).error);
assert.equal(checked(await employee.rpc('get_cart_product_hud', hudProduct)), null);
for (const product of ['avocado', 'pineapple', 'yellowDragon']) {
  const hud = checked(await manager.rpc('get_cart_product_hud', { p_product: product }));
  assert.match(hud.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const section of ['orders', 'waste', 'orderDays', 'wasteDays']) assert.ok(Array.isArray(hud[section]));
  for (const row of hud.orders) assert.deepEqual(Object.keys(row).sort(), ['day', 'kind', 'quantity', 'unit']);
}
assert.equal((await manager.rpc('get_cart_product_hud', { p_product: 'other' })).error?.code, '22023');
const today = todayInZurich();
const demoPeriod = { p_from: today, p_to: today };
assert.ok((await employee.rpc('get_demo_orders', demoPeriod)).error);
assert.ok((await employee.rpc('get_demo_product_hud', hudProduct)).error);
assert.ok((await manager.rpc('get_demo_orders', demoPeriod)).error);
assert.ok((await manager.rpc('get_demo_product_hud', hudProduct)).error);
assert.ok((await anonymous.from('klarys_orders').select('id')).error);
assert.ok((await employee.from('klarys_order_lines').select('id')).error);
const guestOrders = checked(await anonymous.rpc('get_demo_orders', demoPeriod));
assert.ok(Array.isArray(guestOrders.lines));
assert.ok(guestOrders.lines.every(({ manor_variant }) => demoArticles.has(manor_variant)));
if (guestWaste.products.length) {
  for (const alias of ['avocado', 'pineapple', 'yellowDragon']) {
    const snapshot = checked(await anonymous.rpc('get_demo_product_hud', { p_product: alias }));
    assert.ok(snapshot.waste.length > 0);
    assert.ok(demoArticles.has(snapshot.manorVariant));
    assert.deepEqual(checked(await anonymous.rpc('get_demo_product_hud', { p_product: String(snapshot.productId) })), snapshot);
  }
  const extra = guestWaste.products.find(([id]) => id != null)[0];
  assert.ok(checked(await anonymous.rpc('get_demo_product_hud', { p_product: String(extra) })).name);
}

assert.ok((await manager.from('published_plan').update({ applied_at: '2020-01-01Z' }).eq('id', 1)).error);
let testModel;
try {
  await assert.rejects(managerStore.saveTemplate({
    ...model, id: randomUUID(), slots: model.slots.slice(1), revision: undefined,
  }));
  testModel = await managerStore.saveTemplate({ ...model, id: randomUUID(), name: 'Vérification locale', revision: undefined });
  const old = testModel;
  testModel = await managerStore.saveTemplate({ ...old, name: 'Vérification locale mise à jour' });
  assert.equal(testModel.revision, old.revision + 1);
  await assert.rejects(managerStore.saveTemplate(old), { code: 'PT409' });
  await assert.rejects(managerStore.deleteTemplate(old), { code: 'PT409' });
  await assert.rejects(managerStore.applyTemplate(old), { code: 'PT409' });
  assert.deepEqual(await employeeStore.loadPublished(), initial.published);
} finally {
  if (testModel) await managerStore.deleteTemplate(testModel);
}
console.log('Local Auth, row permissions, validation and revision checks passed.');
