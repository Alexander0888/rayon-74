import { cartColumn, cartObstacles, departmentBounds } from '../departmentLayout.js';
import { containsFootprint, overlapsBox, overlapsCircle, overlapsFootprint } from '../floorGeometry.js';
export { coversFloor } from '../floorGeometry.js';
import { bagRail, rack, tables, treePosition } from '../christmas/layout.js';
import { carrotStand, crateSize, crateTypes, partitionFootprint, partitionFootprints, partitions } from './layout.js';

const storageKey = 'rayon74-visit-carrot-crates-v1';
const partitionStorageKey = 'rayon74-visit-partitions-v1';
const floorObstacles = [
  carrotStand, ...cartObstacles, ...tables,
  { ...bagRail, w: 0.30, d: 0.27 },
];
const roundObstacles = [
  { ...treePosition, radius: treePosition.radius + 0.04 },
  { ...rack, radius: rack.levels[0][1] },
  cartColumn,
];

export function originalCrates(count = crateTypes.length) {
  return Array.from({ length: count }, (_, slot) => ({ slot }));
}

export function fitsOnFloor(box, padding = 0, obstacles = []) {
  const clearance = { ...box, w: box.w + padding, d: box.d + padding };
  return containsFootprint(departmentBounds, box) &&
    !floorObstacles.some((solid) => overlapsBox(clearance, solid)) &&
    !obstacles.some((solid) => overlapsBox(box, solid)) &&
    !roundObstacles.some((solid) => overlapsCircle(box, solid));
}

function floorOpen(position, locations, excluded, obstacles, bounds, { width, depth } = crateSize) {
  const box = { ...position, w: width, d: depth };
  if (bounds ? (!containsFootprint(bounds, box) || obstacles.some((other) => overlapsFootprint(box, other))) :
    !fitsOnFloor(box, 0.016, obstacles)) return false;
  const clearance = { ...box, w: width + 0.008, d: depth + 0.008 };
  return locations.every((location, index) => !location || index === excluded || location.slot !== undefined ||
    !overlapsBox(clearance, { ...location, w: width, d: depth }));
}

function validLocation(location, count) {
  if (!location || typeof location !== 'object') return null;
  const yaw = Number.isFinite(location.yaw) ? location.yaw % (Math.PI * 2) : undefined;
  if (Number.isInteger(location.slot) && location.slot >= 0 && location.slot < count) {
    return yaw ? { slot: location.slot, yaw } : { slot: location.slot };
  }
  if (location.slot === undefined && Number.isFinite(location.x) && Number.isFinite(location.z)) {
    const { x, z } = location;
    return yaw === undefined || Math.abs(yaw) === Math.PI ? { x, z } : { x, z, yaw };
  }
  return null;
}

export function moveCrate(locations, index, destination, floorItems = partitionFootprints, bounds, dimensions) {
  const target = validLocation(destination, locations.length);
  if (!target || !locations[index]) return null;
  if (target.slot === undefined && !floorOpen(target, locations, index, floorItems, bounds, dimensions)) return null;

  const occupied = target.slot === undefined ? -1 : locations.findIndex((location) => location.slot === target.slot);
  return moveTo(locations, index, target, occupied);
}

export function swapCrates(locations, index, other) {
  if (!locations[index] || !locations[other] || index === other) return null;
  return moveTo(locations, index, locations[other], other);
}

function moveTo(locations, index, target, occupied) {
  const next = locations.slice();
  if (occupied >= 0) next[occupied] = locations[index];
  next[index] = target;
  return next;
}

export function readCrates(walls = partitionFootprints, count = crateTypes.length, key = storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(value) || value.length !== count) return originalCrates(count);
    const locations = value.map((location) => validLocation(location, count)), occupied = new Set();
    for (const location of locations) {
      if (!location) return originalCrates(count);
      if (location.slot !== undefined) {
        if (occupied.has(location.slot)) return originalCrates(count);
        occupied.add(location.slot);
      }
    }
    // После перестановки мебели возвращаем в ячейки только ящики с занятых мест на полу.
    for (const [index, location] of locations.entries()) {
      if (location.slot !== undefined || floorOpen(location, locations, index, walls)) continue;
      const slot = occupied.has(index) ? locations.findIndex((_, candidate) => !occupied.has(candidate)) : index;
      locations[index] = { slot };
      occupied.add(slot);
    }
    return locations;
  } catch {
    return originalCrates(count);
  }
}

