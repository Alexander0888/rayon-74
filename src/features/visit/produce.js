import * as THREE from 'three';
import { atlasUV, ball, cylinder, lathe, randomSource, tau, tubes } from './model.js';

// Радиус задаёт ширину плода. Длина и изгиб отсчитываются вдоль его собственной оси.
const shapes = {
  avocado: [0, 0.9, 1.34, 0.88],
  mangosteen: [1, 1, 0.93, 0.98],
  pomegranate: [2, 1, 0.97, 0.96],
  coconut: [3, 0.97, 1.12, 0.94],
  ginger: [4, 0.87, 1.53, 0.76],
  dragon: [5, 0.94, 1.23, 0.95],
  yellowDragon: [6, 0.94, 1.18, 0.92],
  papaya: [7, 0.92, 1.43, 0.96],
  passion: [8, 1, 1.04, 0.94],
  pineapple: [9, 0.92, 1.23, 0.91],
  walnut: [10, 0.86, 1.07, 0.86],
  banana: [11, 1, 1, 1],
  cassava: [13, 0.7, 1.85, 0.72],
  pear: [15, 1, 1.22, 0.95],
};

function fruitShape(kind) {
  const small = kind === 'walnut' || kind === 'ginger';
  const geometry = new THREE.SphereGeometry(1, small ? 16 : 24, small ? 11 : 16);
  geometry.name = kind;
  const point = geometry.attributes.position,
    colors = [];
  for (let i = 0; i < point.count; i++) {
    const x = point.getX(i),
      y = point.getY(i),
      z = point.getZ(i);
    const angle = Math.atan2(z, x);
    const taper = kind === 'avocado' || kind === 'pear' ? 1 - 0.28 * y : 1;
    const lobes = kind === 'walnut' ? 0.06 : 0.025;
    const width = taper * (1 + lobes * Math.cos(angle * 5 + 0.6) * (1 - y * y));
    point.setXYZ(i, x * width + 0.04 * y * y, y, z * width);
    const shade = 0.83 + (0.14 * (y + 1)) / 2 + 0.025 * Math.sin(angle * 3 + 0.7);
    colors.push(shade, shade, shade);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return atlasUV(geometry, shapes[kind][0], 4, 4, 0.019, 0.019);
}
const bodies = new Map();

// Складка вдоль жилки хорошо заметна на листьях ананаса и чешуйках питахайи.
const blade = new THREE.BufferGeometry();
{
  const vertices = [],
    colors = [],
    indices = [];
  for (let row = 0; row <= 5; row++) {
    const t = row / 5,
      w = (0.16 + 0.84 * Math.sin(Math.PI * t ** 0.72)) * (1 - t ** 5);
    for (let col = -1; col <= 1; col++) {
      vertices.push(col * w, t * (1 - 0.22 * t), t * t * 0.77 + (col === 0 ? 0.1 * w : 0));
      const shade = 0.49 + t * 0.45 + (col === 0 ? 0.08 : 0);
      colors.push(shade, shade, shade * 0.97);
    }
    if (row < 5)
      for (let col = 0; col < 2; col++) {
        const a = row * 3 + col;
        indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  blade.setIndex(indices);
  blade.computeVertexNormals();
}

const sleeve = (() => {
  const paths = [];
  for (const direction of [-1, 1])
    for (let strand = 0; strand < 18; strand++) {
      const path = [];
      for (let step = 0; step <= 15; step++) {
        const t = step / 15,
          y = -0.86 + 1.54 * t;
        const a = (tau * strand) / 18 + direction * t * 1.64;
        const r = Math.sqrt(1 - y * y) + 0.065;
        path.push([r * Math.cos(a), y, r * Math.sin(a)]);
      }
      paths.push(path);
    }
  return tubes(paths, 0.039, 4);
})();

const paper = lathe(
  [
    [0.24, -0.98],
    [0.69, -0.82],
    [0.98, -0.43],
    [1.06, 0.06],
    [1.02, 0.22],
  ],
  17,
);
{
  const p = paper.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getX(i), p.getZ(i)),
      h = p.getY(i);
    const r = 1 + 0.045 * Math.cos(a * 8 + h);
    p.setXYZ(i, p.getX(i) * r, h + (h > 0 ? 0.13 * Math.sin(5 * a) : 0), p.getZ(i) * r);
  }
  paper.computeVertexNormals();
}
const sticker = new THREE.CircleGeometry(1, 16);
const sepal = fruitShape('ginger');
{
  const p = sepal.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    p.setXYZ(i, x * (1 - 0.35 * z), y - 0.4 * z + 0.4 * z * z, z);
  }
  sepal.computeVertexNormals();
  sepal.name = 'Calice de mangoustan';
}
const coconutHusk = (() => {
  const rand = randomSource(94),
    paths = [];
  for (let i = 0; i < 45; i++) {
    const a = rand() * tau,
      h = rand() * 2.1 - 1.05,
      length = 0.14 + rand() * 0.34;
    paths.push(
      Array.from({ length: 6 }, (_, j) => {
        const t = j / 5,
          angle = a + t * 0.18,
          lat = h + t * length,
          r = 1.019 + 0.075 * t * t;
        return [r * Math.cos(lat) * Math.cos(angle), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(angle)];
      }),
    );
  }
  return tubes(paths, 0.006, 3);
})();
const shades = [0xfff7f5, 0xf5e4ce, 0xd7e0c5, 0xfbdccf, 0xe0dad1];
const tintAt = (i) => shades[i % shades.length];

