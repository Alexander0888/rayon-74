import * as THREE from 'three';
import { atlasUV, cylinder, Model, plane, rounded, tau, tubes } from '../model.js';
import { randomFrom, surface } from '../christmas/geometry.js';
import { crateMaterials, crateShell } from '../carrot/crates.js';

import { pearTypes } from './layout.js';

const varieties = {
  abate:      { tile: 0, radius: 0.041, height: 1.54, shoulder: 0.47, tint: [0xe4e3b3, 0xd6cb97, 0xe8dcab, 0xcdb888], label: 0 },
  decana:     { tile: 1, radius: 0.045, height: 1.02, shoulder: 0.83, tint: [0xdde49d, 0xd2df9e, 0xe9dda0, 0xcfd7a8], label: 1 },
  kaiser:     { tile: 2, radius: 0.035, height: 1.26, shoulder: 0.54, tint: [0xe7d2a8, 0xd1b994, 0xe5d4aa, 0xd3be9d], label: 2 },
  conference: { tile: 3, radius: 0.038, height: 1.40, shoulder: 0.50, tint: [0xd4dcaa, 0xf2dfa9, 0xd2d4a8, 0xd5c79c], label: 3 },
  fred:       { tile: 4, radius: 0.037, height: 1.18, shoulder: 0.64, tint: [0xe5e0a3, 0xfaf0b6, 0xe9d1a1, 0xe3e3ab], blush: 0xf8a67f, label: 4 },
  nashi:      { tile: 5, radius: 0.044, height: 0.95, shoulder: 0.91, tint: [0xffeecb, 0xffe4c0, 0xf0d9b8, 0xffe8c0], label: 5 },
  swiss:      { tile: 6, radius: 0.029, height: 1.12, shoulder: 0.65, tint: [0xe8dfac, 0xffeba1, 0xe1d298, 0xf3e8a9], label: 6 },
  louise:     { tile: 7, radius: 0.035, height: 1.22, shoulder: 0.55, tint: [0xcae19b, 0xe4eaa5, 0xe7de9e, 0xd0d788], label: 7 },
  williams:   { tile: 8, radius: 0.034, height: 1.23, shoulder: 0.53, tint: [0xffe2a2, 0xeeda9b, 0xe8df9f, 0xffd790] },
  blush:      { tile: 9, radius: 0.035, height: 0.94, shoulder: 0.97, tint: [0xfcddaf, 0xebd5a9, 0xf2dfaf, 0xf0e8b6], blush: 0xee8173 },
  golden:     { tile: 10, radius: 0.035, height: 0.93, shoulder: 0.96, tint: [0xdfdc87, 0xffdf87, 0xf4de95, 0xdedd9f] },
  red:        { tile: 11, radius: 0.033, height: 0.94, shoulder: 0.97, tint: [0xef8f70, 0xd95c54, 0xf7ad8b, 0xe48269] },
};

