import * as THREE from 'three';
import { ball, cylinder, lathe, Model, photoPlane, randomSource, ring, rounded, tau, tubes } from './model.js';
import { bananas, fruit, ginger } from './produce.js';
import { cartWheelOffsetZ } from './surroundingsLayout.js';

const deck = 0.864;
const riser = deck + 0.215;
const yellowBowl = [-0.645, -0.425, 'yellowDragon', 0.143, 0.134, 3, 'net'];
const avocadoBasket = [1.345, 0.276, 0.282, 0.772, 1.02];
const pineappleBasket = [1.351, -0.285, 0.278, 0.855, 8];
const tyre = lathe(
  [
    [0.368, -0.023],
    [0.388, -0.023],
    [0.396, -0.017],
    [0.396, 0.017],
    [0.388, 0.023],
    [0.368, 0.023],
    [0.368, -0.023],
  ],
  72,
);
const spring = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.89, 0.8);
  s.quadraticCurveTo(-0.84, 0.417, -0.56, 0.405);
  s.lineTo(0.56, 0.405);
  s.quadraticCurveTo(0.84, 0.417, 0.89, 0.8);
  s.lineTo(0.86, 0.8);
  s.quadraticCurveTo(0.8, 0.445, 0.54, 0.438);
  s.lineTo(-0.54, 0.438);
  s.quadraticCurveTo(-0.8, 0.445, -0.86, 0.8);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 12 });
})();

function chassis(p, m) {
  for (const x of [-0.498, 0.498]) {
    p.rod(m.iron, [x, 0.398, -0.42], [x, 0.398, 0.42], 0.023);
    for (const z of [-cartWheelOffsetZ, cartWheelOffsetZ]) {
      const wheel = p.child([x, 0.398, z]);
      wheel.put(tyre, m.iron, [0, 0, 0], undefined, [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 14; i++) {
        const a = (i * tau) / 14;
        wheel.box(m.iron, [0.201 * Math.sin(a), 0.201 * Math.cos(a), 0], [0.019, 0.347, 0.014], [0, 0, -a]);
      }
      wheel.put(cylinder, m.iron, [0, 0, 0], [0.044, 0.095, 0.044], [Math.PI / 2, 0, 0]);
      wheel.put(cylinder, m.brass, [0, 0, Math.sign(z) * 0.067], [0.014, 0.013, 0.014], [Math.PI / 2, 0, 0]);
    }
  }
  for (const z of [-0.441, 0.441]) {
    p.put(spring, m.iron, [0, -0.012, z]);
    p.box(m.iron, [0, 0.601, z], [0.033, 0.394, 0.016]);
    p.box(m.iron, [0, 0.793, z], [1.84, 0.047, 0.04]);
  }
  for (const x of [-0.76, 0, 0.76]) p.box(m.oak, [x, 0.79, 0], [0.082, 0.087, 1.008]);
  for (let i = 0; i < 7; i++)
    p.box(
      m.oak,
      [0, deck - 0.022, -0.45 + i * 0.15],
      [2.04, 0.044, 0.149],
      undefined,
      [0xfff6e4, 0xf5e7d7, 0xfff7f0][i % 3],
    );
  for (const z of [-0.527, 0.527]) p.box(m.oak, [0, deck, z], [2.12, 0.085, 0.034]);
  for (const x of [-1.045, 1.045]) p.box(m.oak, [x, deck, 0], [0.036, 0.085, 1.04]);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      p.box(m.iron, [x * 0.986, deck + 0.045, z * 0.513], [0.139, 0.007, 0.036]);
      p.box(m.iron, [x * 1.041, deck + 0.045, z * 0.453], [0.031, 0.007, 0.144]);
      p.box(m.iron, [x * 0.986, deck - 0.013, z * 0.546], [0.143, 0.023, 0.007]);
      for (const d of [0.937, 0.994, 1.035]) {
        p.put(ball, m.iron, [x * d, deck + 0.049, z * 0.51], [0.008, 0.005, 0.008]);
        p.put(ball, m.iron, [x * d, deck - 0.013, z * 0.551], [0.007, 0.007, 0.004]);
      }
    }
  p.box(m.brass, [0, deck, 0.547], [0.068, 0.031, 0.003]);
}