export function crateRecord(locations, ids, slots, originalCount = ids.length) {
  return Object.fromEntries(locations.flatMap((location, index) => {
    if (index < originalCount && location.slot === index && !location.yaw) return [];
    const pose = location.slot === undefined ? location : { slot: slots[location.slot].id, yaw: location.yaw ?? 0 };
    return [[ids[index], pose]];
  }));
}

export function loadCrateRecord(record, ids, slots) {
  const occupied = new Set();
  const locations = ids.map((id) => {
    const saved = Object.hasOwn(record, id) ? record[id] : null;
    if (!saved) return null;
    if (saved.slot === undefined) return saved;
    const slot = slots.findIndex(({ id }) => id === saved.slot);
    if (slot < 0 || occupied.has(slot)) return null;
    occupied.add(slot);
    return { slot, yaw: Math.cos(saved.yaw ?? 0) < 0 ? Math.PI : 0 };
  });
  return locations.map((location, index) => {
    if (location) return location;
    const slot = occupied.has(index) ? slots.findIndex((_, candidate) => !occupied.has(candidate)) : index;
    occupied.add(slot);
    return { slot };
  });
}

export function loadCrateCopies(record, copies, slots, locations, bounds, dimensions) {
  const occupied = new Set(locations.map(({ slot }) => slot));
  const next = locations.slice();
  return copies.flatMap((copy) => {
    const saved = record[copy.id];
    if (saved.slot === undefined) {
      if (!floorOpen(saved, next, -1, [], bounds, dimensions)) return [];
      next.push(saved);
      return [{ ...copy, location: saved }];
    }
    const slot = slots.findIndex(({ id }) => id === saved.slot);
    if (slot < 0 || occupied.has(slot)) return [];
    occupied.add(slot);
    return [{ ...copy, location: { slot, yaw: Math.cos(saved.yaw ?? 0) < 0 ? Math.PI : 0 } }];
  });
}

function originalPartitions() {
  return partitions.map(({ x, z, yaw }) => ({ x, z, yaw }));
}

function partitionPosition(index, { x, z, yaw = partitions[index].yaw }) {
  if (![x, z, yaw].every(Number.isFinite)) return null;
  const circle = 2 * Math.PI;
  const angle = yaw % circle;
  return { x, z, yaw: angle < 0 ? angle + circle : angle || 0 };
}

export function movePartition(locations, index, { x, z, yaw = locations[index]?.yaw }, obstacles = []) {
  if (!locations[index]) return null;
  const target = partitionPosition(index, { x, z, yaw });
  if (!target) return null;
  const footprint = partitionFootprint(index, target);
  const panel = partitionFootprint(index, target, true);
  if (!fitsOnFloor(footprint) ||
    obstacles.some((solid) => overlapsBox(footprint, solid)) ||
    locations.some((location, other) => other !== index &&
      overlapsBox(panel, partitionFootprint(other, location, true)))) return null;
  return moveTo(locations, index, target, -1);
}

export function readPartitions() {
  const defaults = originalPartitions();
  try {
    const value = JSON.parse(localStorage.getItem(partitionStorageKey));
    if (!Array.isArray(value) || value.length !== partitions.length) return defaults;
    let locations = value.map((position, index) => position && partitionPosition(index, position));
    if (locations.some((position) => !position)) return defaults;
    for (const [index, position] of locations.entries()) {
      if (movePartition(locations, index, position)) continue;
      const restored = movePartition(locations, index, { ...defaults[index], yaw: position.yaw }) ??
        movePartition(locations, index, defaults[index]);
      if (!restored) return defaults;
      locations = restored;
    }
    return locations;
  } catch {
    return defaults;
  }
}
