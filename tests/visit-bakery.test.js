import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bakeryCounter, bakeryPartitions, breadStand, cakeCounter, caseEnds, counterStock,
  fitsPastrySeat, refrigeratedStand, refrigeratedStock,
} from '../src/features/visit/bakery/layout.js';
import { pastrySizes } from '../src/features/visit/bakery/products.js';
import { departmentBounds } from '../src/features/visit/departmentLayout.js';
import { containsFootprint, localOffset, worldOffset } from '../src/features/visit/floorGeometry.js';
import { loadProducts, moveProduct, originalProducts, productPoses, productRecord } from '../src/features/visit/groceries/arrangement.js';
import { parseLayout } from '../src/features/visit/layoutStorage.js';

test('pastry cases join on the inside and outside of the 45° turn and the partitions follow the cases', () => {
  assert.equal(cakeCounter.yaw - refrigeratedStand.yaw, Math.PI / 4);
  assert.equal(breadStand.yaw, bakeryCounter.yaw);
  for (const z of [-refrigeratedStand.d / 2, refrigeratedStand.d / 2]) {
    const end = worldOffset(refrigeratedStand, caseEnds(refrigeratedStand, z)[1], z);
    const start = worldOffset(cakeCounter, caseEnds(cakeCounter, z)[0], z);
    assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 1e-8);
  }
  for (const panel of bakeryPartitions) {
    const cabinet = panel.yaw === refrigeratedStand.yaw ? refrigeratedStand : cakeCounter;
    const local = localOffset(cabinet, panel.x, panel.z);
    assert.ok(local.z + 0.19 < -cabinet.d / 2);
    assert.ok(containsFootprint(departmentBounds, { ...panel, w: panel.width + 0.12, d: 0.38 }));
  }
  assert.ok(containsFootprint(departmentBounds, breadStand));
});

test('pastry products have unique positions that fit the photographed tiers and rotate if they have room', () => {
  const all = [...refrigeratedStock.pieces, ...counterStock.pieces];
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
  for (const [stand, { slots, pieces }] of [[refrigeratedStand, refrigeratedStock], [cakeCounter, counterStock]]) {
    assert.equal(new Set(pieces.map(({ slot }) => slot)).size, pieces.length);
    for (const { slot, type } of pieces) assert.ok(fitsPastrySeat(stand, slots[slot], pastrySizes[type], 0), type);
  }
  const tart = refrigeratedStock.pieces.find(({ type }) => type === 'raspberry');
  const seat = refrigeratedStock.slots[tart.slot];
  assert.ok(fitsPastrySeat(refrigeratedStand, seat, pastrySizes.raspberry, Math.PI / 12));
  assert.equal(fitsPastrySeat(refrigeratedStand, { ...seat, z: 0.47 }, pastrySizes.raspberry, 0), false);
});

test('pastries can swap with the floor and retain their rotation in a portable tour layout', () => {
  const { pieces, slots } = refrigeratedStock;
  const initial = originalProducts(pieces);
  const tartIndex = pieces.findIndex(({ type }) => type === 'raspberry');
  const otherIndex = pieces.findIndex(({ type }) => type === 'mixed');
  const angle = Math.PI / 12;
  const floor = { x: 2.87, z: 13.05, yaw: refrigeratedStand.yaw + angle };
  const moved = moveProduct(initial, tartIndex, floor, false, true);
  const swap = moveProduct(moved, tartIndex, { slot: initial[otherIndex].slot, yaw: angle }, false, true, refrigeratedStand.yaw);
  const record = productRecord(swap, pieces, slots, false);
  const saved = parseLayout(JSON.stringify({ format: 'rayon74-visit-layout', version: 1, fixtures: {}, crates: record }));
  const loaded = loadProducts(saved.crates, pieces, slots, false, () => true, true);
  assert.deepEqual(loaded, swap);
  assert.deepEqual(loaded[otherIndex], { ...floor, yaw: refrigeratedStand.yaw });
  const poses = productPoses(refrigeratedStand, slots, loaded, pieces.map(({ type }) => pastrySizes[type]));
  assert.equal(poses[tartIndex].yaw, floor.yaw);
  assert.equal(poses[otherIndex].y, 0.002);
  assert.equal(moveProduct(initial, tartIndex, floor, false), null);
});
