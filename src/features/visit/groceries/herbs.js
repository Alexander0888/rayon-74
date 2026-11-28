import * as THREE from 'three';
import { Model, randomSource, tau, tubes } from '../model.js';
import { surface } from '../christmas/geometry.js';
import { herbPieces } from './layout.js';

const foliage = {
  origan:         { form: 'oval',   height: 0.127, width: 0.026, reach: 0.027, leaves: 8, colors: [0x456841, 0x658650, 0x658c4d] },
  thym:           { form: 'narrow', height: 0.125, width: 0.012, reach: 0.021, leaves: 12, colors: [0x586441, 0x6e7953, 0x5c7546] },
  'thym-citron':  { form: 'oval',   height: 0.111, width: 0.017, reach: 0.022, leaves: 10, colors: [0x63814a, 0x7a8b43, 0x648246] },
  ciboulette:     { form: 'blade',  height: 0.172, width: 0.009, reach: 0.029, leaves: 2, colors: [0x63864d, 0x44683c, 0x5e8646] },
  romarin:        { form: 'narrow', height: 0.157, width: 0.009, reach: 0.031, leaves: 14, colors: [0x52714c, 0x6c8460, 0x425e42] },
  aneth:          { form: 'fern',   height: 0.168, width: 0.021, reach: 0.027, leaves: 11, colors: [0x59864b, 0x6f9850, 0x3e733b] },
  cerfeuil:       { form: 'lobed',  height: 0.127, width: 0.028, reach: 0.027, leaves: 8, colors: [0x739246, 0x688b43, 0x537843] },
  menthe:         { form: 'tooth',  height: 0.142, width: 0.036, reach: 0.033, leaves: 6, colors: [0x4b7a45, 0x608a43, 0x436546] },
  basilic:        { form: 'oval',   height: 0.138, width: 0.039, reach: 0.038, leaves: 6, colors: [0x588646, 0x618846, 0x436b35] },
  coriandre:      { form: 'lobed',  height: 0.128, width: 0.030, reach: 0.037, leaves: 7, colors: [0x557c45, 0x628746, 0x739649] },
  sauge:          { form: 'tooth',  height: 0.131, width: 0.029, reach: 0.037, leaves: 6, colors: [0x7b8d6d, 0x879476, 0x667d59] },
  laurier:        { form: 'spear',  height: 0.173, width: 0.031, reach: 0.039, leaves: 6, colors: [0x3e562d, 0x4a6433, 0x547342] },
  'persil-plat':  { form: 'lobed',  height: 0.118, width: 0.032, reach: 0.037, leaves: 8, colors: [0x537b33, 0x678d3e, 0x45783b] },
  'persil-frise': { form: 'curly',  height: 0.108, width: 0.026, reach: 0.038, leaves: 12, colors: [0x719939, 0x618b35, 0x527e31] },
};

export const herbSizes = Object.fromEntries(Object.entries(foliage).map(([type, spec]) =>
  [type, { width: 0.106, depth: 0.107, height: spec.form === 'spear' ? 0.229 : 0.190, bottom: -0.018 }]));

function leafGeometry(form) {
  const serrated = ['lobed', 'tooth', 'curly'].includes(form);
  const mesh = surface(serrated ? 12 : 9, serrated ? 6 : 4, (u, v) => {
    const across = u * 2 - 1, edge = Math.abs(across);
    const taper = Math.sin(v * Math.PI) ** (form === 'spear' ? 1.16 : 0.62);
    const ripples = form === 'curly' ? 0.25 * Math.sin(v * 59) : form === 'lobed' ?
      0.32 * Math.sin(v * 26) : form === 'tooth' ? 0.091 * Math.sin(v * 73) : 0;
    const width = form === 'blade' ? (1 - v) * 0.23 : taper * 0.5 * (1 + ripples * edge);
    const curl = form === 'curly' ? Math.sin(v * 35 + across * 3) * 0.085 : Math.sin(v * 3) * 0.07;
    return [across * width, curl + taper * 0.19 * edge ** 1.7, v];
  });
  const uv = mesh.attributes.uv, colors = [];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const vein = Math.max(0, 1 - Math.abs(u - 0.5) * 14) * (1 - 0.28 * v);
    const shade = 0.74 + v * 0.15 + vein * 0.11 + Math.sin(v * 41 + u * 8) * 0.03;
    colors.push(shade, shade + vein * 0.02, shade * 0.91 + vein * 0.045);
  }
  mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return mesh;
}

function sleeveGeometry() {
  return surface(7, 22, (u, v) => {
    const a = u * tau;
    const fold = Math.sin(a * 5 + v * 1.4) * 0.004 + Math.sin(a * 9 - v * 4) * 0.0022;
    const r = 0.030 + v * 0.026 + fold * (0.36 + 0.64 * v);
    const lip = Math.sin(a * 3 + 0.4) * 0.014 + Math.cos(a * 5) * 0.014;
    return [Math.sin(a) * r + v * v * 0.009,
      -0.048 + v * 0.235 + lip * v ** 2, Math.cos(a) * r * (0.96 + 0.05 * Math.sin(a * 4))];
  });
}

