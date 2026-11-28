import * as THREE from 'three';
import { atlasUV, ball, Model, tau, tubes } from '../model.js';
import { randomFrom, surface } from '../christmas/geometry.js';
import { crateShell } from '../carrot/crates.js';
import { saladIds, saladTypes } from './layout.js';
import { packet, rackCard } from './details.js';

const varieties = {
  butter: { tile: 0, colors: [0x62a13c, 0x85ad48, 0xacc75f], width: 1.01, rise: 0.54, ruffle: 0.11, vein: 0.25, size: 0.103, rows: 3 },
  batavia: { tile: 1, colors: [0x7caa37, 0xb4cb66, 0xccd987], width: 0.98, rise: 0.62, ruffle: 0.26, vein: 0.35, size: 0.102, rows: 3 },
  romaine: { tile: 2, colors: [0x648a36, 0x9aba56, 0xc6d88a], width: 0.69, rise: 0.93, ruffle: 0.16, vein: 0.70, size: 0.107, rows: 3 },
  oakleaf: { tile: 3, colors: [0x654135, 0x86714d, 0xabb568], width: 0.96, rise: 0.58, ruffle: 0.29, vein: 0.29, size: 0.105, rows: 3 },
  iceberg: { tile: 4, colors: [0xa8bf70, 0xc4d387, 0xdde3af], width: 1.29, rise: 0.87, ruffle: 0.06, vein: 0.28, size: 0.093, rows: 3, solid: true },
  radicchio: { tile: 5, colors: [0x78425c, 0x884459, 0xaf6972], width: 1.06, rise: 0.76, ruffle: 0.11, vein: 0.94, size: 0.082, rows: 4, solid: true },
  lamb: { tile: 0, colors: [0x438038, 0x649e4d, 0x83b25c], width: 0.82, rise: 0.38, ruffle: 0.04, vein: 0.24 },
  endive: { colors: [0xe8e1bb, 0xf4ebc8, 0xebf0cf], width: 0.67, rise: 0.50, ruffle: 0.05, vein: 0.18 },
};

function leafGeometry(spec) {
  const leaf = surface(16, 10, (u, v) => {
    const side = u * 2 - 1;
    const edge = Math.pow(Math.abs(side), 1.82);
    const envelope = Math.sin(Math.PI * v) ** 0.76 * (0.78 + v * 0.22);
    const wrinkles = Math.sin(v * 41 + side * 3) * 0.62 + Math.cos(v * 79 - side * 3) * 0.32;
    const spread = envelope * (1 + spec.ruffle * wrinkles * edge);
    const curled = Math.sin(v * 2.44) * spec.rise;
    const cupped = edge * envelope * (0.17 + 0.31 * spec.rise + spec.ruffle * wrinkles);
    return [side * spread * spec.width * 0.50, curled + cupped + 0.05 * envelope * Math.sin(v * 31 + side * 8), v];
  });
  const uv = leaf.attributes.uv, colors = [];
  const root = new THREE.Color(0x9aa167);
  const edgeShade = new THREE.Color(spec === varieties.endive ? 0xc5d266 : 0xb6c87e);
  const white = new THREE.Color(0xffffff);
  const rib = new THREE.Color(spec === varieties.radicchio ? 0xffecdb : 0xf1f4cd);
  for (let i = 0; i < uv.count; i++) {
    const side = Math.abs(uv.getX(i) * 2 - 1), progress = uv.getY(i);
    const primary = Math.exp(-side * (8 + progress * 15)) * (1 - 0.44 * progress);
    const branch = Math.exp(-10 * Math.abs(Math.sin(progress * 43 - side * 7))) * (1 - side) * 0.39;
    const tint = root.clone().lerp(white, Math.min(1, progress * 2.9));
    tint.lerp(edgeShade, side * side * progress * 0.53);
    // Give the ribs their own colour so ivory veins are still visible on burgundy.
    colors.push(...tint.toArray(), Math.min(1, (primary + branch) * spec.vein));
  }
  return { leaf, colors, rib };
}

