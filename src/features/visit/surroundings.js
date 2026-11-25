import * as THREE from 'three';
import { atlasUV, ball, cylinder, Model, photoPlane, plane, randomSource, rounded, tau, tubes } from './model.js';
import { coverDisplay, coverProduce, workCard } from './workInProgress.js';
import { column, produceStands, timberFloor } from './surroundingsLayout.js';

// Неглубокий рельеф по фото передаёт выкладку соседнего ящика несколькими сотнями треугольников.
function trayReliefs(image) {
  const columns = 32,
    rows = 24,
    canvas = document.createElement('canvas');
  canvas.width = columns + 1;
  canvas.height = rows + 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return Array.from({ length: 8 }, (_, kind) => {
    const index = 24 + kind,
      w = image.width / 4,
      h = image.height / 8;
    ctx.drawImage(
      image,
      (index % 4) * w + 5,
      Math.floor(index / 4) * h + 5,
      w - 10,
      h - 10,
      0,
      0,
      columns + 1,
      rows + 1,
    );
    const { data } = ctx.getImageData(0, 0, columns + 1, rows + 1);
    const g = new THREE.PlaneGeometry(1, 1, columns, rows),
      pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const light = (data[i * 4] * 0.36 + data[i * 4 + 1] * 0.51 + data[i * 4 + 2] * 0.13) / 255;
      const edge = Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getY(i))) * 2;
      pos.setZ(i, 0.027 * light + 0.014 * Math.min(1, (1 - edge) * 7));
    }
    g.computeVertexNormals();
    return atlasUV(g, index, 4, 8, 0.014, 0.021);
  });
}

function fruitStand(p, m, { x, z, length, yaw, selection }, trays, work) {
  const s = p.child([x, 0, z], [0, yaw, 0]),
    depth = 0.9;
  s.box(m.dark, [0, 0.105, 0], [length - 0.07, 0.21, depth - 0.08]);
  s.box(m.oak, [0, 0.414, 0], [length, 0.55, depth]);
  s.box(m.dark, [0, 0.715, -0.02], [length - 0.014, 0.155, depth - 0.04]);
  const lift = s.child([0, 0.804, 0], [0.19, 0, 0]);
  lift.box(m.dark, [0, -0.04, 0], [length, 0.105, 0.945]);
  const count = Math.round(length / 0.54),
    width = length / count;
  for (let i = 0; i < count; i++)
    for (let row = 0; row < 2; row++) {
      const tray = lift.child([(i + 0.5) * width - length / 2, 0, row * 0.45 - 0.225]);
      for (const side of [-1, 1]) {
        tray.box(m.dark, [side * (width / 2 - 0.014), 0.052, 0], [0.022, 0.12, 0.439]);
        tray.box(m.iron, [0, 0.054, side * 0.213], [width - 0.018, 0.104, 0.016]);
        tray.box(m.dark, [0, 0.114, side * 0.215], [width - 0.008, 0.016, 0.025]);
      }
      if (!work) {
        const kind = selection[(i + row) % selection.length];
        tray.put(trays[kind], m.photos, [0, 0.069, 0], [width - 0.035, 0.405, 1], [-Math.PI / 2, 0, 0]);
        if (i % 2 === row) {
          tray.box(m.dark, [0, 0.149, -0.194], [0.111, 0.073, 0.005], [-0.25, 0, 0]);
          tray.box(m.cream, [0, 0.151, -0.19], [0.061, 0.004, 0.002], [-0.25, 0, 0]);
        }
      }
    }
  if (work) {
    coverProduce(lift, length, work);
    workCard(lift, work, 0.43, 0.25, 0.33);
  }
}