function crates(p, m) {
  for (const x of [-0.415, 0.322]) {
    const c = p.child([x, deck, -0.316]);
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        c.box(m.pine, [side * 0.337, 0.103, end * 0.163], [0.036, 0.204, 0.033]);
      }
    for (const side of [-1, 1])
      for (let row = 0; row < 3; row++) {
        const y = 0.034 + row * 0.074;
        c.box(m.pine, [0, y, side * 0.181], [0.73, 0.057, 0.018]);
        c.box(m.pine, [side * 0.356, y, 0], [0.017, 0.057, 0.351]);
        for (const x of [-0.334, 0.334]) c.put(ball, m.iron, [x, y, side * 0.192], [0.0024, 0.0024, 0.0011]);
      }
    for (let i = 0; i < 4; i++) c.box(m.pine, [0, 0.208, -0.138 + i * 0.092], [0.73, 0.015, 0.084]);
  }
}

const bowlWire = (() => {
  const paths = [ring(0.29, 0.025), ring(0.42, 0.062), ring(0.86, 0.324)];
  for (let i = 0; i < 14; i++) {
    const path = [];
    for (let j = 0; j <= 25; j++) {
      const t = j / 25,
        s = Math.sin(Math.PI * t),
        a = (tau * i) / 14 + 1.84 * (t - 0.5);
      const r = 0.28 + 0.73 * Math.pow(s, 0.78);
      path.push([r * Math.cos(a), 0.03 + 0.68 * s * s, r * Math.sin(a)]);
    }
    paths.push(path);
  }
  return tubes(paths, 0.0095, 5);
})();
const pedestal = (() => {
  const paths = [ring(0.46, 0.012), ring(0.24, 0.56)];
  for (let i = 0; i < 12; i++) {
    const a = (tau * i) / 12;
    paths.push(
      Array.from({ length: 13 }, (_, j) => {
        const t = j / 12,
          r = 0.46 * (1 - t) + 0.27 * t - 0.15 * Math.sin(t * Math.PI);
        return [r * Math.cos(a + 0.08 * t), t, r * Math.sin(a + 0.08 * t)];
      }),
    );
  }
  return tubes(paths, 0.013, 5);
})();

function wireBowl(p, m, x, z, base, r, stem = 0) {
  if (stem) p.put(pedestal, m.wire, [x, base, z], [r, stem, r]);
  p.put(bowlWire, m.wire, [x, base + stem, z], [r, r, r]);
  return p.child([x, base + stem, z]);
}

export function placard(p, m, id, x, y, z, width, yaw = 0, tilt = -0.23, aspect = 1.5) {
  const sign = p.child([x, y, z], [0, yaw, 0]);
  const h = width / aspect;
  sign.box(m.wire, [0, -h * 0.5, -0.019], [0.009, 0.092, 0.01], [0.16, 0, 0]);
  const face = sign.child([0, 0, 0], [tilt, 0, 0]);
  face.box(m.dark, [0, 0, -0.0027], [width, h, 0.005]);
  face.box(m.iron, [0, h * 0.4, -0.014], [0.043, 0.019, 0.021]);
  face.put(photoPlane(id), m.photos, [0, 0, 0.0004], [width * 0.993, h * 0.993, 1]);
}

function pile(b, m, kind, levels, radius, seed) {
  const rand = randomSource(seed);
  let id = 0;
  for (const [count, spread, y] of levels) {
    const offset = rand() * tau;
    for (let i = 0; i < count; i++, id++) {
      const angle = offset + (i * tau) / count,
        rr = spread * (0.94 + rand() * 0.1);
      fruit(
        b,
        m,
        kind,
        [Math.cos(angle) * rr, y + (rand() - 0.5) * radius * 0.28, Math.sin(angle) * rr],
        radius * (0.91 + rand() * 0.17),
        [(rand() - 0.5) * 4.6, rand() * tau, (rand() - 0.5) * 4.1],
        id,
      );
    }
  }
}