function plantMeshes() {
  return Object.fromEntries(Object.entries(varieties).map(([type, spec]) => {
    const { leaf, colors, rib } = leafGeometry(spec);
    return [type, spec.colors.map((hex) => {
      const geometry = leaf.clone(), color = new THREE.Color(hex), tint = new THREE.Color();
      const rgb = [];
      for (let i = 0; i < colors.length; i += 4) {
        tint.setRGB(colors[i], colors[i + 1], colors[i + 2]).multiply(color).lerp(rib, colors[i + 3]);
        rgb.push(...tint.toArray());
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
      return spec.tile === undefined ? geometry : atlasUV(geometry, spec.tile, 4, 3, 0.018, 0.018);
    })];
  }));
}

function head(model, m, type, [x, y, z], size, random) {
  const spec = varieties[type], meshes = m.plants[type];
  const plant = model.child([x, y, z], [(random() - 0.5) * 0.43, random() * tau, (random() - 0.5) * 0.30]);
  if (spec.solid) plant.put(m.heads[type], m.cap, [0, size * 0.53, 0], [size * 0.73, size * 0.69, size * 0.73],
    [0.2, 0.73, -0.23], spec.colors[1]);
  const layers = type === 'lamb' ? [5, 3] : [7, 5, 3];
  const material = spec.tile === undefined ? m.untexturedLeaf : m.leaf;
  for (const [layer, count] of layers.entries()) {
    for (let index = 0; index < count; index++) {
      const scale = size * (1 - layer * 0.24) * (0.87 + random() * 0.27);
      const yaw = index * tau / count + layer * 0.52 + (random() - 0.5) * 0.47;
      plant.put(meshes[Math.min(meshes.length - 1, Math.floor(layer * 0.80 + random() * 1.3))], material,
        [0.014 * Math.sin(yaw), (0.09 + 0.32 * layer) * size, 0.014 * Math.cos(yaw)],
        [scale, scale, scale], [-layer * 0.39 + (random() - 0.5) * 0.18, yaw, 0, 'YXZ']);
    }
  }
}

function heads(model, m, type, random) {
  const { size, rows } = varieties[type];
  for (let row = 0; row < rows; row++) for (const x of [-0.082, 0.082]) {
    const z = (row + 0.5 - rows / 2) * (0.48 / rows) + (random() - 0.5) * 0.048;
    head(model, m, type, [x + (random() - 0.5) * 0.024, 0.041 + random() * 0.036, z],
      size * (0.84 + random() * 0.29), random);
  }
}

function greensPacks(model, m, type, random) {
  const isTrio = type === 'trio', isGem = type === 'little-gem';
  for (let row = 0; row < 3; row++) for (const col of [-1, 1]) {
    const width = (isTrio ? 0.174 : 0.155) * (0.94 + random() * 0.10), depth = 0.168;
    const height = isTrio ? 0.135 : isGem ? 0.105 : 0.064;
    const box = model.child([col * 0.084, 0.041 + random() * 0.025, (row - 1) * 0.172],
      [(random() - 0.5) * 0.075, (random() - 0.5) * 0.28, (random() - 0.5) * 0.09]);
    packet(box, m, [width, height, depth], isTrio ? null : m.clearTray, type);
    if (isTrio) {
      head(box, m, 'oakleaf', [-0.035, 0.026, 0.021], 0.065, random);
      head(box, m, 'batavia', [0.029, 0.029, -0.018], 0.067, random);
    } else if (isGem) {
      for (const x of [-0.034, 0.030, 0.0]) {
        const plant = box.child([x, 0.032, x === 0 ? 0.035 : -0.018], [0, random() * Math.PI, 0]);
        head(plant, m, 'romaine', [0, 0, 0], 0.041, random);
      }
    } else {
      for (let i = 0; i < 23; i++) {
        const size = 0.026 + random() * 0.010;
        box.put(m.plants.lamb[i % 3], m.leaf, [(random() - 0.5) * 0.112, 0.023 + random() * 0.018,
          (random() - 0.5) * 0.116], [size, size, size], [0.15, random() * tau, 0.21]);
      }
    }
  }
}

function cucumberMesh(tile) {
  const outline = [0, 0.60, 0.85, 0.94, 1, 0.99, 0.96, 0.93, 0.87, 0.74, 0.48, 0];
  return atlasUV(surface(11, 16, (u, v) => {
    const angle = tau * u, radius = outline[Math.round(v * 11)], ripple = Math.cos(angle * 5 + v * 4) * 0.055;
    return [Math.cos(angle) * radius * (1 + ripple) + 0.84 * Math.sin(v * Math.PI),
      Math.sin(angle) * radius * (0.92 + ripple), v - 0.5];
  }), tile, 4, 3, 0.022, 0.025);
}

function cucumbers(model, m, type, random) {
  const short = type === 'mini-cucumber';
  const swiss = type === 'swiss-cucumber';
  const organic = type === 'bio-cucumber';
  const crosswise = type === 'cucumber';
  const rows = crosswise ? 10 : short ? 3 : 2;
  const columns = crosswise ? 1 : short ? 7 : 6;
  for (let layer = 0; layer < 2; layer++) for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    if (layer && random() < (short ? 0.31 : 0.58)) continue;
    const w = short ? 0.019 : swiss ? 0.025 : 0.023, length = short ? 0.145 : swiss ? 0.219 : 0.300;
    const size = 0.86 + random() * 0.23;
    const x = (col + 0.50 - columns / 2) * (0.29 / columns) + (random() - 0.5) * 0.021;
    const z = (row + 0.50 - rows / 2) * (crosswise || short ? 0.475 / rows : 0.254) + (random() - 0.5) * 0.020;
    const item = model.child([x, 0.059 + layer * 0.039 + random() * 0.013, z],
      [(random() - 0.5) * 0.09, (crosswise ? Math.PI / 2 : 0) + (random() - 0.5) * (short ? 0.62 : 0.26), 0]);
    const color = short ? [0x51753a, 0x527f35, 0x75944a] : [0x395739, 0x47713c, 0x537e47];
    item.put(short ? m.snackCucumber : m.cucumberMesh, m.cucumber, [0, 0, 0], [w * size, w * size, length * size],
      [0, 0, (random() - 0.5) * 1.6], color[(col + row + layer) % color.length]);
    if (organic && (layer || col % 2 === 0)) {
      item.put(m.stickers.get(type), m.print, [0.008, w * size * 0.92, (random() - 0.5) * 0.11],
        [w * 1.68, 0.032, 1], [-1.46, 0, (random() - 0.5) * 0.24]);
    }
  }
}

