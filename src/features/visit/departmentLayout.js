import { standBounds } from './christmas/layout.js';
import { coversFloor } from './floorGeometry.js';
import { cartPlacement, cartRackLayouts, cartWheelOffsetZ, column, floorBaskets, localSignLayout, pastryLayout, produceStands, scaleLayout } from './surroundingsLayout.js';

const walkingMargin = 0.135;
const expansion = 5;

// Прежняя привязка держит кондитерскую, рисунок плитки и границу карты на месте.
export const pastryOriginZ = standBounds.front + 10.65;
const pastryEndZ = pastryOriginZ + pastryLayout.z + pastryLayout.lowCaseOffset + pastryLayout.lowCaseLength / 2;
export const cartOrigin = { x: 0, z: pastryEndZ - cartWheelOffsetZ };
export const cartColumn = { ...column, z: column.z + cartOrigin.z };
export const localSign = { ...localSignLayout, z: localSignLayout.z + cartOrigin.z, photo: 'local' };
export const cartRacks = cartRackLayouts.map((stand) => ({ ...stand, z: stand.z + cartOrigin.z }));
export const departmentBounds = {
  left: -5.02 - expansion,
  right: 5.36 + expansion,
  back: standBounds.back - 2 - expansion,
  front: pastryOriginZ + 4.83 + expansion,
};
export const mapSize = {
  width: departmentBounds.right - departmentBounds.left,
  depth: departmentBounds.front - departmentBounds.back,
};

// Подход от телеги проходит справа от прилавков и стенда с морковью.
export const walkFromCart = {
  x: 2.44, z: cartOrigin.z - 1.10, yaw: 0.055, pitch: -0.055,
};
export const walkFromNoel = {
  x: 0.67, z: 2.48, yaw: 0.105, pitch: -0.104,
};

export const mapCenter = {
  x: (departmentBounds.left + departmentBounds.right) / 2,
  z: (departmentBounds.back + departmentBounds.front) / 2,
};

const furniture = [
  { ...cartPlacement, w: 2.21, d: 1.15, y: 1.50, cartBody: true },
  ...floorBaskets.map(({ x, z, radius, height }) => ({ x, z, w: radius * 2, d: radius * 2, y: height + 0.36, cartBody: true })),
  scaleLayout,
  { x: -0.78, z: 3.38, w: 0.77, d: 0.58, y: 1.67 },
  { x: 0.79, z: 3.35, w: 0.96, d: 0.97, y: 1.95 },
  ...produceStands.map(({ x, z, length }) => ({ x, z, w: 1.01, d: length + 0.08, y: 1.05 })),
];

export const cartObstacles = [
  ...furniture.map((obstacle) => ({ ...obstacle, z: obstacle.z + cartOrigin.z })),
  ...cartRacks.map(({ x, z, w, d }) => ({ x, z, w: d, d: w, y: 1.0, rack: true })),
  { x: pastryLayout.x, z: pastryOriginZ - 0.57, w: 0.99, d: 6.86, y: 1.32 },
];


export function cartPathOpen(x, z) {
  if (Math.hypot(x - cartColumn.x, z - cartColumn.z) < cartColumn.radius + walkingMargin) return false;
  return !cartObstacles.some((item) => coversFloor(item, x, z, walkingMargin));
}