function displayBowls(p, m) {
  let b = wireBowl(p, m, -0.864, 0.32, deck, 0.157);
  fruit(b, m, 'pomegranate', [-0.048, 0.074, 0.037], 0.055, [0.81, 0.58, 0.17], 1);
  fruit(b, m, 'pomegranate', [0.048, 0.083, -0.045], 0.057, [1.25, 0.15, -0.87], 2);
  b = wireBowl(p, m, -0.445, 0.32, deck, 0.184);
  pile(
    b,
    m,
    'mangosteen',
    [
      [8, 0.077, 0.061],
      [10, 0.116, 0.103],
      [6, 0.072, 0.148],
      [1, 0, 0.168],
    ],
    0.037,
    35,
  );
  b = wireBowl(p, m, -0.013, 0.32, deck, 0.17);
  for (let i = 0; i < 3; i++)
    fruit(
      b,
      m,
      'coconut',
      [
        [0.053, 0.086, 0.045],
        [-0.065, 0.081, 0.031],
        [0.012, 0.133, -0.061],
      ][i],
      0.062,
      [0.8, i, 1.17],
      i,
    );
  b = wireBowl(p, m, 0.464, 0.32, deck, 0.172);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.39,
      r = i === 7 ? 0 : 0.091;
    ginger(b, m, [r * Math.cos(a), 0.068 + (i % 3) * 0.022, r * Math.sin(a)], a, 0.041, i);
  }
  b = wireBowl(p, m, -0.886, 0.012, deck, 0.145, 0.125);
  for (let i = 0; i < 4; i++) {
    const dx = i * 0.013,
      stem = b.child([dx - 0.025, 0.101 + i * 0.006, 0], [1.38, 0.2, 0.04 * i]);
    stem.put(cylinder, m.plain, [0, 0, 0], [0.009, 0.3, 0.009], undefined, 0xd3d095);
    stem.put(cylinder, m.cream, [0, 0.084, 0], [0.011, 0.074, 0.011]);
  }
  b = wireBowl(p, m, -0.552, 0.046, deck, 0.163, 0.115);
  pile(
    b,
    m,
    'mangosteen',
    [
      [7, 0.066, 0.062],
      [8, 0.096, 0.105],
      [4, 0.051, 0.144],
    ],
    0.0365,
    90,
  );
  b = wireBowl(p, m, -0.17, 0.056, deck, 0.148, 0.133);
  for (let i = 0; i < 2; i++) fruit(b, m, 'cassava', [(i - 0.5) * 0.062, 0.055, i * 0.02], 0.036, [0.4, i, 1.06], i);
  b = wireBowl(p, m, 0.207, 0.076, deck, 0.185, 0.085);
  bananas(b, m, [-0.058, 0.085, 0.025], 0.091, 1.04);
  bananas(b, m, [0.051, 0.095, -0.018], 0.092, 1.64);
  b = wireBowl(p, m, 0.61, 0.061, deck, 0.174, 0.106);
  pile(
    b,
    m,
    'avocado',
    [
      [5, 0.078, 0.076],
      [3, 0.059, 0.137],
      [1, 0, 0.176],
    ],
    0.05,
    73,
  );
  b = wireBowl(p, m, 0.867, -0.285, deck, 0.148, 0.14);
  pile(
    b,
    m,
    'avocado',
    [
      [4, 0.063, 0.067],
      [2, 0.04, 0.137],
    ],
    0.046,
    82,
  );

  // С задней стороны корзины стоят на двух перевёрнутых реечных ящиках.
  for (const [x, z, kind, r, foot, count, wrap] of [
    [-0.621, -0.177, 'yellowDragon', 0.157, 0, 3, 'net'],
    yellowBowl,
    [-0.248, -0.204, 'dragon', 0.158, 0, 4],
    [-0.079, -0.436, 'passion', 0.15, 0.165, 2],
    [0.109, -0.189, 'passion', 0.142, 0, 4],
    [0.36, -0.434, 'papaya', 0.156, 0.135, 4, 'paper'],
    [0.518, -0.219, 'papaya', 0.151, 0.008, 3, 'net'],
  ]) {
    b = wireBowl(p, m, x, z, riser, r, foot);
    for (let i = 0; i < count; i++) {
      const a = i * 2.3 + 0.7,
        s = kind === 'passion' ? 0.034 : 0.053;
      fruit(
        b,
        m,
        kind,
        [0.064 * Math.cos(a), 0.068 + (i === 3 ? 0.05 : 0), 0.061 * Math.sin(a)],
        s,
        [0.7 + i * 0.2, i, 0.48 * Math.cos(a)],
        i,
        wrap,
      );
    }
  }
  for (let i = 0; i < 6; i++) {
    const packet = p.child([0.886, deck + 0.058, 0.425 - i * 0.091], [0, 0.008 * i, 0]);
    packet.put(rounded, m.plain, [0, 0, 0], [0.232, 0.111, 0.083], undefined, 0xbc3e2d);
    packet.put(photoPlane(14), m.photos, [0, 0.056, 0], [0.225, 0.081, 1], [-Math.PI / 2, 0, 0]);
    packet.put(photoPlane(22), m.photos, [0, -0.001, 0.042], [0.225, 0.102, 1]);
    packet.put(photoPlane(22), m.photos, [0.117, 0, 0], [0.081, 0.105, 1], [0, Math.PI / 2, 0]);
  }
  for (const row of [
    [0, -0.9, 0.962, 0.512, 0.157, 0.06],
    [1, -0.447, 0.946, 0.545, 0.161, -0.11],
    [2, -0.11, 0.963, 0.517, 0.144, 0.1],
    [3, 0.469, 0.986, 0.487, 0.142, 0.31],
    [4, 0.261, 1.109, 0.17, 0.16, -0.1],
    [5, 0.642, 1.135, 0.172, 0.151, -0.08],
    [9, -0.924, 1.105, 0.07, 0.153, 0.25],
    [10, -0.128, 1.088, 0.116, 0.143, -0.08],
    [6, -0.64, 1.335, -0.273, 0.152, 0.15],
    [7, 0.376, 1.383, -0.282, 0.14, 0.14],
    [8, 0.088, 1.182, -0.045, 0.148, -0.14],
    [13, 0.583, 1.232, -0.084, 0.143, -0.35],
    [11, 0.89, 1.171, -0.134, 0.123, -0.4],
  ])
    placard(p, m, ...row);
}

