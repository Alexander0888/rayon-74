import * as THREE from 'three';
import { atlasUV, Model, plane, rounded } from '../model.js';
import { randomFrom, surface } from '../christmas/geometry.js';
import { paintedTexture } from '../texture.js';
import { columns, crateSize, crateTypes } from './layout.js';

const { width: w, depth: d, height: h } = crateSize;
const up = new THREE.Vector3(0, 1, 0);
const carrotColors = [0xe38831, 0xed9132, 0xe58327, 0xd67528, 0xd98536, 0xe39845, 0xe99234];

export function crateShell(model, { plastic, lip, base }) {
  model.box(base, [0, 0.019, 0], [w - 0.033, 0.015, d - 0.037]);
  const rimWidth = 0.014;
  for (const side of [-1, 1]) {
    const x = side * (w - rimWidth) / 2;
    const z = side * (d - rimWidth) / 2;
    model.box(plastic, [x, 0.048, 0], [0.010, 0.052, d - 0.026]);
    model.box(plastic, [0, 0.048, z], [w - 0.033, 0.052, 0.012]);
    model.box(lip, [x, h - 0.007, 0], [rimWidth, 0.014, d]);
    model.box(lip, [0, h - 0.007, z], [w - 0.020, 0.014, rimWidth]);

    // Handle openings sit between the top rail and the lower reinforcing web.
    for (const end of [-1, 1]) {
      model.box(plastic, [x, 0.0935, end * 0.182], [0.010, 0.042, 0.212]);
      model.box(plastic, [end * 0.136, 0.094, z], [0.090, 0.043, 0.010]);
      model.put(rounded, lip, [x, h / 2, end * (d / 2 - 0.016)], [0.018, h, 0.032]);
      model.box(base, [end * 0.124, 0.007, z - side * 0.010], [0.091, 0.014, 0.029]);
      for (const offset of [0.095, 0.150, 0.209, 0.251]) {
        model.box(base, [x + side * 0.005, 0.064, end * offset], [0.009, 0.083, 0.005],
          [end * 0.34, 0, 0]);
      }
      for (const offset of [0.091, 0.125, 0.156]) {
        model.box(base, [end * offset, 0.064, z + side * 0.004], [0.006, 0.084, 0.010],
          [0, 0, end * 0.35]);
      }
    }
    model.box(lip, [x + side * 0.002, 0.037, 0], [0.011, 0.009, d - 0.023]);
    model.box(lip, [0, 0.037, z + side * 0.002], [w - 0.026, 0.009, 0.011]);
  }
}

export function crateMaterials(m) {
  return {
    plastic: m.material({ color: 0x292924, roughness: 0.61, bumpMap: m.textures.paper, bumpScale: 0.00038 }),
    lip: m.paint(0x222420, 0.42),
    base: m.paint(0x30312c, 0.64),
  };
}

