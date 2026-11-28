import * as THREE from 'three';
import { Model, plane } from '../model.js';
import { workCard } from '../workInProgress.js';
import { surface } from '../christmas/geometry.js';
import { cellDepth, cellWidth, partitions, rackCells, reservePartitions, rows } from './layout.js';

const sideThickness = 0.035;
const cabinetHeight = 0.386;

function wedge(width, frontHeight, backHeight, depth, start = 0) {
  const end = depth / 2;
  const side = new THREE.Shape()
    .moveTo(-end, 0).lineTo(end, 0).lineTo(end, frontHeight)
    .lineTo(-end, backHeight).closePath();
  const geometry = new THREE.ExtrudeGeometry(side, { steps: 1, depth: width, bevelEnabled: false });
  const point = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (point.getX(i) + end) / depth, point.getY(i) / backHeight);
  }
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(start, 0, 0);
  return geometry;
}

export function makeCabinet(m, wood, stand) {
  const group = new THREE.Group();
  group.name = stand.name;
  group.position.set(stand.x, 0, stand.z);
  group.rotation.y = stand.yaw;

  const oak = m.material({
    color: 0xf8f6ef, map: wood, bumpMap: wood, bumpScale: 0.00075,
    emissiveMap: wood, emissive: 0xffffff, emissiveIntensity: 0.16, roughness: 0.74,
  });
  const edge = m.paint(0xa38b67, 0.7);
  const plinth = m.paint(0x252321, 0.77);
  const recess = m.paint(0x373c3d, 0.72, 0.22);
  const screw = m.paint(0x686962, 0.48, 0.56);
  const structure = new Model();

  const { w, d } = stand;
  const half = w / 2;
  const [frontHeight, backHeight] = stand.cheek ?? [0.55, 0.992];
  const side = wedge(sideThickness, frontHeight, backHeight, d);
  structure.put(side, oak, [half, 0, 0]);
  structure.put(side, oak, [-half + sideThickness, 0, 0]);
  structure.box(plinth, [0, 0.035, 0.018], [w - 0.081, 0.07, d - 0.094]);
  structure.box(recess, [0, 0.265, -d / 2 + 0.042], [w - 0.088, 0.39, 0.035]);
  structure.box(recess, [0, 0.67, -d / 2 + 0.046], [w - 0.088, 0.39, 0.035]);
  const cabinets = Math.round(w / 1.2);
  const cabinetPitch = (w - sideThickness * 2) / cabinets;
  for (let index = 0; index < cabinets; index++) {
    const x = (index + 0.5 - cabinets / 2) * cabinetPitch;
    structure.box(oak, [x, 0.057 + cabinetHeight / 2, d / 2 - 0.062], [cabinetPitch - 0.016, cabinetHeight, 0.094]);
    structure.box(edge, [x, 0.057 + cabinetHeight + 0.003, d / 2 - 0.062], [cabinetPitch - 0.017, 0.006, 0.093]);
  }
  for (const sign of [-1, 1]) {
    for (const z of [-0.43, 0.38]) {
      structure.rod(screw, [sign * (half - 0.006), 0.346, z], [sign * (half + 0.0008), 0.346, z], 0.0045);
    }
  }

  const proxy = new THREE.Group();
  const invisible = m.material({ side: THREE.DoubleSide });
  for (const offset of [half, -half + sideThickness]) {
    const cheek = new THREE.Mesh(side, invisible);
    cheek.position.x = offset;
    proxy.add(cheek);
  }
  proxy.visible = false;
  group.add(proxy);
  return { group, structure, proxy, invisible, plinth, recess, screw };
}

export function makeRack(m, wood, stand) {
  const { group, structure, proxy, invisible, plinth, recess, screw } = makeCabinet(m, wood, stand);
  const { w, d, slope, columns, rows: rowCount = rows, cellDepth: slotDepth = cellDepth } = stand;
  const half = w / 2;
  const steel = m.paint(0x44494a, 0.61, 0.38);
  const folds = m.paint(0x555959, 0.55, 0.36);
  const bed = structure.child([0, stand.y, 0], [slope, 0, 0]);
  const totalWidth = columns * cellWidth;
  const totalDepth = rowCount * slotDepth;
  for (const { x, z } of rackCells(columns, rowCount, slotDepth)) {
    bed.box(recess, [x, -0.012, z], [cellWidth - 0.014, 0.022, slotDepth - 0.018]);
    for (const offset of [-0.125, 0.125]) {
      bed.box(steel, [x + offset, 0.0005, z], [0.033, 0.008, slotDepth - 0.025]);
    }
    for (const shiftX of [-0.162, 0.162]) {
      for (const shiftZ of [-slotDepth / 2 + 0.05, slotDepth / 2 - 0.05]) {
        bed.rod(screw, [x + shiftX, 0, z + shiftZ], [x + shiftX, 0.002, z + shiftZ], 0.0031);
      }
    }
  }
  for (let i = 0; i <= columns; i++) {
    const x = (i - columns / 2) * cellWidth;
    bed.box(folds, [x, 0.005, 0], [0.011, 0.039, totalDepth + 0.01]);
  }
  for (let i = 0; i <= rowCount; i++) {
    const z = (i - rowCount / 2) * slotDepth;
    bed.box(steel, [0, 0.006, z], [totalWidth + 0.014, 0.045, 0.014]);
  }
  for (const z of [-totalDepth / 2, totalDepth / 2]) {
    bed.box(folds, [0, -0.029, z], [totalWidth + 0.02, 0.039, 0.028]);
  }

  if (stand.dispenser) {
    const dispenser = structure.child([-half + 0.01, 0.63, d / 2 - 0.165], [0.13, 0, 0.09]);
    dispenser.box(plinth, [0.008, -0.17, 0], [0.022, 0.35, 0.024]);
    dispenser.box(recess, [0.007, 0.013, -0.025], [0.125, 0.082, 0.092]);
    dispenser.rod(m.paint(0xd3d3c8, 0.73), [-0.05, 0.008, 0.001], [0.062, 0.008, 0.001], 0.034);
    dispenser.rod(plinth, [-0.052, 0.008, 0.001], [-0.050, 0.008, 0.001], 0.015);
    dispenser.box(plinth, [0.004, 0.051, 0.009], [0.136, 0.013, 0.080]);
  }
  group.add(structure.finish('Chêne et acier'));

  addBedProxy(proxy, invisible, stand);
  return { group, proxy };
}