export function fruit(model, m, kind, position, radius, rotation, variant = 0, wrap) {
  const [, x, y, z] = shapes[kind];
  const piece = model.child(position, rotation, [radius * x, radius * y, radius * z]);
  if (!bodies.has(kind)) bodies.set(kind, fruitShape(kind));
  piece.put(bodies.get(kind), m.fruit, [0, 0, 0], undefined, undefined, tintAt(variant));
  if (wrap === 'net') piece.put(sleeve, m.sleeves, [0, 0, 0]);
  if (wrap === 'paper') piece.put(paper, m.sleeves, [0, 0, 0]);
  if (kind === 'coconut') {
    piece.put(coconutHusk, m.plain, [0, 0, 0], undefined, undefined, 0x99744d);
    for (let i = 0; i < 3; i++) {
      const angle = (i * tau) / 3;
      piece.put(
        ball,
        m.plain,
        [0.2 * Math.cos(angle), 0.975, 0.2 * Math.sin(angle)],
        [0.077, 0.028, 0.059],
        undefined,
        0x64472e,
      );
    }
  }
  if (kind === 'mangosteen' || kind === 'pomegranate') {
    const calyx = kind === 'mangosteen';
    for (let i = 0; i < (calyx ? 4 : 6); i++) {
      const top = piece.child([0, calyx ? 0.92 : 0.98, 0], [0, (i * tau) / (calyx ? 4 : 6) + variant, 0]);
      if (calyx)
        top.put(
          sepal,
          m.fruit,
          [0, 0.066, 0.187],
          [0.205, 0.085, 0.26],
          [0.24 + 0.16 * Math.sin(i + variant), 0, 0.17 * Math.cos(i)],
          [0xb8bd82, 0xcebd88, 0xb4b27e, 0xdbd09a][(i + variant) % 4],
        );
      else top.put(blade, m.leaves, [0, 0, 0.085], [0.08, 0.22, 0.15], undefined, 0x885638);
    }
    if (calyx) piece.put(cylinder, m.plain, [0.021, 1.057, 0], [0.071, 0.19, 0.08], [0.32, 0, -0.21], 0x665336);
  }
  if (kind === 'dragon' || kind === 'pineapple') {
    const pineapple = kind === 'pineapple';
    const rows = pineapple ? 3 : 4,
      count = pineapple ? 9 : 5;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < count; i++) {
        const angle = ((i + row * 0.43) * tau) / count + variant * 0.53;
        const branch = piece.child([0, pineapple ? 0.77 + 0.11 * row : -0.75 + row * 0.43, 0], [0, angle, 0]);
        const reach = pineapple ? 1.1 - row * 0.35 : 0.32;
        branch.put(
          blade,
          m.leaves,
          [0, 0, pineapple ? 0.25 - row * 0.07 : 0.65 + 0.17 * Math.sin(row)],
          pineapple ? [0.2, 0.85 + row * 0.46 + 0.12 * Math.sin(i), reach] : [0.23, 0.49, 0.42],
          [0.08 * Math.cos(i + variant), 0, 0.06 * Math.sin(i * 3)],
          pineapple ? [0x829473, 0x56694a, 0x99a386][(i + row) % 3] : [0xb9855e, 0xbf486e, 0x939855][(i + row) % 3],
        );
      }
  }
  if (kind === 'avocado' && variant % 4 === 0) {
    piece.put(sticker, m.cream, [0, 0.15, 0.975], [0.25, 0.13, 1], [0, 0.08, 0.4]);
    piece.put(sticker, m.dark, [-0.052, 0.14, 0.99], [0.15, 0.1, 1], [0, 0.08, 0.4]);
  }
}

