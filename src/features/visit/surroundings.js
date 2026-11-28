import * as THREE from 'three';
import { atlasUV, ball, cylinder, Model, photoPlane, plane, randomSource, rounded, tau, tubes } from './model.js';
import { coverProduce, workCard } from './workInProgress.js';
import { column, produceStands, scaleLayout, timberFloor } from './surroundingsLayout.js';

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

function woodenFloor(p, m) {
  const { depth, boards, spacing } = timberFloor;
  for (let k = 0; k < boards; k++) {
    p.box(
      m.oak,
      [(k - (boards - 1) / 2) * spacing, 0.002, (k % 3) * 0.001],
      [spacing - 0.002, 0.009, depth],
      undefined,
      [0xb49a81, 0xbaa58d, 0xb89f81][k % 3],
    );
  }
}

function coffeeMachine(machine, m) {
  machine.box(m.dark, [0, 0.055, 0], [0.61, 0.11, 0.48]);
  machine.put(rounded, m.plain, [0, 0.764, 0], [0.69, 1.39, 0.54], undefined, 0x8b8271);
  machine.put(photoPlane(16), m.photos, [0, 0.772, 0.274], [0.615, 1.253, 1]);
  machine.box(m.dark, [0, 1.539, -0.015], [0.536, 0.256, 0.05]);
  machine.box(m.light, [0, 1.539, 0.014], [0.5, 0.222, 0.008]);

}

function holidayTree(tree, m) {
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

export function makeScale(m) {
  const scale = new Model();
  scale.box(m.dark, [0, 0.455, 0], [0.395, 0.91, 0.399]);
  scale.box(m.steel, [0, 0.925, 0.064], [0.36, 0.032, 0.275]);
  scale.box(m.dark, [0, 1.081, -0.166], [0.054, 0.33, 0.06]);
  const monitor = scale.child([0, 1.262, -0.14], [-0.13, 0, 0]);
  monitor.put(rounded, m.dark, [0, 0, 0], [0.296, 0.172, 0.05]);
  const { width, height } = m.scaleScreen.map.image;
  monitor.put(plane, m.scaleScreen, [0, 0, 0.026], [0.268, 0.268 * height / width, 1]);
  return scale;
}

export function makeColumn(m, { radius, height }) {
  const pillar = new Model();
  pillar.put(cylinder, m.plain, [0, height / 2, 0], [radius - 0.004, height, radius - 0.004], undefined, 0x464646);
  pillar.put(cylinder, m.steel, [0, 0.132, 0], [radius, 0.264, radius]);
  return pillar;
}

export function createSurroundings(m, work, cartZ) {
  const group = new THREE.Group();
  group.name = 'Abords de la charrette';
  const fixtures = [];

  function place(id, model, x, z, yaw, dimensions) {
    const node = model.finish(id);
    node.position.set(x, 0, z);
    node.rotation.y = yaw;
    for (const mesh of node.children) {
      if (mesh.material === work.cloth) mesh.receiveShadow = false;
    }
    group.add(node);
    fixtures.push({ id, node, ...dimensions });
  }

  const { x, z, radius, height } = column;
  place('column', makeColumn(m, column), x, cartZ + z, 0, { w: radius * 2, d: radius * 2, radius, height });

  const [stand] = produceStands;
  const side = new Model();
  fruitStand(side, m, { ...stand, x: 0, z: 0, yaw: 0 }, null, work);
  place('covered-side-stand', side, stand.x, cartZ + stand.z, stand.yaw,
    { w: stand.length + 0.08, d: 1.01, height: 1.10 });

  place('scale', makeScale(m), scaleLayout.x, cartZ + scaleLayout.z, scaleLayout.yaw,
    { w: scaleLayout.w, d: scaleLayout.d, height: scaleLayout.y });

  const timber = new Model(), coffee = new Model(), tree = new Model();
  woodenFloor(timber, m);
  coffeeMachine(coffee, m);
  holidayTree(tree, m);
  place('timber-floor', timber, 0, cartZ + timberFloor.z, 0,
    { w: timberFloor.boards * timberFloor.spacing, d: timberFloor.depth, height: 0.014, floorCover: true });
  place('nespresso', coffee, -0.78, cartZ + 3.38, Math.PI - 0.08, { w: 0.69, d: 0.58, height: 1.67 });
  place('coffee-tree', tree, 0.79, cartZ + 3.35, 0, { w: 0.96, d: 0.96, height: 1.95, radius: 0.48 });
  return { group, fixtures };
}
