import * as THREE from 'three';
import { lathe, Model, plane, randomSource, tau, tubes } from '../model.js';
import { fruit } from '../produce.js';
import { floorBaskets } from '../surroundingsLayout.js';
import { marketCard } from './fruit.js';

function profile(t) {
  return 0.69 + 0.30 * t ** 0.73 + 0.014 * Math.sin(Math.PI * t);
}

const wall = lathe(Array.from({ length: 10 }, (_, i) => [profile(i / 9) - 0.018, i / 9]), 56);
const liner = lathe([[1, 0.99], [0.91, 0.79], [0.83, 0.58], [0, 0.58]], 46);
const hoops = [[], []];
for (let row = 1; row <= 37; row++) {
  hoops[row % 2].push(Array.from({ length: 93 }, (_, i) => {
    const a = i / 92 * tau;
    const y = row / 39 + 0.003 * Math.sin(a * 13 + row * 1.61) + 0.0025 * Math.sin(7 * a + row);
    const r = profile(y) + 0.019 * Math.sin(23 * a + row * Math.PI * 0.97) + 0.006 * Math.sin(a * 7);
    return [r * Math.cos(a), y, r * Math.sin(a)];
  }));
}
const weave = hoops.map((paths) => tubes(paths, 0.0165, 4));
const stems = tubes(Array.from({ length: 23 }, (_, i) => Array.from({ length: 36 }, (_, j) => {
  const y = j / 35 * 0.987;
  const a = i / 23 * tau + 0.008 * Math.sin(y * Math.PI * 6 + i * 0.6);
  const r = profile(y) - 0.004;
  return [r * Math.cos(a), y, r * Math.sin(a)];
})), 0.011, 4);
const lip = tubes(Array.from({ length: 4 }, (_, i) => Array.from({ length: 121 }, (_, j) => {
  const a = j / 120 * tau;
  const r = 1.005 + 0.023 * Math.sin(a * 13 + i * tau / 4) + 0.011 * Math.cos(a * 5);
  const y = 0.987 + (i - 1.5) * 0.008 + 0.0135 * Math.cos(a * 13 + i * tau / 4);
  return [r * Math.cos(a), y, r * Math.sin(a)];
})), 0.0155, 5);

export function makeFloorBaskets(m, original, orchard, textures, cartZ) {
  const skin = { map: textures['basket-skins'], bumpMap: textures['basket-skins'], vertexColors: true };
  const oliveSkin = skin.map.clone();
  oliveSkin.offset.x = 0.25;
  m.textures['orchard-olive-skin'] = oliveSkin;
  const leaf = original.leaves.clone();
  leaf.color.setHex(0xcbd5b9);
  leaf.roughness = 0.83;
  const avocados = [skin.map, oliveSkin].map((map) => ({
    ...original, fruit: m.material({ map, bumpMap: map, vertexColors: true, bumpScale: 0.0009, roughness: 0.73 }),
  }));
  const pineapple = { ...original, leaves: leaf, fruit: m.material({ ...skin, bumpScale: 0.00115, roughness: 0.61 }) };
  const dark = m.paint(0x533e31, 0.92), rattan = m.paint(0x89725c, 0.84);
  const light = m.paint(0xa88f74, 0.81), edging = m.paint(0xc2aa8e, 0.79);
  const tag = m.material({ map: textures['pine-tag'], roughness: 0.58, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'Trois paniers au sol';
  const fixtures = [], hudSources = [];

  for (const [index, { id, x, z, radius, height }] of floorBaskets.entries()) {
    const model = new Model();
    const hudTargets = [];
    const hamper = model.child([0, 0, 0], [0, index * 0.68, 0], [radius, height, radius]);
    hamper.put(wall, dark, [0, 0, 0]);
    hamper.put(liner, rattan, [0, 0, 0]);
    hamper.put(weave[0], rattan, [0, 0, 0]);
    hamper.put(weave[1], light, [0, 0, 0]);
    hamper.put(stems, dark, [0, 0, 0]);
    hamper.put(lip, edging, [0, 0, 0]);

    const tray = model.child([0, height, 0]);
    const rng = randomSource(82530 + index * 3243);
    if (id === 'avocado') {
      const levels = [[14, 0.197, -0.022], [9, 0.136, -0.005], [4, 0.064, 0.018], [8, 0.142, 0.047], [4, 0.061, 0.083]];
      let i = 0;
      for (const [count, spread, y] of levels) {
        const offset = rng() * tau;
        for (let n = 0; n < count; n++, i++) {
          const a = offset + n / count * tau;
          const r = spread * (0.86 + rng() * 0.17);
          fruit(tray, avocados[i % 5 < 2 ? 1 : 0], 'avocado', [
            r * Math.cos(a), y + (rng() - 0.5) * 0.048, r * Math.sin(a),
          ], 0.046 + rng() * 0.014, [rng() * 2 - 1, rng() * tau, 1.28 + (rng() - 0.5) * 2], i);
        }
      }
      marketCard(tray, orchard, 8, 0.104, 0.012, radius * 0.87, 0.126, -0.47, 0.40);
      hudTargets.push({ id, top: [0, height + 0.16, 0], hit: [0, height - 0.034, 0], radii: [0.244, 0.22, 0.247] });
    } else {
      const small = id !== 'pineapple';
      const count = small ? 4 : 8;
      for (let n = 0; n < count; n++) {
        const angle = 0.41 + n / (count - 1) * tau;
        const r = n === count - 1 ? 0 : radius * (small ? 0.55 : 0.67);
        const px = r * Math.cos(angle), pz = r * Math.sin(angle);
        const py = (small ? -0.053 : 0.009) + 0.021 * (n % 3);
        const tilt = (small ? 0.52 : 0.25) + rng() * 0.21;
        fruit(tray, pineapple, 'pineapple', [px, py, pz], (small ? 0.072 : 0.082) + rng() * 0.012,
          [tilt * Math.cos(angle), angle, -tilt * Math.sin(angle)], n);
        if (n % 2 === 0) {
          tray.put(plane, tag, [px + 0.028, py + 0.145, pz + 0.052], [0.046, 0.030, 1],
            [-0.67, angle * 0.45, 0.17 + 0.3 * Math.cos(angle)]);
        }
      }
      if (!small) {
        marketCard(tray, orchard, 9, 0.103, -0.008, radius * 0.86, 0.132, -0.37, 0.72);
        hudTargets.push({ id, top: [0, height + 0.26, 0], hit: [0, height + 0.066, 0], radii: [0.237, 0.31, 0.239] });
      }
    }
    const node = model.finish('basket-' + id);
    node.position.set(x, 0, cartZ + z);
    node.userData.hudTargets = hudTargets;
    group.add(node);
    if (hudTargets.length) hudSources.push(node);
    fixtures.push({ id: node.name, node, w: radius * 2, d: radius * 2, radius, height: height + 0.33, hudHost: true });
  }
  return { group, fixtures, hudSources, dispose: () => leaf.dispose() };
}