function pastry(p, m, work) {
  const cases = p.child([4.06, 0, -1.12], [0, -Math.PI / 2, 0]);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.92;
    cases.box(m.dark, [x, 0.075, 0], [1.918, 0.15, 0.93]);
    cases.box(m.oak, [x, 0.315, 0], [1.915, 0.4, 0.95]);
    cases.box(m.steel, [x, 0.543, 0.015], [1.918, 0.066, 0.96]);
    cases.box(m.dark, [x, 0.879, -0.078], [1.915, 0.608, 0.75]);
    if (work) {
      for (const y of [0.679, 0.997]) {
        cases.box(m.steel, [x, y, 0.306], [1.88, 0.016, 0.12]);
        for (const offset of [-0.59, -0.2, 0.19, 0.58]) {
          cases.box(m.dark, [x + offset, y + 0.018, 0.313], [0.30, 0.024, 0.102]);
        }
      }
      coverDisplay(cases, work, x, 0.893, 0.389, 1.912, 0.678, -0.16);
    } else {
      cases.put(photoPlane(18), m.photos, [x, 0.893, 0.389], [1.912, 0.678, 1], [-0.16, 0, 0]);
    }
    cases.box(m.pine, [x, 1.255, 0.03], [1.92, 0.07, 0.81]);
    cases.box(m.light, [x, 1.211, 0.376], [1.88, 0.011, 0.017]);
    cases.box(m.steel, [x - 0.95, 0.888, 0.387], [0.014, 0.694, 0.023], [-0.16, 0, 0]);
  }
  const low = cases.child([3.42, 0, 0]);
  low.box(m.dark, [0, 0.075, 0], [1.08, 0.15, 0.94]);
  low.box(m.oak, [0, 0.301, 0], [1.08, 0.39, 0.945]);
  low.box(m.steel, [0, 0.7, 0], [1.08, 0.41, 0.91]);
  if (work) {
    coverDisplay(low, work, 0, 0.709, 0.458, 1.078, 0.388);
    workCard(cases, work, 0.42, 1.378, 0.285);
    workCard(cases, work, -2.33, 1.378, 0.285);
  } else {
    low.put(photoPlane(20), m.photos, [0, 0.709, 0.458], [1.078, 0.388, 1]);
  }
  low.box(m.dark, [0, 0.925, -0.175], [1.08, 0.027, 0.61]);
  cases.box(m.dark, [0, 2.49, -0.35], [5.76, 0.42, 0.38]);
  cases.put(photoPlane(19), m.photos, [1.55, 2.49, -0.155], [1.72, 0.35, 1]);
  cases.box(m.plain, [0, 1.73, -0.486], [5.9, 1.28, 0.072], undefined, 0x666966);
  for (const x of [-2.4, -0.48, 1.47]) {
    cases.box(m.steel, [x, 1.69, -0.424], [0.041, 1.13, 0.055]);
    cases.box(m.dark, [x + 0.29, 1.59, -0.415], [0.46, 0.37, 0.055]);
  }
  const bread = cases.child([3.05, 0, -0.44]);
  for (const y of [0.32, 0.75]) {
    bread.box(m.pine, [0, y, 0], [0.92, 0.045, 0.29], [-0.15, 0, 0]);
    for (let i = 0; i < 6; i++) {
      bread.put(
        ball,
        m.plain,
        [(i - 2.5) * 0.139, y + 0.095, -0.015],
        [0.06, 0.072, 0.155],
        [-0.33, 0.046 * i, 0],
        i % 2 ? 0xb28657 : 0xcd9e67,
      );
    }
  }
}

