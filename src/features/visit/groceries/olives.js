import * as THREE from 'three';
import { atlasUV, Model, plane, randomSource, tau } from '../model.js';
import { surface } from '../christmas/geometry.js';

const flat = { width: 0.129, depth: 0.115, height: 0.039, shape: 'tray' };
const cup = { width: 0.116, depth: 0.110, height: 0.048, shape: 'cup' };
const pot = { width: 0.120, depth: 0.112, height: 0.071, shape: 'pot' };
const jar = { width: 0.094, depth: 0.091, height: 0.063, shape: 'jar' };
const olives = {
  black:          { ...flat, tape: 0x5d6161, fruit: [0x302b2d, 0x3e3536, 0x412d2c] },
  herbs:          { ...flat, tape: 0xa74841, fruit: [0xb19760, 0xa38a52, 0xc1a571], seasoning: 0xc3a65f },
  citron:         { ...flat, tape: 0xead077, fruit: [0xa69448, 0xac9658, 0xb5a461] },
  provencale:     { ...flat, tape: 0xabc049, fruit: [0x7f8b47, 0x929745, 0x8e8548], seasoning: 0x617441 },
  aperitif:       { ...flat, tape: 0xce9755, fruit: [0x957a45, 0x9c894b, 0xb09b5b], seasoning: 0xa26645 },
  oriental:       { ...flat, tape: 0xcd4941, fruit: [0xa28f56, 0x9e8b4c, 0xba9d5c], seasoning: 0xb24f33 },
  green:          { ...flat, tape: 0x649057, fruit: [0x5f7435, 0x77843c, 0x879649] },
  kalamata:       { ...flat, tape: 0x86454a, fruit: [0x493036, 0x543541, 0x623e40] },
  piquant:        { ...flat, tape: 0xe4813f, fruit: [0x9c8551, 0x887846, 0xa1794b], seasoning: 0xc65238 },
  garlic:         { ...flat, tape: 0x70ad7f, fruit: [0x92924e, 0xa79c58, 0x80914a], seasoning: 0x6e8648 },
  rose:           { ...flat, tape: 0xb96688, fruit: [0xb49d5a, 0x998750, 0xa89253] },
  doux:           { ...flat, tape: 0xc28b5b, fruit: [0xa59354, 0x8e834b, 0x9f8b4c] },
  purple:         { ...cup, tape: 0x5b4272, fruit: [0x453346, 0x372d37, 0x504050] },
  basil:          { ...cup, tape: 0xa4b748, fruit: [0x78913d, 0x74884c, 0x8a9e49], seasoning: 0x627a37 },
  'oriental-pot': { ...pot, tape: 0xb8493a, fruit: [0x978248, 0xaa935b, 0x746946], seasoning: 0xbe6342 },
  'lemon-pot':    { ...pot, tape: 0xcfb147, fruit: [0x8b8440, 0x9f9052, 0xa28c54], seasoning: 0x778e42 },
  lupin:          { ...jar, tape: 0xcba973, fruit: [0xd4b375, 0xdac38c, 0xe4c98c] },
};

export const oliveSizes = olives;

function packShell(shape) {
  const profile = [[0.80, 0], [0.86, 0.035], [0.94, 0.206], [0.965, 0.76], [1.008, 0.789],
    [1.015, 0.851], [0.971, 0.879], [0.971, 0.935], [0.927, 0.985], [0.825, 1], [0, 1]];
  const roundness = shape === 'tray' ? 0.78 : shape === 'pot' ? 0.87 : 1;
  return surface(profile.length - 1, 22, (u, v) => {
    const [r, y] = profile[Math.round(v * (profile.length - 1))];
    const angle = tau * u, x = Math.sin(angle), z = Math.cos(angle);
    return [Math.sign(x) * Math.abs(x) ** roundness * r * 0.5, y,
      Math.sign(z) * Math.abs(z) ** roundness * r * 0.5];
  });
}

function rim(shape) {
  const roundness = shape === 'tray' ? 0.78 : shape === 'pot' ? 0.87 : 1;
  return surface(3, 24, (u, v) => {
    const angle = tau * u, edge = tau * v;
    const x = Math.sin(angle), z = Math.cos(angle);
    const r = 0.496 + Math.cos(edge) * 0.009;
    return [Math.sign(x) * Math.abs(x) ** roundness * r, Math.sin(edge) * 0.5, Math.sign(z) * Math.abs(z) ** roundness * r];
  });
}