const wickerBody = lathe(
  [
    [0.68, 0.014],
    [0.74, 0.033],
    [0.77, 0.11],
    [0.85, 0.4],
    [0.96, 0.82],
    [1, 0.97],
    [1.012, 1],
  ],
  60,
);
const wickerLining = lathe(
  [
    [0.983, 1],
    [0.951, 0.81],
    [0.9, 0.66],
    [0.3, 0.62],
    [0, 0.62],
  ],
  48,
);
for (let i = 0; i < wickerBody.attributes.uv.count; i++) {
  wickerBody.attributes.uv.setY(i, wickerBody.attributes.position.getY(i));
}
const rim = (() => {
  const paths = [];
  for (let j = 0; j < 3; j++)
    paths.push(
      Array.from({ length: 151 }, (_, i) => {
        const a = (tau * i) / 150,
          b = 10 * a + (j * tau) / 3,
          r = 1 + 0.026 * Math.cos(b);
        return [r * Math.cos(a), 0.019 * Math.sin(b), r * Math.sin(a)];
      }),
    );
  return tubes(paths, 0.028, 6);
})();

function hamper(p, m, x, z, r, h, rx = 1) {
  const base = p.child([x, 0, z], [0, 0, 0], [rx, 1, 1]);
  base.put(wickerBody, m.wicker, [0, 0, 0], [r, h, r]);
  base.put(wickerLining, m.wicker, [0, 0, 0], [r, h, r], undefined, 0xa89a83);
  base.put(rim, m.reed, [0, h, 0], [r, r, r]);
  return base.child([0, h, 0]);
}