function carrotSkin() {
  const texture = paintedTexture(128, 192, (ctx, width, height) => {
    const random = randomFrom(382);
    ctx.fillStyle = '#898989';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 570; i++) {
      const x = random() * width, y = random() * height;
      const shade = Math.round(119 + random() * 46);
      ctx.strokeStyle = 'rgb(' + shade + ' ' + shade + ' ' + shade + ')';
      ctx.lineWidth = 0.48 + random() * 0.86;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 5, y + 1.05, x + 3 + random() * 25, y - 0.3);
      ctx.stroke();
    }
  });
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function carrotGeometry() {
  const profile = [0.035, 0.34, 0.51, 0.62, 0.70, 0.77, 0.85, 0.93, 0.96, 1, 0.95, 0.68, 0];
  const geometry = surface(24, 10, (u, v) => {
    const angle = u * Math.PI * 2, position = v * (profile.length - 1);
    const before = Math.min(Math.floor(position), profile.length - 2);
    const radius = 0.5 * THREE.MathUtils.lerp(profile[before], profile[before + 1], position - before);
    const irregular = 1 + 0.047 * Math.cos(angle * 3 - v * 1.5) + 0.027 * Math.sin(58 * v + angle);
    return [
      Math.sin(angle) * radius * irregular + 0.25 * Math.sin(Math.PI * v * 0.92),
      v - 0.5,
      Math.cos(angle) * radius * irregular * 0.91 + 0.10 * Math.sin(Math.PI * v * 1.5),
    ];
  });
  const uv = geometry.attributes.uv, colors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const grain = 0.90 + 0.057 * Math.cos(v * 94 + u * 5) + 0.045 * Math.cos(v * 257 - u * 13);
    const crown = THREE.MathUtils.smoothstep(v, 0.87, 0.99);
    tint.setRGB(grain, grain, grain).lerp(new THREE.Color(0x8f9f69), crown * 0.73);
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function loose(model, assets, random) {
  const heading = new THREE.Vector3();
  for (let layer = 0; layer < 4; layer++) {
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 4; column++) {
        const angle = random() * Math.PI * 2;
        const length = 0.126 + random() * 0.085;
        const diameter = 0.032 + random() * 0.018;
        heading.set(Math.sin(angle), (random() - 0.5) * (layer === 3 ? 0.25 : 0.16), Math.cos(angle)).normalize();
        const limitX = w / 2 - Math.abs(heading.x) * length / 2 - diameter * 0.64 - 0.012;
        const limitZ = d / 2 - Math.abs(heading.z) * length / 2 - diameter * 0.64 - 0.012;
        const x = THREE.MathUtils.clamp((column - 1.5) * 0.088 + (random() - 0.5) * 0.064, -limitX, limitX);
        const z = THREE.MathUtils.clamp((row - 2.5) * 0.083 + (random() - 0.5) * 0.082, -limitZ, limitZ);
        const y = 0.040 + layer * 0.023 + random() * 0.013;
        model.put(assets.carrot, assets.root, [x, y, z], [diameter, length, diameter],
          new THREE.Quaternion().setFromUnitVectors(up, heading), carrotColors[Math.floor(random() * carrotColors.length)]);
      }
    }
  }
}

