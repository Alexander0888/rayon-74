import assert from 'node:assert/strict';
import test from 'node:test';
import { coversFloor, moveCrate, movePartition, originalCrates, readCrates, readPartitions, swapCrates } from '../src/features/visit/carrot/arrangement.js';
import { carrotStand, cellAt, cells, cratePose, partitions, partitionFootprint, rackCellAt, rackCells, rackCratePose } from '../src/features/visit/carrot/layout.js';
import { cartColumn, cartObstacles, cartOrigin, cartPathOpen, cartRacks, departmentBounds, localSign, mapSize, pastryOriginZ, walkFromCart } from '../src/features/visit/departmentLayout.js';
import { cartPlacement, cartWheelOffsetZ, column, floorBaskets, pastryLayout, produceStands, scaleLayout } from '../src/features/visit/surroundingsLayout.js';

function mockSavedLayout(t, getItem) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
}

test('rack placements use the twelve photographed cells and reject the rails', () => {
  assert.equal(cells.length, 12);
  for (let slot = 0; slot < cells.length; slot++) {
    const { x, z } = cratePose({ slot });
    assert.equal(cellAt(x, z), slot);
  }
  assert.equal(cellAt(carrotStand.x, carrotStand.z), -1);
  const rowZ = cratePose({ slot: 0 }).z;
  assert.equal(cellAt(carrotStand.x, rowZ), -1);
  assert.equal(moveCrate(originalCrates(), 0, { slot: 12 }), null);
  assert.equal(moveCrate(originalCrates(), 0, { x: carrotStand.x, z: carrotStand.z }), null);
});

test('the source and destination positions swap between rack and floor', () => {
  const starting = originalCrates();
  const floor = { x: 0.37, z: 2.17 };
  const moved = moveCrate(starting, 0, floor);
  assert.deepEqual(moved[0], floor);
  assert.deepEqual(moveCrate(starting, 0, { slot: 1 }), swapCrates(starting, 0, 1));
  const swapped = swapCrates(moved, 1, 0);
  assert.deepEqual(swapped.slice(0, 3), [{ slot: 1 }, floor, { slot: 2 }]);
  assert.deepEqual(moveCrate(swapped, 1, { slot: 0 }).slice(0, 3), [{ slot: 1 }, { slot: 0 }, { slot: 2 }]);
  assert.deepEqual(starting[0], { slot: 0 });
});

test('all boxes can be parked individually on the floor and occupy their full footprint', () => {
  let locations = originalCrates();
  for (let index = 0; index < 12; index++) {
    const floor = { x: -4.4 + index % 6 * 0.55, z: 2.04 + Math.floor(index / 6) * 0.67 };
    locations = moveCrate(locations, index, floor);
    assert.deepEqual(locations[index], floor);
  }
  assert.ok(locations.every((location) => location.slot === undefined));
  assert.equal(moveCrate(locations, 0, { x: locations[1].x + 0.05, z: locations[1].z }), null);
  assert.equal(moveCrate(locations, 0, { x: departmentBounds.right - 0.06, z: 4.5 }), null);
  const swapped = swapCrates(locations, 0, 11);
  assert.deepEqual(swapped[11], locations[0]);
  assert.deepEqual(swapped[0], locations[11]);
});

test('moving a panel frees its old space and blocks the new position for crates', () => {
  const walls = partitions.map(({ x, z, yaw }) => ({ x, z, yaw }));
  const position = { x: 2.5, z: 5.35 };
  const moved = movePartition(walls, 1, position);
  assert.deepEqual(moved, [walls[0], { ...position, yaw: walls[1].yaw }, walls[2]]);
  assert.deepEqual(movePartition(moved, 1, walls[1]), walls);
  assert.deepEqual(movePartition(walls, 0, walls[0]), walls);
  const footprints = moved.map((location, index) => partitionFootprint(index, location));
  assert.deepEqual(moveCrate(originalCrates(), 0, walls[1], footprints)[0], { x: walls[1].x, z: walls[1].z });
  assert.equal(moveCrate(originalCrates(), 0, position, footprints), null);
  assert.equal(movePartition(walls, 1, position, [{ ...position, w: 0.39, d: 0.58 }]), null);
  assert.equal(movePartition(walls, 1, walls[0]), null);
  assert.equal(movePartition(walls, 1, carrotStand), null);
  assert.equal(movePartition(walls, 1, { x: departmentBounds.right - 0.36, z: 5.35 }), null);
});

test('each panel can turn around its own centre and the footprint follows the angle', () => {
  const walls = partitions.map(({ x, z, yaw }) => ({ x, z, yaw }));
  for (const [index, panel] of walls.entries()) {
    for (const direction of [-1, 1]) {
      const turned = movePartition(walls, index, { ...panel, yaw: panel.yaw + direction * Math.PI / 12 });
      assert.deepEqual(turned[index], { ...panel, yaw: panel.yaw + direction * Math.PI / 12 });
      assert.ok(turned.every((position, other) => other === index || position === walls[other]));
    }
  }
  const target = { x: 7.5, z: 5.35, yaw: Math.PI / 4 };
  const turned = movePartition(walls, 1, target);
  assert.deepEqual(turned[1], target);
  const diagonal = partitionFootprint(1, turned[1]);
  const blocked = { x: target.x + 0.60, z: target.z - 0.60 };
  const clear = { x: target.x + 0.60, z: target.z + 0.60 };
  assert.equal(coversFloor(diagonal, blocked.x, blocked.z, 0.135), true);
  assert.equal(coversFloor(diagonal, clear.x, clear.z, 0.135), false);
  assert.equal(moveCrate(originalCrates(), 0, blocked, [diagonal]), null);
  assert.deepEqual(moveCrate(originalCrates(), 0, clear, [diagonal])[0], clear);
  assert.equal(movePartition(walls, 1, target, [{ ...blocked, w: 0.39, d: 0.58 }]), null);

  const edge = { x: departmentBounds.right - 0.32, z: 5.35, yaw: Math.PI / 2 };
  const standingAtEdge = movePartition(walls, 1, edge);
  assert.deepEqual(standingAtEdge[1], edge);
  assert.equal(movePartition(standingAtEdge, 1, { ...edge, yaw: Math.PI / 2 - Math.PI / 12 }), null);
});

