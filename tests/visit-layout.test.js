import assert from 'node:assert/strict';
import test from 'node:test';
import { cartRacks, departmentBounds } from '../src/features/visit/departmentLayout.js';
import { defaultVisitLayout, openLayoutStorage, parseLayout } from '../src/features/visit/layoutStorage.js';
import { publishedFurnitureLayout } from '../src/features/visit/publishedFurnitureLayout.js';
import { crateRecord, loadCrateRecord, moveCrate, originalCrates } from '../src/features/visit/carrot/arrangement.js';
import { carrotStand, crateSize, partitions, rackCellAt, rackCells, rackCratePose, reservePartitions } from '../src/features/visit/carrot/layout.js';
import { pearIds, pearSlots } from '../src/features/visit/pear/layout.js';
import { overlapsFootprint } from '../src/features/visit/floorGeometry.js';
import { originalItems } from '../src/features/visit/christmas/layout.js';
import { mushroomCrateSize, mushroomIds, mushroomSlots, mushroomStand, saladIds, saladSlots, saladStand } from '../src/features/visit/salads/layout.js';
import { marketShiftZ, shiftMarket } from '../src/features/visit/salads/marketPosition.js';

function mockStorage(t, entries = {}) {
  const data = new Map(Object.entries(entries));
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  } });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  });
  return data;
}

test('a fresh tour opens and exports the published furniture positions and stand copies', (t) => {
  const data = mockStorage(t);
  const layout = openLayoutStorage();
  const exported = parseLayout(layout.export());
  assert.deepEqual(exported.fixtures, publishedFurnitureLayout.fixtures);
  assert.deepEqual(exported.copies, publishedFurnitureLayout.copies);
  assert.equal(Object.keys(exported.fixtures).length, 16);
  assert.equal(Object.keys(exported.copies).length, 7);
  assert.deepEqual(exported.crates, {});
  assert.equal(data.has('rayon74.visit-layout'), false);
});

test('a saved furniture layout takes precedence over the published positions and copies', (t) => {
  const saved = {
    format: 'rayon74-visit-layout', version: 1, sceneRevision: publishedFurnitureLayout.sceneRevision,
    fixtures: { 'fence-15': { x: -4.8, z: 1.8, yaw: 0.72 } },
    crates: {}, copies: {},
  };
  mockStorage(t, { 'rayon74.visit-layout': JSON.stringify(saved) });
  const layout = openLayoutStorage();
  assert.deepEqual(layout.state.fixtures, saved.fixtures);
  assert.deepEqual(layout.state.copies, saved.copies);
});

test('a shared-layout draft starts from the published scene and stays in memory', (t) => {
  const saved = { ...defaultVisitLayout(), fixtures: { 'fence-15': { x: -4.8, z: 1.8, yaw: 0.72 } }, copies: {} };
  const localStorage = mockStorage(t, { 'rayon74.visit-layout': JSON.stringify(saved) });
  const published = defaultVisitLayout();
  const draft = openLayoutStorage(published);
  assert.deepEqual(draft.state, published);
  draft.set({ fixtures: {} });
  assert.deepEqual(draft.state.fixtures, {});
  assert.deepEqual(JSON.parse(localStorage.get('rayon74.visit-layout')).fixtures, saved.fixtures);
  assert.deepEqual(openLayoutStorage(published).state, published);
});

test('the tour retains old placements when upgrading its layout format', (t) => {
  const walls = partitions.map(({ x, z, yaw }) => ({ x, z, yaw }));
  walls[1] = { x: 2.5, z: 5.35, yaw: 0.43 };
  const carrots = originalCrates();
  carrots[0] = { x: -0.84, z: 6.52 };
  const pears = originalCrates(pearSlots.length);
  pears[0] = { x: 2.2, z: 12.0 };
  const data = mockStorage(t, {
    'rayon74-visit-partitions-v1': JSON.stringify(walls),
    'rayon74-visit-carrot-crates-v1': JSON.stringify(carrots),
    'rayon74-visit-pear-crates-v1': JSON.stringify(pears),
    'rayon74-visit-local-sign-v1': JSON.stringify({ x: 2.4, z: 14.6, yaw: 1.05 }),
    'rayon74.christmas-arrangement.v1': '[]',
  });
  const layout = openLayoutStorage();
  assert.deepEqual(layout.state.fixtures['partition-counters'], walls[1]);
  assert.deepEqual(layout.state.crates['carrot-loose-a'], carrots[0]);
  assert.deepEqual(layout.state.crates['pear-abate'], pears[0]);
  assert.deepEqual(layout.state.christmas, []);
  assert.equal(data.has('rayon74.visit-layout'), false);
  const fence = { x: -4.8, z: 1.8, yaw: 0.72 };
  layout.set({ fixtures: { ...layout.state.fixtures, 'fence-01': fence } });
  const reloaded = openLayoutStorage();
  assert.deepEqual(reloaded.state.fixtures['fence-01'], fence);
  assert.equal(reloaded.state.fixtures['fence-02'], undefined);
  assert.equal(new Set(reservePartitions.map(({ id }) => id)).size, 20);
  assert.deepEqual(parseLayout(reloaded.export()).fixtures, reloaded.state.fixtures);
});