function contents(model, spec, m, random) {
  const small = spec.shape === 'tray';
  const bean = spec.shape === 'jar';
  const layers = small ? 2 : 3;
  for (let layer = 0; layer < layers; layer++) {
    const span = layer === 0 ? 0.71 : 0.79;
    for (let i = 0; i < 14; i++) {
      const spread = Math.sqrt((i + 1.75) / 15.8), angle = i * 2.3999632 + layer * 0.5 + (random() - 0.5) * 0.28;
      const x = Math.cos(angle) * spread * spec.width * span * 0.5;
      const z = Math.sin(angle) * spread * spec.depth * span * 0.5;
      const rise = spec.height * (0.19 + 0.62 * layer / (layers - 1)) + (random() - 0.5) * 0.006;
      const size = (bean ? 0.0070 : 0.0104) * (0.75 + random() * 0.38);
      const round = size * (bean ? 0.56 : 0.84);
      const y = THREE.MathUtils.clamp(rise, round + 0.002, spec.height - round - 0.002);
      const shade = spec.fruit[Math.floor(random() * spec.fruit.length)];
      model.put(m.olive, m.flesh, [x, y, z], [size, round, size * 1.31],
        [(random() - 0.5) * 0.58, random() * tau, (random() - 0.5) * 0.55], shade);
    }
  }
  if (!spec.seasoning) return;
  for (let i = 0; i < 7; i++) {
    const x = (random() - 0.5) * spec.width * 0.70;
    const z = (random() - 0.5) * spec.depth * 0.69;
    model.put(m.olive, m.flesh, [x, spec.height * 0.78 + 0.002, z],
      [0.002 + random() * 0.005, 0.0015, 0.003 + random() * 0.005], [0, random() * tau, 0], spec.seasoning);
  }
}

export function makeOliveTemplates(m, lids) {
  const shapes = ['tray', 'cup', 'pot', 'jar'];
  const shells = Object.fromEntries(shapes.map((shape) => [shape, packShell(shape)]));
  const rims = Object.fromEntries(shapes.map((shape) => [shape, rim(shape)]));
  const plastic = m.material({ color: 0xe3e5d6, transparent: true, opacity: 0.23, depthWrite: false,
    roughness: 0.23, clearcoat: 0.47, clearcoatRoughness: 0.20, side: THREE.FrontSide }, true);
  const lip = m.material({ color: 0xecefe5, transparent: true, opacity: 0.46, depthWrite: false, roughness: 0.27 });
  const print = m.material({ map: lids, color: 0xe8e5d8, alphaTest: 0.41, roughness: 0.50 });
  const tape = m.paint(0xffffff, 0.49);
  const fill = {
    olive: new THREE.SphereGeometry(1, 7, 4),
    flesh: m.material({ color: 0xbdb7a0, roughness: 0.45, clearcoat: 0.27, clearcoatRoughness: 0.28 }, true),
  };

  fill.flesh.userData.castShadow = false;

  return Object.fromEntries(Object.entries(olives).map(([type, spec], index) => {
    const model = new Model(), random = randomSource(914 + index * 163);
    const { width, height, depth, shape } = spec;
    contents(model, spec, fill, random);
    model.put(shells[shape], plastic, [0, 0, 0], [width, height, depth]);
    model.put(rims[shape], lip, [0, height * 0.135, 0], [width * 0.865, 0.0027, depth * 0.865]);
    for (const y of [0.854, 0.958]) model.put(rims[shape], lip, [0, height * y, 0], [width, 0.0027, depth]);
    const lid = atlasUV(plane.clone(), index, 6, 3, 0.007, 0.007);
    model.put(lid, print, [0, height + 0.0007, 0], [width * 0.978, depth * 0.974, 1], [-Math.PI / 2, 0, 0]);
    if (shape !== 'cup') {
      model.box(tape, [0, height * 0.75, depth * 0.494], [width * 0.31, height * 0.268, 0.0015], [0, 0, 0], spec.tape);
      model.box(tape, [0, height * 0.74, -depth * 0.494], [width * 0.31, height * 0.245, 0.0015], [0, 0, 0], spec.tape);
    }
    return [type, model];
  }));
}