function sideBaskets(p, m) {
  let b = hamper(p, m, ...avocadoBasket);
  pile(
    b,
    m,
    'avocado',
    [
      [13, 0.211, -0.005],
      [8, 0.125, 0.022],
      [3, 0.049, 0.05],
      [10, 0.169, 0.078],
      [5, 0.084, 0.112],
      [1, 0, 0.148],
    ],
    0.052,
    702,
  );
  placard(p, m, 11, 1.51, 0.806, 0.505, 0.138, 0.65);
  for (const [x, z, r, h, count] of [
    pineappleBasket,
    [1.771, 0.08, 0.217, 0.626, 3],
  ]) {
    b = hamper(p, m, x, z, r, h);
    for (let i = 0; i < count; i++) {
      const a = (i * tau) / (count - 1) + 0.45,
        spread = i === count - 1 ? 0 : r * 0.65;
      fruit(
        b,
        m,
        'pineapple',
        [spread * Math.cos(a), (count === 3 ? -0.015 : 0.031) + (i % 2) * 0.025, spread * Math.sin(a)],
        0.082,
        [0.38 * Math.cos(a), a, 0.47 * Math.sin(a)],
        i,
      );
    }
  }
  placard(p, m, 12, 1.605, 0.849, -0.141, 0.146, 1.04);
  b = hamper(p, m, -1.285, 0.108, 0.246, 0.714);
  const rand = randomSource(853);
  for (let row = 0; row < 2; row++)
    for (let iz = -5; iz <= 5; iz++)
      for (let ix = -5; ix <= 5; ix++) {
        const x = (ix + (iz % 2) * 0.44 + (rand() - 0.5) * 0.44) * 0.043,
          z = (iz + (rand() - 0.5) * 0.45) * 0.039;
        const d = Math.hypot(x, z);
        if (d > 0.219 - row * 0.035) continue;
        fruit(
          b,
          m,
          'walnut',
          [x, 0.009 + row * 0.03 + 0.034 * (1 - d / 0.22), z],
          0.022,
          [rand() * 2, rand() * 3, rand() * 2],
          Math.floor(rand() * 11),
        );
      }
  b = hamper(p, m, -1.255, -0.424, 0.248, 0.869);
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4,
      d = 0.052 * Math.sqrt(i);
    const bag = b
      .child([d * Math.cos(a), 0.018 + 0.05 * (1 - d / 0.2), d * Math.sin(a)], [0, a, 0])
      .child([0, 0, 0], [-1.29 + 0.4 * rand(), 0, 0.25 * rand()]);
    bag.put(rounded, m.cream, [0, 0, 0], [0.123, 0.163, 0.037]);
    bag.put(photoPlane(23), m.photos, [0, 0, 0.019], [0.12, 0.159, 1]);
  }
  placard(p, m, 15, -1.435, 0.894, -0.276, 0.151, -0.95);
}

export function createCart(materials, { includeFloorBaskets = true } = {}) {
  const cart = new THREE.Group();
  cart.name = 'Charrette de fruits exotiques';
  cart.userData.hudTargets = [
    { id: 'avocado', top: [avocadoBasket[0], avocadoBasket[3] + 0.20, avocadoBasket[1]],
      hit: [avocadoBasket[0], 0.62, avocadoBasket[1]], radii: [0.26, 0.37, 0.26] },
    { id: 'pineapple', top: [pineappleBasket[0], pineappleBasket[3] + 0.26, pineappleBasket[1]],
      hit: [pineappleBasket[0], 0.69, pineappleBasket[1]], radii: [0.255, 0.42, 0.25] },
    { id: 'yellowDragon', top: [yellowBowl[0], riser + yellowBowl[4] + 0.18, yellowBowl[1]],
      hit: [yellowBowl[0], riser + yellowBowl[4] + 0.079, yellowBowl[1]], radii: [0.142, 0.111, 0.125] },
  ];
  const pieces = [
    ['Châssis et plateau', chassis],
    ['Caisses en bois', crates],
    ['Corbeilles du plateau', displayBowls],
  ];
  if (includeFloorBaskets) pieces.push(['Panières au sol', sideBaskets]);
  else cart.userData.hudTargets = cart.userData.hudTargets.filter(({ id }) => id === 'yellowDragon');
  for (const [name, build] of pieces) {
    const model = new Model();
    build(model, materials);
    cart.add(model.finish(name));
  }
  return cart;
}