test('portable layouts preserve known and future IDs and reject invalid snapshots', () => {
  const layout = { format: 'rayon74-visit-layout', version: 1, fixtures: {
    'fence-01': { x: -3.1, z: 1.2, yaw: 1.4 },
    'future-fixture': { x: 4.1, z: 2.2, yaw: 2.4 },
  }, crates: { 'pear-fred': { slot: '2:2', yaw: Math.PI } } };
  const text = JSON.stringify(layout);
  const decoded = parseLayout(text);
  assert.deepEqual(decoded.fixtures, layout.fixtures);
  assert.deepEqual(decoded.crates, layout.crates);
  assert.equal(parseLayout(JSON.stringify({ ...layout, version: 2 })), null);
  assert.equal(parseLayout(JSON.stringify({ ...layout, fixtures: { 'fence-01': { x: 0, z: 'two', yaw: 0 } } })), null);
});

test('crate IDs and cells survive a change to rack columns and floor rotation uses the real footprint', () => {
  const moved = originalCrates(8);
  moved[0] = { slot: 4, yaw: Math.PI };
  moved[4] = { x: 2.2, z: 12.1, yaw: Math.PI / 2 };
  const saved = crateRecord(moved, pearIds, pearSlots);
  const extra = rackCells(11).filter(({ id }) => Number(id.split(':')[1]) <= 5);
  const inserted = ['new-a', 'new-b', ...pearIds];
  const restored = loadCrateRecord(saved, inserted, extra);
  const abate = restored[inserted.indexOf('pear-abate')];
  assert.equal(extra[abate.slot].id, '2:1');
  assert.equal(abate.yaw, Math.PI);
  assert.deepEqual(restored[inserted.indexOf('pear-fred')], moved[4]);
  const [, rack] = cartRacks;
  const flipped = rackCratePose(rack, extra, abate);
  assert.equal(flipped.slope, -rack.slope);
  assert.equal(flipped.yaw, rack.yaw + Math.PI);
  const nearEdge = { x: departmentBounds.right - 0.23, z: 5, yaw: Math.PI };
  assert.ok(moveCrate(restored, 1, nearEdge, [], departmentBounds));
  assert.equal(moveCrate(restored, 1, { ...nearEdge, yaw: Math.PI / 2 }, [], departmentBounds), null);
});

test('the marked fixtures and Christmas items move once in a saved layout', () => {
  const sample = originalItems()[0];
  const originalZ = sample.z - marketShiftZ;
  const leftOutside = { ...sample, id: 'outside', x: -5.4 };
  const untouched = {
    charrette: { x: 0.2, z: 14.1, yaw: 0.25 },
    'fence-01': { x: -8.5, z: 5.7, yaw: Math.PI / 2 },
    'partition-wall': { x: -3.5, z: 7.8, yaw: Math.PI },
  };
  const marked = {
    'noel-table-redFront': { x: 0.62, z: 0.52, yaw: 0 },
    'noel-tree': { x: -0.56, z: 0.42, yaw: 0.21 },
    'carrot-stand': { x: 0.43, z: 3.54, yaw: Math.PI },
    'partition-counters': { x: 4.3, z: 4.21, yaw: 1.68 },
    'fence-19': { x: 6.5, z: 2.71, yaw: 2.94 },
  };
  const legacy = {
    format: 'rayon74-visit-layout', version: 1,
    fixtures: { ...untouched, ...marked },
    crates: { 'carrot-loose-a': { slot: '2:2', yaw: Math.PI }, 'carrot-bag-a': { x: 2.7, z: 4.8, yaw: 1 } },
    christmas: [{ ...sample, z: originalZ }, leftOutside],
  };
  const decoded = parseLayout(JSON.stringify(legacy));
  assert.deepEqual(decoded.fixtures, {
    ...untouched,
    ...Object.fromEntries(Object.entries(marked).map(([id, position]) => [id, shiftMarket(position)])),
  });
  assert.deepEqual(decoded.christmas, [sample, leftOutside]);
  assert.deepEqual(decoded.crates, legacy.crates);
  assert.deepEqual(parseLayout(JSON.stringify(decoded)), decoded);
});

test('the salad and mushroom displays use fixed cells and leave an open strip behind the salad rack', () => {
  const carrots = shiftMarket(carrotStand);
  assert.ok(Math.abs(saladStand.z - saladStand.w / 2 - (carrots.z + carrots.d / 2)) < 0.03);
  assert.ok(Math.abs(mushroomStand.z - mushroomStand.d / 2 - (saladStand.z + saladStand.w / 2)) < 0.03);
  assert.equal(mushroomStand.yaw + Math.PI / 2, saladStand.yaw);
  const roomForNextRow = { x: -1.15, z: 3.52, w: 2.86, d: 3.30 };
  for (const stand of [carrots, saladStand, mushroomStand]) assert.equal(overlapsFootprint(roomForNextRow, stand), false);
  for (const [stand, slots, ids, size, count] of [
    [saladStand, saladSlots, saladIds, crateSize, 18],
    [mushroomStand, mushroomSlots, mushroomIds, mushroomCrateSize, 12],
  ]) {
    assert.equal(slots.length, count);
    assert.equal(new Set(ids).size, count);
    for (const pose of [stand, { ...stand, x: stand.x - 4, yaw: stand.yaw + Math.PI / 3 }]) {
      slots.forEach((_, slot) => {
        const { x, z } = rackCratePose(pose, slots, { slot });
        assert.equal(rackCellAt(pose, slots, x, z, size), slot);
      });
      assert.equal(rackCellAt(pose, slots, pose.x, pose.z, size), -1);
    }
  }
  const mushroomFloor = { x: departmentBounds.right - 0.196, z: 5, yaw: Math.PI / 2 };
  const crates = originalCrates(mushroomSlots.length);
  assert.ok(moveCrate(crates, 0, mushroomFloor, [], departmentBounds, mushroomCrateSize));
  assert.equal(moveCrate(crates, 0, mushroomFloor, [], departmentBounds, crateSize), null);
});
