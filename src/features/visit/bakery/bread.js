import * as THREE from 'three';
import { Model, randomSource, rounded } from '../model.js';
import { counterShelfY } from './layout.js';
import { addPastrySign } from './stands.js';

function addLoaf(model, pastry, { x, y = 0, z, width, length, rotation = 0, tint = 0xffffff, bagged = false }) {
  const bread = model.child([x, y, z], [0, rotation, 0]);
  const height = width * 0.50;
  bread.put(pastry.pastry, pastry.bread, [0, height * 0.72, 0], [width * 0.5, height, length], undefined, tint);
  const scoreCount = Math.round(length / 0.118);
  for (let i = 0; i < scoreCount; i++) {
    const fraction = (i + 1) / (scoreCount + 1);
    const rise = Math.sin(Math.PI * fraction) ** 0.56;
    bread.put(rounded, pastry.dust, [0.007, height * (0.74 + 0.78 * rise), (fraction - 0.5) * length],
      [width * 0.52 * rise, 0.0014, Math.min(0.014, width * 0.14)], [0.1, -0.54, -0.10], 0xb59061);
  }
  if (bagged) {
    bread.put(pastry.shell, pastry.film, [0, 0.004, 0], [width * 1.16, height * 2.13, length + 0.026], [0, 0.018, -0.02]);
    bread.put(pastry.labels[6], pastry.paper, [0.001, height * 1.69, length * 0.11],
      [width * 0.52, 0.034, 1], [-Math.PI / 2, 0, -0.07]);
  }
}

export function stockBakeryCounter(model, materials, pastry, stand) {
  const { d } = stand;
  const servingDeck = model.child([0, counterShelfY + 0.018, -0.063], [0.143, 0, 0]);
  for (let index = 0; index < 4; index++) {
    const x = (index + 0.5 - 2) * 0.458;
    servingDeck.box(materials.finish, [x, 0, 0], [0.450, 0.023, d - 0.21]);
    servingDeck.box(materials.wood, [x, 0.012, 0.401], [0.451, 0.023, 0.025]);
  }
  for (const [x, z, yaw] of [[-0.72, 0.18, -0.5], [-0.29, -0.045, -0.14], [-0.31, -0.25, 0.12]]) {
    const sandwich = servingDeck.child([x, 0.014, z], [0, yaw, 0]);
    sandwich.put(pastry.pastry, pastry.bread, [0, 0.023, 0], [0.041, 0.026, 0.229]);
    sandwich.put(pastry.pastry, pastry.leaf, [0, 0.030, 0.01], [0.046, 0.006, 0.225]);
    sandwich.put(pastry.pastry, pastry.bread, [0, 0.047, 0], [0.039, 0.025, 0.232], [0.11, 0, 0.03]);
  }
  for (const [x, z, rotation] of [[0.28, -0.08, -1.07], [0.50, 0.07, -1.08], [0.60, 0.19, 0.21], [0.71, 0.31, 0.63]]) {
    addLoaf(servingDeck, pastry, { x, y: 0.013, z, width: 0.11, length: 0.171, rotation, tint: 0xf0c180 });
  }
  for (const [x, z] of [[-0.59, 0.43], [0.27, 0.44], [0.59, 0.44], [0.81, 0.42]]) {
    servingDeck.box(materials.seal, [x, 0.028, z], [0.072, 0.043, 0.007], [-0.24, 0, 0]);
    servingDeck.box(pastry.dust, [x - 0.012, 0.033, z + 0.004], [0.036, 0.0035, 0.001], [-0.24, 0, 0]);
    servingDeck.box(pastry.dust, [x + 0.015, 0.022, z + 0.004], [0.012, 0.005, 0.001], [-0.24, 0, 0]);
  }
  addPastrySign(model, materials, 1, 1.87, 0.214, -0.425, 2.60);
  for (const x of [-0.84, 0.87]) model.box(materials.fascia, [x, 1.481, -0.485], [0.044, 2.54, 0.045]);
}

export function makeBreadLayout(m, materials, pastry, textures, stand) {
  const model = new Model();
  const { w } = stand, slope = 0.953;
  textures.wicker.wrapS = textures.wicker.wrapT = THREE.RepeatWrapping;
  textures.wicker.repeat.set(1.5, 2);
  const woven = m.material({ map: textures.wicker, bumpMap: textures.wicker, bumpScale: 0.0037, roughness: 0.90,
    color: 0xebc398 });
  const bind = m.paint(0xa47140, 0.77);
  const support = m.paint(0x46494b, 0.65, 0.50);
  const breadSurface = model.child([0, 0.85, 0], [slope, 0, 0]);
  const length = 1.47, pitch = w / 6;

  for (const x of [-w / 2 + 0.060, -w / 6, w / 6, w / 2 - 0.060]) {
    model.rod(support, [x, 0.018, 0.442], [x, 0.23, 0.414], 0.015);
    model.rod(support, [x, 0.022, -0.436], [x, 1.476, -0.437], 0.015);
    model.rod(support, [x, 0.055, 0.442], [x, 0.055, -0.438], 0.014);
    model.rod(support, [x, 1.05, -0.435], [x, 0.23, 0.425], 0.012);
    for (const z of [-0.435, 0.441]) model.box(materials.seal, [x, 0.015, z], [0.052, 0.028, 0.051]);
  }
  breadSurface.box(support, [0, -0.022, 0], [w, 0.040, length + 0.045]);

  function basket(x, z, depth, width, long) {
    const basket = breadSurface.child([x, 0.003, z]);
    basket.box(woven, [0, 0, 0], [width, 0.021, depth]);
    for (const sign of [-1, 1]) {
      const offset = sign * width * 0.48;
      basket.box(woven, [offset, 0.041, 0], [0.023, 0.090, depth], [0, 0, -sign * 0.10]);
      basket.rod(bind, [offset, 0.087, -depth / 2], [offset, 0.087, depth / 2], 0.008);
    }
    for (const edge of [-1, 1]) {
      const z = edge * depth / 2;
      basket.box(woven, [0, 0.038, z], [width, 0.077, 0.021], [edge * 0.09, 0, 0]);
      basket.rod(bind, [-width / 2, 0.077, z], [width / 2, 0.077, z], 0.008);
    }
    if (long) basket.box(woven, [0, 0.013, depth * 0.279], [width - 0.04, 0.019, 0.038]);
    return basket;
  }

  const random = randomSource(719);
  for (let column = 0; column < 6; column++) {
    const x = (column - 2.5) * pitch;
    const long = column < 2;
    const rows = long ? 2 : 4;
    const rowDepth = length / rows;
    for (let row = 0; row < rows; row++) {
      const z = (row + 0.5 - rows / 2) * rowDepth;
      const grid = basket(x, z, rowDepth - 0.012, pitch - 0.015, long);
      const count = long ? (column + row) % 3 : 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const shift = (i + 0.5 - count / 2) * ((pitch - 0.062) / count);
        const width = long ? 0.066 : Math.min(0.109, (pitch - 0.06) / count);
        addLoaf(grid, pastry, { x: shift + (random() - 0.5) * 0.018,
          y: 0.015, z: long ? 0.036 : (random() - 0.5) * 0.082, width,
          length: long ? 0.47 + 0.14 * random() : 0.16 + random() * 0.081,
          rotation: (random() - 0.5) * (long ? 0.14 : 0.77),
          tint: [0xffd393, 0xfac486, 0xf2bf7d][(column + row + i) % 3],
          bagged: long || (i + column + row) % 3 !== 0 });
      }
    }
  }
  return model;
}