function endives(model, m, type, random) {
  const mini = type === 'mini-endive';
  const rows = mini ? 2 : 3;
  for (let row = 0; row < rows; row++) for (const col of [-1, 1]) {
    const depth = mini ? 0.246 : 0.170;
    const x = col * 0.084, z = (row + 0.5 - rows / 2) * (depth + 0.004);
    const tray = model.child([x, 0.042 + random() * 0.025, z], [0, (random() - 0.5) * 0.15, 0]);
    packet(tray, m, [0.156, 0.093, depth], m.limeTray, type);
    for (let i = 0; i < (mini ? 5 : 3); i++) {
      const x = (i % 3 - 1) * 0.045, z = i < 3 ? 0.031 : -0.039;
      const bud = tray.child([x, 0.035, z], [-0.96, 0.04 + (random() - 0.5) * 0.38, 0]);
      head(bud, m, 'endive', [0, 0, 0], mini ? 0.057 : 0.077, random);
    }
  }
}

function radishes(model, m, random) {
  const cords = [];
  for (let row = 0; row < 4; row++) for (const column of [-1, 1]) {
    const x = column * 0.084, z = (row - 1.5) * 0.115;
    const direction = row % 2 ? -1 : 1;
    for (let i = 0; i < 7; i++) {
      const px = x + (random() - 0.5) * 0.097, pz = z + (random() - 0.5) * 0.075;
      const py = 0.065 + random() * 0.064, radius = 0.013 + random() * 0.011;
      const tint = [0xb93b47, 0xba364a, 0xdd5260, 0xdc6472][i % 4];
      model.put(m.bulb, m.root, [px, py, pz], [radius, radius * 0.89, radius], [0, 0, 0], tint);
      cords.push([[px, py, pz], [px + 0.023, py + 0.007, pz + direction * 0.026],
        [x + 0.030, py + 0.021, z + direction * 0.062]]);
      const size = 0.036 + random() * 0.034;
      model.put(m.plants.batavia[i % 2], m.leaf, [x + 0.03, py + 0.018, z + direction * 0.046],
        [size, size * 0.42, size], [0.49, (direction > 0 ? 0 : Math.PI) + (random() - 0.5) * 1.90, 0]);
    }
  }
  model.put(tubes(cords, 0.00165, 4), m.greenStem, [0, 0, 0]);
}

function scallions(model, m, random) {
  const stems = [], roots = [];
  for (let row = 0; row < 2; row++) for (const center of [-0.117, 0, 0.117]) {
    const z = 0.24 - row * 0.24;
    for (let i = 0; i < 6; i++) {
      const x = center + (random() - 0.5) * 0.075, y = 0.073 + random() * 0.043;
      const drift = (random() - 0.5) * 0.045, length = 0.18 + random() * 0.052;
      model.put(m.bulb, m.pale, [x, y, z - 0.029], [0.0069, 0.0079, 0.041], [0.08, drift * 4, 0]);
      stems.push([[x, y, z - 0.05], [x + drift, y + 0.017, z - length * 0.59], [x + drift * 1.25, y + 0.026, z - length]]);
      for (let tip = 0; tip < 3; tip++) {
        roots.push([[x, y, z + 0.010], [x + (random() - 0.5) * 0.019, y - 0.004, z + 0.030]]);
      }
    }
  }
  model.put(tubes(stems, 0.0047, 5), m.greenStem, [0, 0, 0]);
  model.put(tubes(roots, 0.00078, 3), m.pale, [0, 0, 0]);
}

export function makeSaladCrates(m, materials) {
  const bulb = new THREE.SphereGeometry(1, 11, 8);
  const assets = {
    ...materials, bulb,
    plants: plantMeshes(),
    heads: Object.fromEntries(['iceberg', 'radicchio'].map((type) =>
      [type, atlasUV(ball.clone(), varieties[type].tile, 4, 3, 0.016, 0.018)])),
    cucumberMesh: cucumberMesh(6), snackCucumber: cucumberMesh(7),
    greenStem: m.paint(0x729347, 0.76),
  };
  return saladTypes.map((type, index) => {
    const random = randomFrom(7437 + index * 609);
    const model = new Model();
    crateShell(model, assets);
    if (['trio', 'little-gem', 'lamb'].includes(type)) greensPacks(model, assets, type, random);
    else if (type.includes('cucumber')) cucumbers(model, assets, type, random);
    else if (type.includes('endive')) endives(model, assets, type, random);
    else if (type === 'spring-onion') scallions(model, assets, random);
    else if (type === 'radish') radishes(model, assets, random);
    else heads(model, assets, type, random);
    rackCard(model, assets, type, { y: 0.180, z: -0.263 });
    return model.finish(saladIds[index]);
  });
}
