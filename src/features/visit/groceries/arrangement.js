import { worldOffset } from '../floorGeometry.js';

const fullTurn = Math.PI * 2;

function atOrigin({ slot, layer }) {
  return { slot, layer, yaw: 0 };
}

function orderedStacks(locations) {
  const stacks = new Map();
  locations.forEach((location, index) => {
    if (!location || location.slot === undefined) return;
    if (!stacks.has(location.slot)) stacks.set(location.slot, []);
    stacks.get(location.slot).push(index);
  });
  for (const stack of stacks.values()) stack.sort((a, b) => locations[a].layer - locations[b].layer);
  return stacks;
}

function settle(locations) {
  for (const stack of orderedStacks(locations).values()) {
    stack.forEach((index, layer) => {
      const item = locations[index];
      if (item.layer !== layer) locations[index] = { ...item, layer };
    });
  }
  return locations;
}

export function moveProduct(locations, index, target, stacking, allowFloor = stacking, standYaw = 0) {
  const from = locations[index];
  const next = locations.slice();
  if (target.slot === undefined) {
    if (!allowFloor) return null;
    next[index] = target;
    return settle(next);
  }
  if (stacking) {
    next[index] = { slot: target.slot, layer: locations.length, yaw: target.yaw ?? from.yaw };
    return settle(next);
  }
  const other = locations.findIndex((location) => location.slot === target.slot);
  if (other !== -1 && other !== index) {
    const displaced = locations[other];
    next[other] = from.slot === undefined
      ? { x: from.x, z: from.z, yaw: standYaw + displaced.yaw }
      : { ...displaced, slot: from.slot };
  }
  next[index] = { slot: target.slot, layer: 0, yaw: target.yaw ?? from.yaw };
  return next;
}

export function productPoses(stand, slots, locations, sizes) {
  const poses = locations.map(({ x, z, yaw }) => ({ x, z, y: 0.002, yaw, slope: 0 }));
  for (const [slotIndex, stack] of orderedStacks(locations)) {
    const { x, z, y, slope } = slots[slotIndex];
    const point = worldOffset(stand, x, z);
    let surface = y;
    for (const index of stack) {
      poses[index] = { ...point, y: surface, yaw: stand.yaw + locations[index].yaw, slope };
      surface += sizes[index].height;
    }
  }
  return poses;
}

export function productRecord(locations, pieces, slots, stacking) {
  const changed = locations.flatMap((location, index) => {
    const { id, slot, layer } = pieces[index];
    if (slot !== undefined && location.slot === slot && location.layer === layer && !location.yaw) return [];
    const { x, z, yaw } = location;
    if (location.slot === undefined) return [[id, { x, z, yaw }]];
    const cell = slots[location.slot].id;
    const position = stacking ? cell + ':' + (location.layer + 1) : cell;
    return [[id, { slot: position, yaw }]];
  });
  return Object.fromEntries(changed);
}

export function loadProducts(record, pieces, slots, stacking, floorFits = () => true, allowFloor = stacking, copies = []) {
  const seats = new Map(slots.map(({ id }, index) => [id, index]));
  const claimed = new Set();

  function claim(slot, layer, yaw) {
    const key = slot + ':' + layer;
    if (claimed.has(key)) return null;
    claimed.add(key);
    return { slot, layer, yaw: yaw % fullTurn };
  }

  function read({ id }, index) {
    const saved = Object.hasOwn(record, id) ? record[id] : null;
    if (!saved) return null;
    const yaw = saved.yaw ?? 0;
    if (!saved.slot) {
      return allowFloor && floorFits(index, saved) ? { x: saved.x, z: saved.z, yaw } : null;
    }
    const split = stacking ? saved.slot.lastIndexOf(':') : saved.slot.length;
    const slot = seats.get(saved.slot.slice(0, split));
    const layer = stacking ? Number(saved.slot.slice(split + 1)) - 1 : 0;
    if (slot === undefined || !Number.isSafeInteger(layer) || layer < 0) return null;
    return claim(slot, layer, yaw);
  }

  const locations = pieces.map(read);

  for (const [index, piece] of pieces.entries()) {
    if (!locations[index]) locations[index] = claim(piece.slot, piece.layer, 0);
  }

  for (const [index, piece] of pieces.entries()) {
    if (locations[index]) continue;
    if (stacking) {
      let layer = piece.layer + 1;
      while (!(locations[index] = claim(piece.slot, layer, 0))) layer += 1;
    } else {
      const slot = slots.findIndex((_, index) => !claimed.has(index + ':0'));
      locations[index] = claim(slot, 0, 0);
    }
  }
  const added = copies.map((copy, index) => read(copy, pieces.length + index));
  return settle([...locations, ...added]);
}

export const originalProducts = (pieces) => pieces.map(atOrigin);
