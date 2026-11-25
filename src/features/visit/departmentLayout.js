import { standBounds } from './christmas/layout.js';
import { column, produceStands } from './surroundingsLayout.js';

const cartBackEdge = -0.65;
const walkingMargin = 0.135;

export const passageLength = 10;
export const cartOrigin = { x: 0, z: standBounds.front + passageLength - cartBackEdge };
export const departmentBounds = {
  left: -5.02,
  right: 5.36,
  back: standBounds.back - 2,
  front: cartOrigin.z + 4.83,
};

// Оба ракурса смотрят вдоль прохода справа от прилавков за телегой.
export const walkFromCart = {
  x: 2.44, z: cartOrigin.z - 1.10, yaw: 0.225, pitch: -0.055,
};
const noelWalkZ = 2.48;
export const walkFromNoel = {
  x: walkFromCart.x - (walkFromCart.z - noelWalkZ) * Math.tan(walkFromCart.yaw),
  z: noelWalkZ, yaw: walkFromCart.yaw, pitch: -0.104,
};

export const mapCenter = {
  x: (departmentBounds.left + departmentBounds.right) / 2,
  z: (standBounds.back + cartOrigin.z + 3.95) / 2,
};

const furniture = [
  { x: 0, z: 0, w: 2.34, d: 1.30, y: 1.25, cartBody: true },
  { x: -1.29, z: -0.16, w: 0.70, d: 1.26, y: 1.35, cartBody: true },
  { x: 1.52, z: -0.012, w: 1.18, d: 1.36, y: 1.11, cartBody: true },
  { x: 1.91, z: -0.42, w: 0.41, d: 0.36, y: 1.51 },
  { x: -1.39, z: -0.91, w: 0.56, d: 0.56, y: 1.35 },
  { x: 4.06, z: -0.57, w: 0.99, d: 6.86, y: 1.32 },
  { x: -0.78, z: 3.38, w: 0.77, d: 0.58, y: 1.67 },
  { x: 0.79, z: 3.35, w: 0.96, d: 0.97, y: 1.95 },
  ...produceStands.map(({ x, z, length }) => ({ x, z, w: 1.01, d: length + 0.08, y: 1.05 })),
];

export const cartObstacles = furniture.map((obstacle) => ({ ...obstacle, z: obstacle.z + cartOrigin.z }));


export function cartPathOpen(x, z) {
  if (Math.hypot(x - column.x, z - (column.z + cartOrigin.z)) < column.radius + walkingMargin) return false;
  return !cartObstacles.some((item) => (
    Math.abs(x - item.x) < item.w / 2 + walkingMargin && Math.abs(z - item.z) < item.d / 2 + walkingMargin
  ));
}
