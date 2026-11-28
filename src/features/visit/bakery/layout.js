import { pastryOriginZ } from '../departmentLayout.js';
import { pastryLayout } from '../surroundingsLayout.js';
import { halfExtents, worldOffset } from '../floorGeometry.js';

const depth = 1.06;
const turn = Math.PI / 4;
const tallLength = 5.76;
const corner = { x: pastryLayout.x - depth / 2, z: pastryOriginZ + pastryLayout.z + tallLength / 2, yaw: -Math.PI / 2 + turn };
const miter = depth * Math.tan(turn / 2);

export const refrigeratedStand = {
  id: 'pastry', x: pastryLayout.x, z: pastryOriginZ + pastryLayout.z,
  yaw: -Math.PI / 2, w: tallLength, d: depth, height: 1.62, endCut: miter,
};

function alongCorner(id, start, width, height, startCut = 0) {
  return {
    id, ...worldOffset(corner, start + width / 2, -depth / 2), yaw: corner.yaw,
    w: width, d: depth, height, startCut,
  };
}

export const cakeCounter = alongCorner('pastry-case', 0, 2.24, 1.23, miter);
export const bakeryCounter = alongCorner('boulangerie-case', cakeCounter.w + 0.012, 1.93, 1.23);
export const breadStand = alongCorner('bread-stand', cakeCounter.w + bakeryCounter.w + 0.24, 2.26, 1.68);

const standBack = depth + 0.224;
const backMiter = standBack * Math.tan(turn / 2);
const backWidth = tallLength - backMiter;
const bentLength = cakeCounter.w + bakeryCounter.w + breadStand.w + 0.24;
const panelHeight = 2.45;
export const bakeryPartitions = [
  ...Array.from({ length: 4 }, (_, index) => ({
    x: corner.x + standBack, z: corner.z - tallLength + (index + 0.5) * backWidth / 4,
    yaw: refrigeratedStand.yaw, width: backWidth / 4, height: panelHeight,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    ...worldOffset(corner, backMiter + (index + 0.5) * (bentLength - backMiter) / 5, -standBack),
    yaw: corner.yaw, width: (bentLength - backMiter) / 5, height: panelHeight,
  })),
].map((pose, index) => ({ id: 'bakery-wall-' + (index + 1), ...pose }));

export const walkFromBakery = { x: 2.17, z: 13.3, yaw: -1.80, pitch: -0.29 };

export const coldShelves = [
  { y: 0.605, front: 0.454 },
  { y: 0.856, front: 0.301 },
  { y: 1.091, front: 0.205 },
  { y: 1.323, front: 0.138 },
];
export const counterShelfY = 0.614;
export const shelfBack = -0.482;

export function caseEnds(stand, z) {
  const nearBack = 0.5 - z / stand.d;
  return [-stand.w / 2 + (stand.startCut ?? 0) * nearBack, stand.w / 2 - (stand.endCut ?? 0) * nearBack];
}

const coldRows = [
  { tier: 0, z: 0.288, types: 'sandwich brioche milk eclairs raspberry-pair strawberry-pair - flan-slice assorted - flan chocolate raspberry raspberry mixed mixed raspberry raspberry' },
  { tier: 0, z: -0.005, types: '- sandwich milk eclairs raspberry-pair vanilla-pair assorted assorted - flan-slice chocolate chocolate - raspberry mixed - raspberry -' },
  { tier: 0, z: -0.304, types: 'sandwich - milk - eclairs raspberry-pair - - - assorted - - - - - - - -' },
  { tier: 1, z: 0.139, types: 'sandwich sandwich milk eclairs eclairs raspberry-pair strawberry-pair vanilla-pair vanilla-pair assorted flan flan raspberry raspberry raspberry raspberry mixed -' },
  { tier: 1, z: -0.175, types: '- sandwich - eclairs - raspberry-pair strawberry-pair - vanilla-pair - - flan raspberry - raspberry - - -' },
  { tier: 2, z: 0.048, types: 'sandwich - milk eclairs eclairs strawberry-pair raspberry-pair vanilla-pair vanilla-pair chocolate-cup tiramisu tiramisu crumble crumble mixed mixed raspberry -' },
  { tier: 2, z: -0.264, types: '- sandwich - eclairs - raspberry-pair - - vanilla-pair chocolate-cup chocolate-cup tiramisu - - - - - -' },
  { tier: 3, z: -0.025, types: 'sandwich brioche brioche brioche - strawberry-pair chocolate-cup tiramisu tiramisu macaron macaron flan - flan flan flan - -' },
  { tier: 3, z: -0.328, types: '- brioche - brioche - - - - tiramisu - macaron - - - - - - -' },
];

const lowRows = [
  { z: 0.341, types: 'mini-strawberry mini-berry mini-berry mini-chocolate mini-chocolate mini-berry mini-berry mini-custard mini-custard mini-choux mini-choux mini-custard mini-choux mini-choux mini-choux' },
  { z: 0.170, types: 'mini-berry mini-berry mini-strawberry mini-strawberry mini-chocolate mini-berry mini-berry mini-custard mini-custard mini-choux mini-choux mini-custard mini-choux mini-choux mini-berry' },
  { z: -0.001, types: 'mini-berry mini-berry mini-strawberry mini-strawberry mini-chocolate mini-chocolate mini-berry mini-berry mini-berry mini-custard mini-choux mini-custard mini-choux mini-choux mini-custard' },
  { z: -0.172, types: '- mini-berry mini-strawberry mini-strawberry mini-chocolate mini-chocolate mini-berry mini-berry mini-berry mini-custard mini-choux mini-custard mini-choux mini-choux mini-custard' },
  { z: -0.343, types: '- - mini-choux - mini-chocolate mini-berry mini-berry mini-berry mini-custard mini-custard mini-custard mini-choux mini-choux - mini-choux' },
];

function pastryStock(stand, rows, pitch, halfDepth) {
  const slots = [], pieces = [];
  rows.forEach(({ tier, z, types }, row) => {
    const y = tier === undefined ? counterShelfY : coldShelves[tier].y;
    const positions = types.split(' ');
    const [left, right] = caseEnds(stand, z - halfDepth);
    positions.forEach((type, column) => {
      const x = (column + 0.5 - positions.length / 2) * pitch;
      if (x - pitch / 2 < left || x + pitch / 2 > right) return;
      const id = [row + 1, column + 1].join(':');
      if (type !== '-') pieces.push({ id: stand.id + '-product-' + id, type, slot: slots.length, layer: 0 });
      slots.push({ id, x, y, z, slope: 0, halfWidth: pitch / 2 - 0.004, halfDepth });
    });
  });
  return { slots, pieces };
}

export const refrigeratedStock = pastryStock(refrigeratedStand, coldRows, 0.306, 0.140);
export const counterStock = pastryStock(cakeCounter, lowRows, 0.139, 0.079);

export function fitsPastrySeat(stand, seat, { width, depth }, yaw) {
  const half = halfExtents({ w: width, d: depth }, yaw);
  const back = seat.z - half.z;
  const [left, right] = caseEnds(stand, back);
  const front = coldShelves.find(({ y }) => y === seat.y)?.front ?? stand.d / 2 - 0.02;
  return back >= shelfBack && seat.z + half.z <= front &&
    seat.x - half.x >= left && seat.x + half.x <= right;
}