function leafCanopy(crowns, random) {
  const positions = [], colors = [];
  const green = new THREE.Color();
  function leaf(a, b, c, tint) {
    positions.push(...a, ...b, ...c);
    colors.push(tint.r * 0.78, tint.g * 0.78, tint.b * 0.78, tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
  }
  for (const [cx, cy, cz, lean] of crowns) {
    for (let i = 0; i < 20; i++) {
      const angle = lean + (random() - 0.5) * 1.95;
      const length = 0.091 + random() * 0.137;
      const rise = 0.025 + random() * 0.066;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const at = (t, across = 0) => [
        cx + dx * t * length - dz * across,
        cy + Math.sin(t * 2.45) * rise + 0.009 * t,
        cz + dz * t * length + dx * across,
      ];
      for (let n = 0; n < 9; n++) {
        const t = n / 9, end = (n + 1) / 9;
        green.setHex(i % 3 === 0 ? 0x5a8038 : i % 3 === 1 ? 0x466f2b : 0x688c36);
        leaf(at(t), at(t, 0.0018), at(end), green);
        if (n < 2) continue;
        for (const sign of [-1, 1]) {
          const width = sign * (0.005 + (1 - t) * (0.031 + random() * 0.018));
          for (let bud = 0; bud < 3; bud++) {
            const s = t - bud * 0.024;
            leaf(at(s, width * bud / 5), at(s + 0.072, width * (1 - bud * 0.21)), at(s + 0.050, width * 0.24), green);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function bunches(model, assets, random) {
  const crowns = [[-0.073, 0.102, 0.087, -1.98], [0.078, 0.093, 0.094, -1.26],
    [-0.068, 0.111, -0.104, -1.63], [0.069, 0.097, -0.067, -1.28], [0.006, 0.115, 0.016, -1.39]];
  const heading = new THREE.Vector3();
  for (const [x, y, z, angle] of crowns) {
    for (let i = 0; i < 8; i++) {
      const spread = angle + (random() - 0.5) * 1.5;
      const length = 0.105 + random() * 0.083;
      const diameter = 0.023 + random() * 0.013;
      heading.set(Math.cos(spread), 0.06 + random() * 0.35, Math.sin(spread)).normalize();
      model.put(assets.carrot, assets.root, [
        x - heading.x * length * 0.46 + (random() - 0.5) * 0.041,
        y - heading.y * length * 0.46,
        z - heading.z * length * 0.46,
      ], [diameter, length, diameter], new THREE.Quaternion().setFromUnitVectors(up, heading), carrotColors[i % carrotColors.length]);
    }
  }
  model.put(leafCanopy(crowns, random), assets.leaf, [0, 0, 0]);
}

function packageTop(isBag) {
  return surface(12, 12, (u, v) => {
    const x = 2 * u - 1, z = 1 - 2 * v;
    const corner = 1 - 0.071 * Math.pow(Math.abs(x * z), 4);
    const puff = Math.pow(Math.max(0, 1 - Math.abs(x) ** 6), 0.63) *
      Math.pow(Math.max(0, 1 - Math.abs(z) ** 6), 0.63);
    const wrinkles = Math.sin(u * 38 + v * 9.5) * Math.sin(v * 25 + u * 8) * 0.045;
    return [x * corner / 2, (isBag ? 0.21 : 0.59) + puff * ((isBag ? 0.79 : 0.31) + wrinkles), z * corner / 2];
  });
}

function packages(model, assets, type, random) {
  const isBag = type === 'bag' || type === 'organic';
  const mixed = type === 'mixed';
  const columns = mixed ? 3 : 2;
  const rows = type === 'beans' ? 2 : 3;
  const width = (w - 0.046) / columns;
  const depth = (d - (isBag ? 0.019 : 0.050)) / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5 - columns / 2) * width;
      const z = (row + 0.5 - rows / 2) * depth;
      const yaw = (random() - 0.5) * (isBag ? 0.23 : 0.080) + (isBag && (column + row) % 3 === 0 ? Math.PI : 0);
      const high = (isBag ? 0.076 : 0.050) * (0.87 + random() * 0.24);
      const packet = model.child([x, 0.037 + (isBag ? random() * 0.022 : 0), z], [(random() - 0.5) * 0.07, yaw, 0]);
      if (isBag) {
        packet.put(rounded, assets.packageSide[type], [0, high * 0.28, 0], [width * 0.92, high * 0.54, depth * 1.02]);
      } else {
        packet.put(rounded, assets.pulp, [0, high * 0.3, 0], [width * 0.95, high * 0.62, depth * 0.96]);
      }
      packet.put(isBag ? assets.bagTop : assets.trayTop, assets.print[type], [0, 0, 0],
        [width * (isBag ? 1.01 : 0.982), high, depth * (isBag ? 1.07 : 0.986)]);
    }
  }
}

function shelfLabel(model, assets, index, random) {
  const z = -d / 2 + 0.023;
  const x = (random() - 0.5) * 0.065;
  model.box(assets.plastic, [x, h + 0.011, z], [0.021, 0.050, 0.012]);
  const tag = model.child([x, 0.188, z + 0.006], [-0.20, (random() - 0.5) * 0.15, (random() - 0.5) * 0.19]);
  tag.put(rounded, assets.lip, [0, 0, 0], [0.134, 0.093, 0.005]);
  tag.put(atlasUV(plane.clone(), index, columns, 1, 0.021, 0.026), assets.label, [0, 0, 0.003],
    [0.128, 0.087, 1]);
}

export function makeCrateModels(m, textures) {
  const skin = carrotSkin();
  m.textures.carrotSkin = skin;
  const assets = {
    ...crateMaterials(m),
    root: m.material({ color: 0xffffff, vertexColors: true, roughness: 0.68, bumpMap: skin, bumpScale: 0.00074 }),
    leaf: m.material({ color: 0xffffff, vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
    carrot: carrotGeometry(),
    bagTop: packageTop(true),
    trayTop: packageTop(false),
    pulp: m.paint(0x9c835f, 0.96),
    packageSide: { bag: m.paint(0x60552e, 0.57), organic: m.paint(0xc38b64, 0.47) },
    print: Object.fromEntries(['bag', 'organic', 'mixed', 'beans'].map((type) => [type, m.material({
      map: textures[type], color: 0xe6ddce, roughness: 0.49, clearcoat: 0.38, clearcoatRoughness: 0.34,
    }, true)])),
    label: m.material({ map: textures['shelf-labels'], roughness: 0.77 }),
  };

  return crateTypes.map((type, index) => {
    const random = randomFrom(28329 + index * 753);
    const model = new Model();
    crateShell(model, assets);
    if (type === 'loose') loose(model, assets, random);
    else if (type === 'bunch') bunches(model, assets, random);
    else packages(model, assets, type, random);
    if (index < columns) shelfLabel(model, assets, index, random);
    return model.finish(type);
  });
}