function dill(model, m, spec, random) {
  const main = [], fine = [];
  for (let i = 0; i < 11; i++) {
    const azimuth = i * 2.399;
    const h = spec.height * (0.68 + random() * 0.36);
    const x = Math.sin(azimuth) * spec.reach * (0.54 + random() * 0.48);
    const z = Math.cos(azimuth) * spec.reach * (0.54 + random() * 0.48);
    main.push([[0, -0.04, 0], [x * 0.37, h * 0.49, z * 0.37], [x, h, z]]);
    for (let node = 2; node <= 6; node++) {
      const t = node / 6, y = t * h;
      for (const side of [-1, 1]) {
        const a = azimuth + side * 1.16 + node * 0.18;
        const arm = (1.2 - t) * (0.017 + random() * 0.015);
        const dx = Math.sin(a) * arm, dz = Math.cos(a) * arm;
        const origin = [x * t, y, z * t];
        const top = [origin[0] + dx, y + arm * 0.43, origin[2] + dz];
        fine.push([origin, top]);
        for (let feather = 1; feather <= 3; feather++) {
          const f = feather / 4;
          const vx = origin[0] + dx * f, vz = origin[2] + dz * f, vy = y + arm * 0.43 * f;
          for (const side of [-1, 1]) {
            const w = side * arm * 0.41 * (1 - f);
            fine.push([[vx, vy, vz], [vx + Math.cos(a) * w, vy + Math.abs(w) * 0.79, vz - Math.sin(a) * w]]);
          }
        }
      }
    }
  }
  model.put(tubes(main, 0.001, 4), m.stem, [0, 0, 0]);
  model.put(tubes(fine, 0.00035, 3), m.fine, [0, 0, 0]);
}

function bunch(model, m, spec, random) {
  const branches = [];
  const tall = spec.form === 'spear' || spec.form === 'blade', tiny = spec.reach < 0.032;
  const stalks = tall ? 9 : 12;
  for (let stem = 0; stem < stalks; stem++) {
    const a = stem * 2.3999632;
    const height = spec.height * (0.49 + random() * 0.47);
    const spread = spec.reach * (0.44 + random() * 0.60);
    const x = Math.sin(a) * spread, z = Math.cos(a) * spread;
    branches.push([[0.004 * Math.cos(a), -0.045, 0.004 * Math.sin(a)], [x * 0.42, height * 0.36, z * 0.42], [x, height, z]]);
    for (let rank = 0; rank < spec.leaves; rank++) {
      const t = (rank + 2) / (spec.leaves + 1);
      const spin = a + (rank % 2 ? 1 : -1) * (0.54 + random() * 1.05);
      const width = spec.width * (0.64 + random() * 0.45) * (1.17 - 0.25 * t);
      const length = spec.form === 'blade' ? height * (0.65 + random() * 0.33) : width * (tall ? 2.1 : tiny ? 1.66 : 1.42);
      const pitch = spec.form === 'blade' ? -1.21 : tall ? -0.66 - random() * 0.61 : -0.35 - random() * 0.77;
      const level = spec.form === 'blade' ? -0.021 + rank * 0.017 : height * t - 0.019;
      const tilt = (random() - 0.5) * 0.55;
      model.put(m.leaves[spec.form], m.leaf, [x * t * 0.75, level, z * t * 0.75],
        [width, length, length], [pitch, spin, tilt, 'YXZ'], spec.colors[(stem + rank) % spec.colors.length]);
    }
  }
  model.put(tubes(branches, tiny ? 0.00105 : 0.00145, 4), m.stem, [0, 0, 0]);
}

export function makeHerbTemplates(m) {
  const leaf = m.material({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.70 });
  const glass = m.material({ color: 0xe2e9dd, roughness: 0.25, transparent: true, opacity: 0.19,
    side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.68, clearcoatRoughness: 0.24 }, true);
  const assets = {
    leaf, stem: m.paint(0x537642, 0.78), fine: m.paint(0x567c46, 0.74),
    leaves: Object.fromEntries(['oval', 'blade', 'narrow', 'tooth', 'spear', 'lobed', 'curly'].map((form) => [form, leafGeometry(form)])),
  };
  const sleeve = sleeveGeometry();
  return Object.fromEntries([...new Set(herbPieces.map(({ type }) => type))].map((type, index) => {
    const spec = foliage[type], random = randomSource(37334 + index * 157), model = new Model();
    if (spec.form === 'fern') dill(model, assets, spec, random);
    else bunch(model, assets, spec, random);
    model.put(sleeve, glass, [0, 0, 0], [1, herbSizes[type].height / 0.197, 1]);
    return [type, model];
  }));
}