function body({ tile, shoulder, blush }) {
  const geometry = new THREE.LatheGeometry([
    [0, -0.92], [0.45, -0.93], [0.74, -0.77], [0.94, -0.51], [1, -0.19],
    [0.94, 0.09], [0.70 + 0.23 * shoulder, 0.33], [shoulder, 0.63],
    [0.74 * shoulder, 0.83], [0.4 * shoulder, 0.96], [0, 0.9],
  ].map(([x, y]) => new THREE.Vector2(x, y)), tile < 8 ? 24 : 15);
  const point = geometry.attributes.position, colors = [];
  const shade = new THREE.Color(), russet = new THREE.Color(blush ?? 0xffffff);
  for (let i = 0; i < point.count; i++) {
    const x = point.getX(i), y = point.getY(i), z = point.getZ(i);
    const angle = Math.atan2(z, x);
    const swell = 1 + 0.022 * Math.cos(5 * angle + y) + 0.017 * Math.sin(3 * angle + 2 * y);
    point.setXYZ(i, x * swell + 0.063 * y ** 2, y, z * swell * 0.96);
    const mix = THREE.MathUtils.smoothstep(x + y * 0.3 + z * 0.14, 0.12, 0.93);
    colors.push(...shade.setHex(0xffffff).lerp(russet, mix).toArray());
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return atlasUV(geometry, tile, 4, 3, 0.016, 0.016);
}

const foam = (() => {
  const strands = [];
  for (const twist of [-1, 1]) {
    for (let i = 0; i < 19; i++) {
      const path = [];
      for (let k = 0; k <= 17; k++) {
        const y = -0.84 + k / 17 * 1.59;
        const angle = i / 19 * tau + twist * k / 17 * 1.8;
        const radius = Math.sqrt(1 - y ** 2) * 1.045 + 0.018;
        path.push([radius * Math.cos(angle), y, radius * Math.sin(angle)]);
      }
      strands.push(path);
    }
  }
  return tubes(strands, 0.034, 4);
})();

const handle = surface(3, 14, (u, v) => [
  (u - 0.5) * 0.114,
  Math.sin(u * Math.PI) * 0.063,
  (0.5 - v) * 0.015,
]);

export function orchardMaterials(m, textures) {
  return {
    ...crateMaterials(m),
    skin: m.material({ map: textures['orchard-skins'], bumpMap: textures['orchard-skins'], bumpScale: 0.00063,
      vertexColors: true, roughness: 0.66 }),
    labels: m.material({ map: textures['price-cards'], roughness: 0.67 }),
    stem: m.paint(0x67503a, 0.9),
    nashiWrap: m.paint(0xf4ebd5, 0.89),
    fibre: m.material({ color: 0xf5eee0, side: THREE.DoubleSide, roughness: 0.87 }),
    trayBand: m.paint(0xa23b33, 0.82),
    sticker: m.paint(0x366c9c, 0.60),
    white: m.paint(0xece8d9, 0.61),
    bodies: Object.fromEntries(Object.entries(varieties).map(([name, spec]) => [name, body(spec)])),
  };
}

export function marketCard(model, m, index, x, y, z, width = 0.114, tilt = -0.33, yaw = 0) {
  const h = width * 186 / 256;
  model.box(m.plastic, [x, y - h * 0.57, z - 0.013], [0.018, 0.061, 0.018]);
  const face = model.child([x, y, z], [tilt, yaw, 0]);
  face.put(rounded, m.lip, [0, 0, 0], [width + 0.005, h + 0.005, 0.006]);
  const print = atlasUV(plane.clone(), index, 5, 2, 0.012, 0.012);
  face.put(print, m.labels, [0, 0, 0.0036], [width, h, 1]);
}

function fruit(model, m, type, position, radius, orient, tint, variant) {
  const spec = varieties[type];
  const pear = model.child(position, orient, [radius, radius * spec.height, radius]);
  pear.put(m.bodies[type], m.skin, [0, 0, 0], undefined, undefined, tint);
  if (type === 'nashi') {
    pear.put(foam, m.nashiWrap, [0, 0, 0], [0.99, 1.08, 0.98]);
    return;
  }
  pear.put(cylinder, m.stem, [0.07, 1.017, 0.005], [0.052, type === 'abate' ? 0.23 : 0.18, 0.055], [0.13, 0, -0.26]);
  if (type === 'fred' && variant % 5 === 1) {
    pear.put(rounded, m.white, [0.08, -0.15, 0.969], [0.25, 0.20, 0.032], [0.04, 0.1, 0.46]);
    pear.put(rounded, m.sticker, [0.08, -0.15, 0.985], [0.19, 0.14, 0.025], [0.04, 0.1, 0.46]);
  }
}

function packaged(model, m, rng) {
  const { radius, tint } = varieties.swiss;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 2; col++) {
    const box = model.child([(col - 0.5) * 0.164, 0.03, (row - 2) * 0.108], [0, (rng() - 0.5) * 0.1, 0]);
    box.box(m.fibre, [0, 0.006, 0], [0.142, 0.011, 0.094]);
    for (const side of [-1, 1]) {
      box.box(m.fibre, [side * 0.072, 0.023, 0], [0.0035, 0.035, 0.098], [0, 0, -side * 0.22]);
      box.box(m.fibre, [0, 0.022, side * 0.047], [0.145, 0.033, 0.0035], [side * 0.25, 0, 0]);
    }
    box.box(m.trayBand, [0, 0.027, 0.050], [0.094, 0.010, 0.001]);
    box.put(handle, m.fibre, [0, 0.024, 0], [0.88, 1.2, 1.1], [0, Math.PI / 2, 0]);
    for (let i = 0; i < 3; i++) {
      fruit(box, m, 'swiss', [(i - 1) * 0.043, 0.030, ((i % 2) - 0.5) * 0.034],
        radius * (0.85 + rng() * 0.19), [rng() - 0.5, rng() * tau, 1.4 + rng() * 0.36], tint[(row + col + i) % 4], i);
    }
  }
}

function pile(model, m, type, rng, bulk) {
  const { radius, tint } = varieties[type];
  const baseColumns = type === 'nashi' || type === 'decana' ? 3 : 4;
  const layers = bulk ? 1 : 2;
  for (let layer = 0; layer < layers; layer++) {
    const columns = baseColumns - layer;
    for (let row = 0; row < 6 - layer; row++) for (let col = 0; col < columns; col++) {
      if (layer && rng() < (type === 'decana' ? 0.62 : 0.25)) continue;
      const size = radius * (0.90 + rng() * 0.28);
      const x = (col + 0.5 - columns / 2) * (0.34 / columns) + (rng() - 0.5) * 0.024;
      const z = (row + 0.5 - (6 - layer) / 2) * (0.51 / (6 - layer)) + (rng() - 0.5) * 0.036;
      const rise = 0.064 + layer * 0.061 + rng() * 0.016;
      const orient = [(rng() - 0.5) * 2.45, rng() * tau, (rng() - 0.5) * 2.6];
      fruit(model, m, type, [x, rise, z], size, orient, tint[Math.floor(rng() * tint.length)], col + 3 * row);
    }
  }
}

export function fillFruitCrate(model, m, type, seed, showCard = true) {
  const rng = randomFrom(seed);
  crateShell(model, m);
  if (type === 'swiss') packaged(model, m, rng);
  else pile(model, m, type, rng, !showCard);
  if (showCard) marketCard(model, m, varieties[type].label, -0.093, 0.188, -0.257, 0.132);
}

export function makePearCrates(m) {
  return pearTypes.map((type, index) => {
    const model = new Model();
    fillFruitCrate(model, m, type, 82400 + 757 * index);
    return model.finish(type);
  });
}