function holidayCorner(p, m) {
  // Плитка доходит до деревянного пола у маленькой ёлки и аппарата.
  const { z, depth, boards, spacing } = timberFloor;
  for (let k = 0; k < boards; k++) {
    p.box(
      m.oak,
      [(k - (boards - 1) / 2) * spacing, 0.002, z + (k % 3) * 0.001],
      [spacing - 0.002, 0.009, depth],
      undefined,
      [0xb49a81, 0xbaa58d, 0xb89f81][k % 3],
    );
  }
  const machine = p.child([-0.78, 0, 3.38], [0, Math.PI - 0.08, 0]);
  machine.box(m.dark, [0, 0.055, 0], [0.61, 0.11, 0.48]);
  machine.put(rounded, m.plain, [0, 0.764, 0], [0.69, 1.39, 0.54], undefined, 0x8b8271);
  machine.put(photoPlane(16), m.photos, [0, 0.772, 0.274], [0.615, 1.253, 1]);
  machine.box(m.dark, [0, 1.539, -0.015], [0.536, 0.256, 0.05]);
  machine.box(m.light, [0, 1.539, 0.014], [0.5, 0.222, 0.008]);

  const tree = p.child([0.79, 0, 3.35]);
  tree.put(cylinder, m.oak, [0, 0.21, 0], [0.071, 0.42, 0.071]);
  const rand = randomSource(921);
  for (let row = 0; row < 12; row++) {
    const t = row / 11,
      h = 0.32 + t * 1.56,
      r = 0.49 * (1 - 0.85 * t);
    tree.put(cylinder, m.plain, [0, h + 0.045, 0], [r * 0.53, 0.14, r * 0.53], undefined, 0x344832);
    const n = 26 - row;
    for (let i = 0; i < n; i++) {
      const angle = ((i + row * 0.53) * tau) / n;
      const branch = tree.child([0, h + 0.08 * rand(), 0], [0, angle, 0]);
      branch.put(
        plane,
        m.fir,
        [0, 0, r * 0.55],
        [r * 0.82 + 0.036, r * 1.19 + 0.08, 1],
        [1.84 + rand() * 0.31, 0, (rand() - 0.5) * 0.39],
      );
    }
  }
  const garland = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160,
      a = t * tau * 4.25,
      r = 0.475 * (1 - t) + 0.039;
    garland.push([Math.cos(a) * r, 0.28 + 1.55 * t - 0.041 * Math.sin(a), Math.sin(a) * r]);
    if (i % 4 === 0) {
      const color = [0x9c2e30, 0xe1d8c2, 0xb93432, 0xc9ab71][(i / 4) % 4];
      tree.put(
        ball,
        m.plain,
        [Math.cos(a + 0.3) * r, 0.32 + t * 1.55, Math.sin(a + 0.3) * r],
        [0.031, 0.035, 0.031],
        undefined,
        color,
      );
    }
    if (i % 5 === 0) tree.put(ball, m.light, garland[i], [0.008, 0.008, 0.008]);
  }
  tree.put(tubes([garland], 0.025, 6), m.plain, [0, 0, 0], undefined, undefined, 0x8f292b);
}

export function createVisitFloor(material, { width = 19.2, depth = 19.2, x = 0, z = 0, originZ = 0 } = {}) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const uv = geometry.getAttribute('uv');
  // Те же 32 повторения на 19,2 м задают плитку 60 см на всей карте.
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.5 + (x + (uv.getX(i) - 0.5) * width) / 19.2,
      0.5 + (originZ - z + (uv.getY(i) - 0.5) * depth) / 19.2);
  }
  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'Sol carrelé';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, -0.005, z);
  floor.receiveShadow = true;
  return floor;
}

export function createSurroundings(m, { work } = {}) {
  const p = new Model();
  const { x, z, radius, height } = column;
  p.put(cylinder, m.plain, [x, height / 2, z], [0.21, height, 0.21], undefined, 0x464646);
  p.put(cylinder, m.steel, [x, 0.132, z], [radius, 0.264, radius]);
  const trays = work ? null : trayReliefs(m.photos.map.image);
  for (const stand of produceStands) fruitStand(p, m, stand, trays, work);
  const scale = p.child([-1.39, 0, -0.91], [0, -0.92, 0]);
  scale.box(m.dark, [0, 0.455, 0], [0.395, 0.91, 0.399]);
  scale.box(m.steel, [0, 0.925, 0.064], [0.36, 0.032, 0.275]);
  scale.box(m.dark, [0, 1.081, -0.13], [0.054, 0.33, 0.06]);
  scale.put(rounded, m.dark, [0, 1.228, -0.14], [0.296, 0.238, 0.05], [-0.13, 0, 0]);
  scale.put(photoPlane(21), m.photos, [0, 1.229, -0.107], [0.249, 0.191, 1], [-0.13, 0, 0]);
  const sign = p.child([1.91, 0, -0.42], [0, 1.0, 0]);
  sign.box(m.iron, [0, 0.014, 0], [0.33, 0.025, 0.305]);
  for (const x of [-0.161, 0.161]) sign.box(m.iron, [x, 0.744, 0], [0.012, 1.458, 0.012]);
  sign.box(m.dark, [0, 1.24, 0], [0.332, 0.535, 0.014]);
  sign.put(photoPlane(17), m.photos, [0, 1.24, 0.009], [0.32, 0.524, 1]);
  sign.put(photoPlane(17), m.photos, [0, 1.24, -0.009], [0.32, 0.524, 1], [0, Math.PI, 0]);
  pastry(p, m, work);
  holidayCorner(p, m);
  const group = p.finish('Abords de la charrette');
  if (work) {
    for (const mesh of group.children) {
      if (mesh.material === work.cloth) mesh.receiveShadow = false;
    }
  } else {
    group.add(createVisitFloor(m.stone));
  }
  return group;
}
