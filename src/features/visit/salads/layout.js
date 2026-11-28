import { carrotStand, cellDepth, crateSize, rackCells } from '../carrot/layout.js';
import { shiftMarket } from './marketPosition.js';

const carrots = shiftMarket(carrotStand);
const clearance = 0.022;
const startZ = carrots.z + carrots.d / 2 + clearance;
const saladLength = 3.70;
const mushroomDepth = 1.57;

export const saladStand = {
  id: 'salad-stand', name: 'Présentoir de salades', x: carrots.x + (carrots.w - carrots.d) / 2,
  z: startZ + saladLength / 2, w: saladLength, d: 1.25, y: 0.68, slope: 0.35,
  yaw: Math.PI / 2, columns: 9, rows: 2, cellDepth, cheek: [0.56, 0.98],
};

export const mushroomStand = {
  id: 'mushroom-stand', name: 'Présentoir de champignons', x: saladStand.x,
  z: startZ + saladLength + clearance + mushroomDepth / 2,
  w: 1.30, d: mushroomDepth, y: 0.72, slope: 0.31,
  yaw: 0, columns: 3, rows: 4, cellDepth: 0.38, cheek: [0.58, 1.15], dispenser: true,
};

export const saladTypes = [
  'trio', 'butter', 'batavia', 'romaine', 'radicchio', 'swiss-cucumber', 'bio-cucumber', 'mini-endive', 'radish',
  'trio', 'oakleaf', 'lamb', 'little-gem', 'iceberg', 'mini-cucumber', 'cucumber', 'endive', 'spring-onion',
];

export const mushroomTypes = [
  'shiitake', 'organic-brown', 'organic-white',
  'shiitake', 'paris-white-pack', 'paris-brown-pack',
  'chanterelle', 'oyster', 'paris-white',
  'chanterelle', 'mushroom-mix', 'paris-brown',
];

export const mushroomCrateSize = { width: crateSize.width, depth: 0.364, height: 0.121 };

export const saladSlots = rackCells(saladStand.columns, saladStand.rows, saladStand.cellDepth);
export const mushroomSlots = rackCells(mushroomStand.columns, mushroomStand.rows, mushroomStand.cellDepth);

export const saladIds = [
  'salad-trio-back', 'salad-butter', 'salad-batavia', 'salad-romaine', 'salad-radicchio',
  'salad-swiss-cucumber', 'salad-bio-cucumber', 'salad-mini-endive', 'salad-radish',
  'salad-trio-front', 'salad-oakleaf', 'salad-lamb', 'salad-little-gem', 'salad-iceberg',
  'salad-mini-cucumber', 'salad-cucumber', 'salad-endive', 'salad-spring-onion',
];

export const mushroomIds = [
  'mushroom-shiitake-back', 'mushroom-organic-brown', 'mushroom-organic-white',
  'mushroom-shiitake-middle', 'mushroom-paris-white-pack', 'mushroom-paris-brown-pack',
  'mushroom-chanterelle-middle', 'mushroom-oyster', 'mushroom-paris-white',
  'mushroom-chanterelle-front', 'mushroom-mix', 'mushroom-paris-brown',
];

export const walkFromSalads = { x: 3.02, z: 5.17, yaw: 1.35, pitch: -0.30 };
