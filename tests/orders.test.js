import assert from 'node:assert/strict';
import test from 'node:test';
import { groupOrders, initialDeliveryDay, isBio, orderOrigin, orderTotals } from '../src/features/orders/ordersData.js';

test('orders start on the Zurich delivery day and advance Sundays to Monday', () => {
  assert.equal(initialDeliveryDay(new Date('2026-11-20T23:30:00Z')), '2026-11-21');
  assert.equal(initialDeliveryDay(new Date('2026-11-21T23:30:00Z')), '2026-11-23');
  assert.equal(initialDeliveryDay(new Date('2027-01-31T12:00:00Z')), '2027-02-01');
});

test('orders search accents and reference codes and sort lines within their groups', () => {
  const lines = [
    { id: 1, product_name: 'Clémentine', ordered_quantity: 2, internal_ref: '101' },
    { id: 2, product_name: 'Avocat', ordered_quantity: 6 },
    { id: 3, product_name: 'Tomate Cerise', ordered_quantity: 7 },
    { id: 4, product_name: 'Persil haché 4G', ordered_quantity: 3 },
    { id: 5, product_name: 'Tomate', category: '4e gamme', ordered_quantity: 1 },
  ];
  const ids = (query, sort, group) => groupOrders(lines, query, sort)[group].map(({ id }) => id);
  assert.deepEqual(ids('clementine 101', 'nameAsc', 'fruits'), [1]);
  assert.deepEqual(ids('', 'nameAsc', 'fruits'), [2, 1]);
  assert.deepEqual(ids('', 'nameDesc', 'fruits'), [1, 2]);
  assert.deepEqual(ids('', 'quantityDesc', 'fruits'), [2, 1]);
  assert.deepEqual(ids('', 'quantityAsc', 'fruits'), [1, 2]);
  assert.deepEqual(ids('', 'quantityAsc', 'freshCut'), [5, 4]);
  assert.deepEqual(ids('', 'nameAsc', 'vegetables'), [3]);
});

test('totals preserve the confirmed amount and unit and distinguish pending and cancelled', () => {
  const box = { counting_status: 'active', ordered_quantity: 3, ordered_unit_id: 7 };
  const totals = orderTotals([
    { ...box, validated_quantity: 2, validated_unit_id: 7 },
    { ...box, validated_quantity: 0, validated_unit_id: 7 },
    { ...box, validated_quantity: null },
    { ...box, ordered_quantity: 1, validated_quantity: 6.5, validated_unit_id: 5 },
    { ...box, counting_status: 'cancelled', ordered_quantity: 30 },
  ]);
  assert.deepEqual(totals.ordered, new Map([[7, 10]]));
  assert.deepEqual(totals.confirmed, new Map([[7, 2], [5, 6.5]]));
  assert.deepEqual(totals.pending, new Map([[7, 3]]));
  assert.equal(isBio({ is_bio: true, product_name: 'Clémentine' }), true);
  assert.equal(isBio({ is_bio: false, product_name: 'BNP Clémentine' }), true);
  assert.equal(isBio({ is_bio: false, product_name: 'Clémentine' }), false);
  assert.deepEqual(orderOrigin({ origin_id: 224 }), { name: 'Italie', flag: '🇮🇹' });
  assert.deepEqual(orderOrigin({ origin_id: 658 }), { name: 'À confirmer', flag: null });
});