test('partition positions saved before rotation keep their locations and get their original angles', (t) => {
  const legacy = partitions.map(({ x, z }) => ({ x, z }));
  legacy[1] = { x: 2.50, z: 5.35 };
  mockSavedLayout(t, () => JSON.stringify(legacy));
  assert.deepEqual(readPartitions(), legacy.map((position, index) => ({ ...position, yaw: partitions[index].yaw })));
});

test('usable tile reaches the five-metre extension at each former edge', () => {
  assert.deepEqual(departmentBounds, { left: -10.02, right: 10.36, back: -8.17, front: 21.47 });
  assert.deepEqual(mapSize, { width: 20.38, depth: 29.64 });
  for (const position of [{ x: -9.7, z: 2 }, { x: 10.04, z: 2 }, { x: 0, z: -7.85 }, { x: 0, z: 21.15 }]) {
    assert.deepEqual(moveCrate(originalCrates(), 0, position)[0], position);
  }
});

test('the cart area keeps its previous anchor at the stationary pastry counter', () => {
  const pastryEnd = pastryOriginZ + pastryLayout.z + pastryLayout.lowCaseOffset + pastryLayout.lowCaseLength / 2;
  assert.equal(pastryOriginZ, 11.64);
  assert.equal(cartOrigin.z + cartWheelOffsetZ, pastryEnd);
  assert.ok(Math.abs(cartOrigin.z - pastryOriginZ - 2.45) < 0.0001);
  assert.equal(cartColumn.z, cartOrigin.z + column.z);
  assert.equal(walkFromCart.z, cartOrigin.z - 1.10);
  assert.equal(cartPathOpen(cartOrigin.x, cartOrigin.z), false);
  const sideStand = produceStands.at(-1);
  assert.equal(cartPathOpen(sideStand.x, pastryOriginZ + sideStand.z), true);
  assert.equal(cartPathOpen(sideStand.x, cartOrigin.z + sideStand.z), false);
  assert.equal(cartPathOpen(walkFromCart.x, walkFromCart.z), true);
  assert.equal(cartPathOpen(pastryLayout.x, pastryOriginZ + pastryLayout.z), false);
  for (const stand of produceStands) {
    assert.ok(cartObstacles.some((item) => item.x === stand.x && item.z === cartOrigin.z + stand.z));
  }
});

test('the angled cart and separated racks keep a passage on both sides and clear the column', () => {
  const [left, right] = cartRacks;
  assert.ok(cartPlacement.x < 0 && cartPlacement.yaw < 0);
  assert.ok(left.w < right.w && left.z + left.w / 2 < right.z + right.w / 2);
  assert.ok(left.x + left.d / 2 < cartColumn.x - cartColumn.radius);
  assert.ok(right.x - right.d / 2 > cartColumn.x + cartColumn.radius);
  assert.ok(left.z + left.w / 2 < cartOrigin.z + scaleLayout.z - scaleLayout.d / 2);
  assert.ok(floorBaskets.every(({ x, radius }) => x + radius < right.x + right.d / 2));
  assert.ok(localSign.x > right.x + right.d / 2);
  for (let z = right.z - right.w / 2; z <= cartOrigin.z + 1; z += 0.2) {
    assert.equal(cartPathOpen(-1.99, z), true);
    assert.equal(cartPathOpen(walkFromCart.x, z), true);
  }
});

test('the rotated pear rack accepts only the eight open cells at the near end', () => {
  const [, stand] = cartRacks;
  const allSlots = rackCells(stand.columns);
  const slots = allSlots.filter((_, index) => index % stand.columns < 4);
  const ordered = slots.map((_, slot) => rackCratePose(stand, slots, { slot }));
  assert.equal(ordered.length, 8);
  ordered.forEach(({ x, z }, index) => assert.equal(rackCellAt(stand, slots, x, z), index));
  assert.ok(ordered[0].z > ordered[3].z && ordered[4].x > ordered[0].x);
  assert.equal(rackCellAt(stand, slots, stand.x, ordered[0].z), -1);
  const behindFilm = rackCratePose(stand, allSlots, { slot: 4 });
  assert.equal(rackCellAt(stand, slots, behindFilm.x, behindFilm.z), -1);
});

test('relocated furniture displaces only saved items whose positions it now occupies', (t) => {
  const crates = originalCrates();
  crates[0] = { slot: 1 };
  crates[1] = { x: 0, z: cartOrigin.z };
  crates[2] = { x: 6, z: 3.5 };
  const walls = partitions.map(({ x, z, yaw }) => ({ x, z, yaw }));
  const originalCounterPanel = walls[1];
  walls[1] = { ...crates[1], yaw: 0.8 };
  walls[2] = { x: 5.5, z: 8.5, yaw: Math.PI / 2 };
  mockSavedLayout(t, (key) => JSON.stringify(key.includes('partitions') ? walls : crates));

  assert.deepEqual(readCrates(), crates.with(1, { slot: 0 }));
  assert.deepEqual(readPartitions(), walls.with(1, { ...originalCounterPanel, yaw: 0.8 }));
});