// Изгиб и сужение к концам задают форму каждого банана в связке.
const bananaBody = (() => {
  const g = new THREE.SphereGeometry(1, 14, 14);
  const p = g.attributes.position,
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      bend = y * y;
    p.setXYZ(i, y, 0.47 * bend - x * 0.21, z * 0.22);
    const value = Math.abs(y) > 0.94 ? 0.34 : 0.92;
    colors.push(value, value, value);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return atlasUV(g, 11, 4, 4, 0.019, 0.019);
})();

const bananaLabel = atlasUV(new THREE.PlaneGeometry(), 12, 4, 4, 0.022, 0.022);
bananaLabel.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
const wrapping = new THREE.SphereGeometry(1, 13, 9);
{
  const p = wrapping.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const fold = 1 + 0.085 * Math.sin(x * 11 + z * 14) + 0.04 * Math.cos(y * 12 + x * 7);
    p.setXYZ(i, x * fold, y * fold + 0.07 * Math.sin(z * 15), z * fold);
  }
  wrapping.computeVertexNormals();
}

export function bananas(model, m, position, size, angle) {
  const bunch = model.child(position, [0, angle, 0], [size, size, size]);
  for (let i = 0; i < 5; i++) {
    bunch.put(bananaBody, m.fruit, [0, i * 0.1, (i - 2) * 0.23], [0.92 + i * 0.025, 1, 1], [0, (i - 2) * 0.16, 0.1]);
  }
  bunch.put(cylinder, m.plain, [0.88, 0.58, 0], [0.12, 0.32, 0.14], [0, 0, -0.53], 0x777743);
  bunch.put(wrapping, m.film, [0, 0.32, 0], [1.17, 0.73, 0.87]);
  bunch.put(bananaLabel, m.fruit, [0.14, 1.024, 0.17], [0.69, 0.52, 1], [-1.24, 0.18, -0.13]);
}

export function ginger(model, m, position, angle, size, variant) {
  const root = model.child(position, [0, angle, 0]);
  const lobes = [
    [0, 0, 0, 1.4],
    [-0.83, 0.25, 0.1, 1],
    [0.77, 0.02, 0.1, 0.87],
    [-0.22, 0.54, -0.45, 0.76],
    [0.56, 0.46, 0.41, 0.69],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [x, y, z, s] = lobes[i];
    fruit(
      root,
      m,
      'ginger',
      [x * size, y * size, z * size],
      size * s * 0.68,
      [i * 0.25, variant, 1.05 - i * 0.29],
      variant,
    );
  }
}
