import { aisle, standBounds, surfaces, types } from './layout.js';
import { marketShiftZ } from '../salads/marketPosition.js';
import { coversFloor, containsFootprint } from '../floorGeometry.js';

const fields = ['x', 'y', 'z', 'rotation', 'tiltX', 'tiltZ'];

export function normalizeArrangement(data) {
  if (!Array.isArray(data) || data.length > 4000) return null;
  const ids = new Set();
  const valid = data.every((item) => {
    if (!item || typeof item.id !== 'string' || item.id.length > 120 || ids.has(item.id) || !Object.hasOwn(types, item.type) ||
      !fields.every((field) => Number.isFinite(item[field]))) return false;
    ids.add(item.id);
    return item.y >= 0 && item.y <= 3.5 && Math.abs(item.x) <= 128 && Math.abs(item.z) <= 128;
  });
  return valid ? data.map(({ id, type, x, y, z, rotation, tiltX, tiltZ }) => ({ id, type, x, y, z, rotation, tiltX, tiltZ })) : null;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export const noelBounds = { left: standBounds.left - aisle, right: standBounds.right + aisle,
  back: standBounds.back + marketShiftZ - aisle, front: standBounds.front + marketShiftZ + aisle };

export function withinAisle(x, z, type, bounds = noelBounds, yaw = 0) {
  const [w, , d] = types[type].size;
  const cos = Math.abs(Math.cos(yaw)), sin = Math.abs(Math.sin(yaw));
  const halfW = (cos * w + sin * d) / 2, halfD = (sin * w + cos * d) / 2;
  return {
    x: clamp(x, bounds.left + halfW, bounds.right - halfW),
    z: clamp(z, bounds.back + halfD, bounds.front - halfD),
  };
}

export function onSurface(x, z, board, margin = 0) {
  if (board.radius) return Math.hypot(x - board.x, z - board.z) < board.radius;
  return coversFloor(board, x, z, margin);
}

export function itemTop(item) {
  const [w,h,d] = types[item.type].size;
  if (item.type === 'wireBasket') return item.y + .038;
  if (item.type === 'wireBowl') return item.y + .175;
  if (Math.abs(item.tiltX) > 1.3) return item.y + Math.max(.013, d * .5);
  return item.y + h * Math.cos(item.tiltX) * Math.cos(item.tiltZ) + w * Math.abs(Math.sin(item.tiltZ)) * .2;
}

export function itemSurface(item) {
  if (item.type === 'dome') return null;
  const [w, , d] = types[item.type].size;
  const size = item.type === 'wireBasket' ? .61 : 1;
  return { id: item.id, x: item.x, z: item.z, w: w * size, d: d * size, yaw: item.rotation, y: itemTop(item) };
}

export function placementSurfaces(items, excluded, fixtures = surfaces) {
  return [...fixtures, ...items.filter((item) => item.id !== excluded).map(itemSurface).filter(Boolean)];
}

export function supportedHeight(x, z, boards, max = 3.1) {
  let height = 0;
  for (const board of boards) {
    if (board.y > height && board.y <= max && onSurface(x, z, board)) height = board.y;
  }
  return height;
}

function reliedOn(item, lost) {
  const [w, , d] = types[lost.type].size;
  const inside = Math.abs(item.x-lost.x) < w*.56 && Math.abs(item.z-lost.z) < d*.56;
  if (!inside || item.y - lost.y < .005) return false;
  if (lost.type === 'wireBasket') return item.y < lost.y + .55;
  return Math.abs(item.y - itemTop(lost)) < .043;
}

export function rearrange(items, id, replacement = null, fixtures = surfaces) {
  const moved = items.find((item) => item.id === id);
  if (!moved) return items;
  const next = items.filter((item) => item.id !== id).sort((a,b) => a.y - b.y);
  const displaced = [moved];
  for (let i=0;i<next.length;i++) {
    const item=next[i];
    if (displaced.some((lost) => reliedOn(item,lost))) {
      const boards = placementSurfaces(next, item.id, fixtures);
      const y = supportedHeight(item.x, item.z, boards, item.y+.002);
      if (y < item.y - .005) {
        displaced.push(item);
        next[i] = { ...item, y, tiltX: 0, tiltZ: 0 };
      }
    }
  }
  if (replacement) next.push(replacement);
  return next;
}

export function placementOnRay(ray, boards, item, bounds = noelBounds) {
  const {origin,direction} = ray;
  if (direction.y >= -.003) return null;
  let closest = -Infinity, target = null;
  for (const board of [{ y: 0 }, ...boards]) {
    if (board.y >= origin.y || board.y > 3.1 || board.y <= closest) continue;
    const distance = (board.y - origin.y) / direction.y;
    const x = origin.x + direction.x * distance, z = origin.z + direction.z * distance;
    if (board.id && !onSurface(x,z,board)) continue;
    const [w, , d] = types[item.type].size;
    if (!containsFootprint(bounds, { x, z, w, d, yaw: item.rotation })) continue;
    closest = board.y;
    target = { ...item, x, z, y: board.y, tiltX: 0, tiltZ: 0 };
  }
  return target;
}
