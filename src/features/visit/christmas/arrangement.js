import { aisle, originalItems, standBounds, surfaces, types } from './layout.js';

const storageKey = 'rayon74.christmas-arrangement.v1';
const fields = ['x', 'y', 'z', 'rotation', 'tiltX', 'tiltZ'];

export function readArrangement() {
  try {
    const data = JSON.parse(window.localStorage.getItem(storageKey));
    const ids = new Set();
    if (Array.isArray(data) && data.every((item) => {
      if (!item || typeof item.id !== 'string' || ids.has(item.id) || !Object.hasOwn(types, item.type) ||
        !fields.every((field) => Number.isFinite(item[field]))) return false;
      ids.add(item.id);
      return item.y >= 0 && item.y <= 3.5 && Math.abs(item.x) <= 8 && Math.abs(item.z) <= 6;
    })) return data;
  } catch {
    // Браузер может отключить доступ к хранилищу.
  }
  return originalItems();
}

export function saveArrangement(items) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // Без хранилища редактор работает до закрытия страницы.
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function withinAisle(x, z, type) {
  const [w, , d] = types[type].size;
  return {
    x: clamp(x, standBounds.left - aisle + w / 2, standBounds.right + aisle - w / 2),
    z: clamp(z, standBounds.back - aisle + d / 2, standBounds.front + aisle - d / 2),
  };
}

function onSurface(x, z, board) {
  if (board.radius) return Math.hypot(x - board.x, z - board.z) < board.radius;
  return Math.abs(x - board.x) < board.w / 2 && Math.abs(z - board.z) < board.d / 2;
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
  return { id: item.id, x: item.x, z: item.z, w: w * size, d: d * size, y: itemTop(item) };
}

export function placementSurfaces(items, excluded) {
  return [...surfaces, ...items.filter((item) => item.id !== excluded).map(itemSurface).filter(Boolean)];
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

export function rearrange(items, id, replacement = null) {
  const moved = items.find((item) => item.id === id);
  if (!moved) return items;
  const next = items.filter((item) => item.id !== id).sort((a,b) => a.y - b.y);
  const displaced = [moved];
  for (let i=0;i<next.length;i++) {
    const item=next[i];
    if (displaced.some((lost) => reliedOn(item,lost))) {
      const boards = placementSurfaces(next, item.id);
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

export function placementOnRay(ray, boards, item) {
  const {origin,direction} = ray;
  if (direction.y >= -.003) return null;
  let closest = -Infinity, target = null;
  for (const board of [{ y: 0 }, ...boards]) {
    if (board.y >= origin.y || board.y > 3.1 || board.y <= closest) continue;
    const distance = (board.y - origin.y) / direction.y;
    const x = origin.x + direction.x * distance, z = origin.z + direction.z * distance;
    if (board.id && !onSurface(x,z,board)) continue;
    const position = withinAisle(x,z,item.type);
    if (Math.hypot(position.x - x, position.z - z) > .45) continue;
    closest = board.y;
    target = { ...item, ...position, y: board.y, tiltX: 0, tiltZ: 0 };
  }
  return target;
}
