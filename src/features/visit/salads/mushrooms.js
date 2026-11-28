import { atlasUV, lathe, Model, plane, tau } from '../model.js';
import { randomFrom } from '../christmas/geometry.js';
import { crateShell } from '../carrot/crates.js';
import { paintedTexture } from '../texture.js';
import { crateSize } from '../carrot/layout.js';
import { mushroomCrateSize, mushroomIds, mushroomTypes } from './layout.js';
import { packet, rackCard } from './details.js';

const profiles = {
  shiitake: [[0.08, 0.48], [0.55, 0.48], [0.93, 0.55], [0.99, 0.66], [0.89, 0.90], [0.60, 1.13], [0.29, 1.23], [0, 1.23]],
  button: [[0.05, 0.56], [0.62, 0.48], [0.96, 0.53], [1, 0.76], [0.93, 1.06], [0.73, 1.32], [0.45, 1.48], [0, 1.54]],
  chanterelle: [[0.075, 0.29], [0.42, 0.46], [0.75, 0.61], [0.95, 0.85], [1, 1.05], [0.86, 1.07], [0.52, 0.67], [0.20, 0.51], [0, 0.50]],
  oyster: [[0.08, 0.43], [0.41, 0.54], [0.91, 0.65], [1, 0.74], [0.85, 0.91], [0.60, 1.00], [0.30, 0.97], [0, 0.78]],
};
const names = {
  shiitake: { mesh: 'shiitake', tile: 8, colors: [0xa0744d, 0x8f6848, 0xa78470], radius: 0.022 },
  brown: { mesh: 'button', tile: 8, colors: [0xa59079, 0x9d7658, 0x775b46], radius: 0.022 },
  white: { mesh: 'button', tile: 9, colors: [0xf0e9d9, 0xf5e3c5, 0xe6dbc1], radius: 0.020 },
  chanterelle: { mesh: 'chanterelle', tile: 10, colors: [0xe9a139, 0xe3a752, 0xe8bf78, 0xd98b36], radius: 0.022 },
  oyster: { mesh: 'oyster', tile: 11, colors: [0xd5c7a7, 0xc9af88, 0xdfd0b7], radius: 0.027 },
};

function capShape(type, spec) {
  const geometry = lathe(profiles[spec.mesh], 14);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    const isFan = type === 'oyster', isGolden = type === 'chanterelle';
    const wave = Math.sin(a * (isGolden ? 6 : 5) + 0.51) * (isGolden ? 0.15 : 0.056);
    const asymmetry = isFan ? 0.43 * r : 0.034 * r;
    pos.setXYZ(i, x * (1 + wave) + asymmetry, y + r * (r * wave * (isGolden ? 1.26 : 0.44) - x * 0.09),
      z * (1 + wave) * (isFan ? 0.72 : 1));
  }
  geometry.computeVertexNormals();
  return atlasUV(geometry, spec.tile, 4, 3, 0.018, 0.018);
}

function mushroom(model, m, type, [x, y, z], random, tilt) {
  const spec = names[type], size = spec.radius * (0.67 + random() * 0.59);
  const item = model.child([x, y, z], [(random() - 0.5) * tilt, random() * tau, (random() - 0.5) * tilt], [size, size, size]);
  const tint = spec.colors[Math.floor(random() * spec.colors.length)];
  item.put(m.stalk, m.root, [0, 0, 0], [1, 1, 1], [0, 0, 0], type === 'chanterelle' ? 0xeeb153 : 0xf2e4ca);
  item.put(m.caps[type], m.cap, [0, 0, 0], [1, 1, 1], [0, 0, 0], tint);
}

function loose(model, m, type, random) {
  for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) {
    if (random() < 0.14) continue;
    const x = (column - 2) * 0.045 + (random() - 0.5) * 0.056 + 0.03;
    const z = (row - 1.5) * 0.048 + (random() - 0.5) * 0.059 + 0.031;
    mushroom(model, m, type, [x, 0.040 + random() * 0.036, z], random, 3.55);
  }
}

function trays(model, m, type, random, sparse) {
  const organic = type.startsWith('organic-');
  const variety = type.includes('brown') ? 'brown' : type.includes('white') ? 'white' : type;
  for (const row of [-1, 1]) for (const col of [-1, 1]) {
    if ((sparse || type === 'mushroom-mix') && col < 0) continue;
    const tray = model.child([col * 0.082, 0.037 + random() * 0.021, row * 0.074],
      [(random() - 0.5) * 0.11, (random() - 0.5) * 0.24, (random() - 0.5) * 0.14]);
    packet(tray, m, [0.155, 0.061, 0.133], m.tray, organic ? type : null);
    for (let i = 0; i < 11; i++) {
      const x = (i % 4 - 1.5) * 0.029 + (random() - 0.5) * 0.019;
      const z = (Math.floor(i / 4) - 1) * 0.034 + (random() - 0.5) * 0.018;
      const piece = variety === 'mushroom-mix' ? ['chanterelle', 'oyster', 'brown'][i % 3] : variety;
      mushroom(tray, m, piece, [x, 0.024 + random() * 0.012, z], random, 2.94);
    }
  }
}

function crateBottom() {
  return paintedTexture(280, 260, (ctx, width, height) => {
    ctx.fillStyle = '#2c2d28';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#373832';
    ctx.lineWidth = 1;
    for (let x = 19; x < width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const x = 18 + col * 35 + (row % 2) * 7, y = 16 + row * 32;
      ctx.fillStyle = '#191a17';
      ctx.beginPath();
      ctx.roundRect(x - 7, y - 3, 14, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#0e0f0d';
      ctx.fillRect(x - 5, y - 2, 10, 2);
    }
  });
}

export function makeMushroomCrates(m, materials) {
  const texture = crateBottom();
  m.textures.mushroomCrateBottom = texture;
  const bottom = m.material({ map: texture, roughness: 0.69 });
  const assets = {
    ...materials,
    stalk: lathe([[0, 0], [0.27, 0.03], [0.31, 0.14], [0.27, 0.34], [0.22, 0.59], [0.18, 0.78], [0, 0.78]], 8),
    caps: Object.fromEntries(Object.entries(names).map(([type, spec]) => [type, capShape(type, spec)])),
  };
  return mushroomTypes.map((type, index) => {
    const model = new Model(), random = randomFrom(7357 + index * 531);
    const shell = model.child([0, 0, 0], undefined, [1, mushroomCrateSize.height / crateSize.height, mushroomCrateSize.depth / crateSize.depth]);
    crateShell(shell, assets);
    model.put(plane, bottom, [0, 0.0248, 0], [0.350, 0.340, 1], [-Math.PI / 2, 0, 0]);
    if (type === 'paris-brown' || type === 'paris-white') loose(model, assets, type.slice('paris-'.length), random);
    else trays(model, assets, type, random, index === 0);
    rackCard(model, assets, type, { y: 0.165, z: -0.167, width: 0.134 });
    return model.finish(mushroomIds[index]);
  });
}
