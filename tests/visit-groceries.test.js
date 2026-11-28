import assert from 'node:assert/strict';
import test from 'node:test';
import { coversFloor, overlapsFootprint } from '../src/features/visit/floorGeometry.js';
import { parseLayout } from '../src/features/visit/layoutStorage.js';
import { mushroomStand, saladStand } from '../src/features/visit/salads/layout.js';
import { carrotStand } from '../src/features/visit/carrot/layout.js';
import { shiftMarket } from '../src/features/visit/salads/marketPosition.js';
import { herbColumn, herbPieces, herbScale, herbSlots, herbStand, olivePieces, oliveSlots, oliveStand } from '../src/features/visit/groceries/layout.js';
import { loadProducts, moveProduct, originalProducts, productPoses, productRecord } from '../src/features/visit/groceries/arrangement.js';
import { oliveSizes } from '../src/features/visit/groceries/olives.js';

function portable(crates) {
  const layout = { format: 'rayon74-visit-layout', version: 1, fixtures: {}, crates };
  return parseLayout(JSON.stringify(layout)).crates;
}

test('the herb end, mushroom cheek and scale meet the column with an open path around the end', () => {
  const { x, z, radius } = herbColumn;
  const column = { x, z, radius, w: radius * 2, d: radius * 2 };
  assert.ok(Math.abs((mushroomStand.x - mushroomStand.w / 2) - (x + radius)) < 0.015);
  assert.ok(Math.abs((z - radius) - (herbStand.z + herbStand.w / 2)) < 0.015);
  assert.ok(Math.abs((x - radius) - (herbScale.x + herbScale.d / 2)) < 0.02);
  const carrots = shiftMarket(carrotStand);
  assert.ok(Math.abs((oliveStand.z - oliveStand.w / 2) - (carrots.z + carrots.d / 2)) < 0.03);
  const around = [oliveStand, herbStand, herbScale, saladStand, mushroomStand, column, carrots];
  for (let i = 0; i < around.length; i++) {
    for (const other of around.slice(i + 1)) assert.equal(overlapsFootprint(around[i], other), false);
    assert.equal(coversFloor(around[i], -1.33, z, 0.14), false);
  }
});

test('an olive pack moves on its own, settles the source stack and retains its new level on import', () => {
  const initial = originalProducts(olivePieces);
  const sourceSlot = oliveSlots.findIndex(({ id }) => id === '7:1');
  const middle = olivePieces.findIndex(({ slot, layer }) => slot === sourceSlot && layer === 1);
  const lid = olivePieces.findIndex(({ slot, layer }) => slot === sourceSlot && layer === 2);
  const targetSlot = oliveSlots.findIndex(({ id }) => id === '2:8');
  const next = moveProduct(initial, middle, { slot: targetSlot }, true);
  assert.equal(initial[lid].layer, 2);
  assert.equal(next[lid].layer, 1);
  assert.equal(next[middle].layer, 1 + Math.max(...initial.filter(({ slot }) => slot === targetSlot).map(({ layer }) => layer)));
  const above = productPoses(oliveStand, oliveSlots, next, olivePieces.map(({ type }) => oliveSizes[type]))[middle];
  const height = initial.reduce((sum, item, index) => sum + (item.slot === targetSlot ? oliveSizes[olivePieces[index].type].height : 0),
    oliveSlots[targetSlot].y);
  assert.ok(Math.abs(above.y - height) < 0.0001);
  const onTile = moveProduct(next, lid, { x: -2.31, z: 4.47, yaw: 0.2 }, true);
  const record = portable(productRecord(onTile, olivePieces, oliveSlots, true));
  assert.deepEqual(loadProducts(record, olivePieces, oliveSlots, true), onTile);
  const returned = moveProduct(onTile, lid, { slot: sourceSlot, yaw: 0 }, true);
  assert.equal(returned[lid].yaw, 0);
});

test('herb bunches move to empty sockets, swap occupied ones and retain stable IDs in the exported layout', () => {
  assert.equal(herbSlots.length, 48);
  const initial = originalProducts(herbPieces);
  const empty = moveProduct(initial, 0, { slot: 0 }, false);
  assert.equal(empty[0].slot, 0);
  assert.equal(empty[1].slot, initial[1].slot);
  const swapped = moveProduct(empty, 0, { slot: empty[1].slot }, false);
  assert.equal(swapped[1].slot, 0);
  assert.equal(swapped[0].slot, initial[1].slot);
  assert.equal(moveProduct(swapped, 0, { x: -2, z: 4.5, yaw: 0 }, false), null);
  const record = portable(productRecord(swapped, herbPieces, herbSlots, false));
  assert.deepEqual(loadProducts(record, herbPieces, herbSlots, false), swapped);
  const collision = { [herbPieces[0].id]: { slot: '1:1' }, [herbPieces[1].id]: { slot: '1:1' } };
  const restored = loadProducts(collision, herbPieces, herbSlots, false);
  assert.equal(new Set(restored.map(({ slot }) => slot)).size, herbPieces.length);
});
