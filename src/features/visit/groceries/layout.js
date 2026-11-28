import { COLUMNS, ROWS } from '../../herbs/data/plans.js';
import { saladStand, mushroomStand } from '../salads/layout.js';
import { column, scaleLayout } from '../surroundingsLayout.js';

const yaw = -Math.PI / 2;
const seam = 0.012;
const startZ = saladStand.z - saladStand.w / 2;
const backX = saladStand.x - saladStand.d / 2 - 0.04;
const oliveWidth = 2.32;
const herbWidth = 1.344;
const oliveDepth = 1.29;
const herbDepth = 1.35;

export const oliveStand = {
  id: 'olive-stand', name: 'Présentoir d’olives',
  x: backX - oliveDepth / 2, z: startZ + oliveWidth / 2,
  w: oliveWidth, d: oliveDepth, yaw, y: 0.84, slope: 0.40, cheek: [0.55, 1.24],
};

export const herbStand = {
  id: 'herb-stand', name: 'Présentoir d’herbes fraîches',
  x: backX - herbDepth / 2, z: startZ + oliveWidth + seam + herbWidth / 2,
  w: herbWidth, d: herbDepth, yaw, y: 0.895, slope: 0.415, cheek: [0.57, 1.22],
};

const radius = 0.29;
export const herbColumn = {
  id: 'herb-column', x: mushroomStand.x - mushroomStand.w / 2 - radius - 0.006,
  z: herbStand.z + herbStand.w / 2 + radius + 0.005,
  radius, height: column.height,
};

export const herbScale = {
  ...scaleLayout, id: 'herb-scale', yaw,
  x: herbColumn.x - radius - scaleLayout.d / 2 - 0.013,
  z: herbColumn.z + 0.025,
};

export const walkFromGroceries = { x: -2.57, z: 3.94, yaw: -1.49, pitch: -0.29 };

export const oliveTiers = [
  { back: -0.617, front: -0.327, y: 1.137, rows: [-0.554, -0.414] },
  { back: -0.327, front: -0.035, y: 0.943, rows: [-0.263, -0.119] },
  { back: -0.035, front: 0.257, y: 0.756, rows: [0.030, 0.173] },
  { back: 0.257, front: 0.617, y: 0.575, rows: [0.529] },
];

const oliveColumns = 16;
const packagePitch = 0.137;
export const oliveSlots = oliveTiers.flatMap(({ y, rows }) => rows.map((z) => ({ y, z })))
  .flatMap(({ y, z }, row) => Array.from({ length: oliveColumns }, (_, column) => ({
    id: [row + 1, column + 1].join(':'), x: (column + 0.5 - oliveColumns / 2) * packagePitch, y, z,
    halfWidth: 0.068, halfDepth: 0.070, slope: 0,
  })));

// Указана высота каждой стопки, от моркови к травам. Пустые места видны на фото.
const oliveRows = [
  'purple2 purple1 purple1 purple1 basil1 basil1 oriental-pot2 oriental-pot3 oriental-pot3 oriental-pot2 lemon-pot2 lemon-pot1 lemon-pot2 lemon-pot2 lupin3 lupin3',
  'purple3 purple1 purple1 purple1 basil1 basil2 oriental-pot2 oriental-pot2 oriental-pot2 oriental-pot3 lemon-pot2 lemon-pot1 lemon-pot3 lemon-pot3 lupin2 lupin3',
  '- kalamata1 piquant1 piquant2 piquant1 garlic1 garlic1 garlic1 herbs1 rose1 lemon-pot1 doux1 doux1 doux2 citron2 citron2',
  'kalamata3 kalamata3 piquant3 piquant3 piquant3 garlic3 garlic3 garlic3 rose2 rose3 lemon-pot1 doux3 doux3 doux3 citron3 citron3',
  'black1 black1 - - citron1 citron1 provencale1 - aperitif2 aperitif2 aperitif2 oriental1 - oriental2 green2 green1',
  'black3 black2 herbs1 herbs1 citron3 citron3 provencale3 provencale2 aperitif3 aperitif3 aperitif3 oriental3 oriental3 oriental3 green3 green3',
  'black3 black3 herbs3 herbs3 citron3 citron3 provencale3 provencale3 aperitif3 aperitif3 aperitif3 oriental3 oriental3 oriental3 green3 green3',
];

export const olivePieces = oliveRows.flatMap((row, rowIndex) => row.split(' ').flatMap((stack, column) => {
  if (stack === '-') return [];
  const type = stack.slice(0, -1);
  const count = Number(stack.at(-1));
  const slot = rowIndex * oliveColumns + column;
  return Array.from({ length: count }, (_, layer) => ({
    id: 'olive-pack-' + oliveSlots[slot].id + ':' + (layer + 1), type, slot, layer,
  }));
}));

export const herbHoleRadius = 0.058;
export const herbSlots = Array.from({ length: COLUMNS * ROWS }, (_, index) => {
  const row = Math.floor(index / COLUMNS), column = index % COLUMNS;
  const z = -0.545 + row * 0.144;
  return {
    id: [row + 1, column + 1].join(':'), x: (column + 0.5 - COLUMNS / 2) * 0.190,
    y: herbStand.y - z * Math.sin(herbStand.slope), z: z * Math.cos(herbStand.slope),
    plateZ: z, radius: 0.074, slope: herbStand.slope,
  };
});

const herbRows = [
  '- - - - - -',
  '- - - - - -',
  '- - - - - -',
  '- - - - origan thym-citron',
  '- ciboulette romarin - thym origan',
  '- aneth aneth ciboulette thym cerfeuil',
  'menthe basilic coriandre sauge laurier laurier',
  'persil-plat persil-plat sauge persil-frise persil-frise persil-frise',
];

export const herbPieces = herbRows.flatMap((row) => row.split(' ')).flatMap((type, slot) =>
  type === '-' ? [] : [{ id: 'herb-bunch-' + herbSlots[slot].id, type, slot, layer: 0 }]);