export function addBedProxy(proxy, material, { w, d, y, slope }) {
  const rise = Math.tan(slope) * d / 2;
  const core = wedge(w - 2 * sideThickness, y - rise - 0.003, y + rise - 0.003, d, w / 2 - sideThickness);
  proxy.add(new THREE.Mesh(core, material));
}

export function makePartitions(m, textures, work) {
  const group = new THREE.Group();
  group.name = 'Cloisons provisoires du rayon';
  const frame = m.paint(0x8d8a81, 0.48, 0.46);
  const feet = m.paint(0x575650, 0.67, 0.12);
  const back = m.paint(0xc4c0b2, 0.95);
  const studs = m.paint(0xb4b1a5, 0.49, 0.36);
  for (const { width, height, photo } of partitions) {
    const stand = new Model();
    const print = m.material({
      color: 0xd4d2c8, map: textures[photo], roughness: 0.96, bumpMap: m.textures.paper, bumpScale: 0.00065,
    });
    const top = height - 0.055;
    const bottom = 0.15;
    const span = width - 0.041;
    const fabric = surface(16, 38, (u, v) => {
      const edges = Math.sin(Math.PI * v) * Math.sin(Math.PI * u);
      const folds = Math.sin(48 * u - 3 * v) * 0.003 + Math.sin(16 * u + 4 * v) * 0.005;
      return [(u - 0.5) * span, bottom + v * (top - bottom), 0.018 + edges * folds];
    });
    stand.put(fabric, print, [0, 0, 0]);
    stand.put(plane, back, [0, (top + bottom) / 2, 0.008], [span, top - bottom, 1], [0, Math.PI, 0]);
    for (const side of [-1, 1]) {
      const offset = side * width / 2;
      stand.box(frame, [offset, height / 2, 0], [0.039, height, 0.037]);
      stand.box(feet, [offset, 0.032, -0.014], [0.106, 0.064, 0.37]);
      for (let n = 1; n <= 7; n++) {
        const y = bottom + n * (top - bottom) / 8;
        stand.rod(studs, [offset - side * 0.030, y, 0.017], [offset - side * 0.030, y, 0.021], 0.0051);
      }
    }
    for (const y of [bottom, top]) {
      stand.box(frame, [0, y, 0.009], [width - 0.032, 0.028, 0.032]);
    }
    if (photo === 'counters') workCard(stand, work, width / 2 - 0.29, 1.82, 0.039);
    group.add(stand.finish(photo, false));
  }
  return group;
}

export function makeBlankPartition(m, { width, height }, id) {
  const frame = m.paint(0x797b73, 0.62, 0.38);
  const foot = m.paint(0x595b55, 0.70, 0.11);
  const screen = m.material({ color: 0xd9d5c8, roughness: 0.93, side: THREE.DoubleSide,
    bumpMap: m.textures.paper, bumpScale: 0.001 });
  const model = new Model();
  model.put(surface(18, 32, (u, v) => [
    (u - 0.5) * (width - 0.034), 0.19 + v * (height - 0.22),
    0.005 * Math.sin(u * 49 + v * 5) * Math.sin(Math.PI * v),
  ]), screen, [0, 0, 0]);
  for (const side of [-1, 1]) {
    model.box(frame, [side * width / 2, height / 2, 0], [0.035, height, 0.037]);
    model.box(foot, [side * width / 2, 0.032, 0], [0.12, 0.064, 0.38]);
  }
  for (const y of [0.19, height - 0.031]) model.box(frame, [0, y, 0], [width, 0.027, 0.032]);
  return model.finish(id);
}

export function makeReservePartitions(m) {
  const group = new THREE.Group();
  group.name = 'Cloisons de réserve';
  const template = makeBlankPartition(m, reservePartitions[0], reservePartitions[0].id);
  for (const [index, { id }] of reservePartitions.entries()) {
    const section = index === 0 ? template : template.clone();
    section.name = id;
    group.add(section);
  }
  return group;
}
