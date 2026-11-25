import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shiftDay } from '../src/app/calendar.js';
import { summarizeProduct } from '../src/features/visit/hud/productData.js';

const today = '2026-11-25';
const day = (offset) => shiftDay(today, offset);
const order = (offset, kind, quantity, unit = 'PCE') => ({ day: day(offset), kind, quantity, unit });
const waste = (offset, quantity, unit = 'PCE') => ({ day: day(offset), quantity, unit });

test('the product HUD shows sparse historical deliveries and compares dates with both sources', () => {
  const snapshot = {
    today, wasteUnit: 'PCE',
    orders: [
      order(-6, 'confirmed', 32), order(-4, 'confirmed', 48), order(-1, 'confirmed', 16),
      order(-6, 'ordered', 32), order(-4, 'ordered', 48), order(-1, 'ordered', 16),
      order(0, 'ordered', 32), order(1, 'ordered', 16), order(-20, 'ordered', 96),
    ],
    waste: [waste(-4, 5), waste(-3, 2), waste(-20, 3)],
    orderDays: [day(-20), day(-6), day(-4), day(-1), today],
    wasteDays: [day(-20), day(-4), day(-3)],
  };
  const week = summarizeProduct(snapshot, 7);
  assert.deepEqual(week.orderRows.map(({ day, phase }) => [day, phase]), [
    [day(-6), 'past'], [day(-4), 'past'], [day(-1), 'past'], [today, 'today'], [day(1), 'future'],
  ]);
  assert.equal(week.percentage, 5 / 48);
  assert.equal(week.comparedDays, 1);
  assert.equal(week.totalWaste[0].quantity, 7);
  assert.equal(week.totalOrders[0].quantity, 128);
  assert.deepEqual(week.wasteRows.at(-1).values, []);
  const month = summarizeProduct(snapshot, 30);
  assert.equal(month.percentage, 8 / 144);
  assert.equal(month.totalOrders[0].quantity, 224);
});

test('the HUD preserves separate units and omits a percentage for boxes with unknown packaging', () => {
  const snapshot = {
    today, wasteUnit: 'PCE',
    orders: [order(0, 'ordered', 3, 'COLIS'), order(0, 'ordered', 16)],
    waste: [],
    orderDays: [today], wasteDays: [today],
  };
  const data = summarizeProduct(snapshot, 7);
  assert.equal(data.percentage, null);
  assert.deepEqual(data.totalOrders.map(({ unit, quantity }) => [unit, quantity]), [['COLIS', 3], ['PCE', 16]]);
  assert.deepEqual(data.wasteRows.at(-1).values, [{ unit: 'PCE', quantity: 0 }]);
});
