import * as THREE from 'three';
import { lathe, plane, rounded } from '../model.js';
import { addBedProxy, makeCabinet } from '../carrot/fixtures.js';
import { paintedTexture } from '../texture.js';
import { herbHoleRadius, herbSlots, herbStand, oliveStand, oliveTiers } from './layout.js';

export function makeOliveStand(m, wood, notice) {
  const { group, structure, proxy, invisible } = makeCabinet(m, wood, oliveStand);
  const shelf = m.paint(0x3c3f42, 0.57, 0.28);
  const fascia = m.paint(0x2e3133, 0.66, 0.20);
  const edge = m.paint(0x515659, 0.52, 0.45);
  const width = oliveStand.w - 0.071;
  oliveTiers.forEach(({ back, front, y }, index) => {
    const depth = front - back, z = (front + back) / 2;
    const below = oliveTiers[index + 1]?.y ?? 0.474;
    structure.box(shelf, [0, y - 0.011, z], [width, 0.022, depth + 0.003]);
    structure.box(fascia, [0, (below + y) / 2, front - 0.011], [width, y - below, 0.022]);
    structure.box(edge, [0, y - 0.006, front], [width, 0.012, 0.006]);
    structure.box(fascia, [0.012, y + 0.0008, z], [0.003, 0.0016, depth]);
    const volume = new THREE.Mesh(new THREE.BoxGeometry(width, y - 0.003, depth), invisible);
    volume.position.set(0, (y - 0.003) / 2, z);
    proxy.add(volume);
  });
  const board = structure.child([-1.024, 1.188, -0.339], [-0.38, -0.05, 0.037]);
  board.put(rounded, fascia, [0, 0, 0], [0.173, 0.106, 0.010]);
  const photo = m.material({ map: notice, roughness: 0.79 });
  board.put(plane, photo, [0, 0.004, 0.0052], [0.161, 0.091, 1]);
  board.box(edge, [0, -0.044, 0.0023], [0.176, 0.014, 0.013]);
  group.add(structure.finish('Plateaux en acier graphite'));
  return { group, proxy };
}

function herbPlate(width, depth) {
  const shape = new THREE.Shape().moveTo(-width / 2, -depth / 2)
    .lineTo(width / 2, -depth / 2).lineTo(width / 2, depth / 2)
    .lineTo(-width / 2, depth / 2).closePath();
  for (const { x, plateZ } of herbSlots) {
    const hole = new THREE.Path();
    hole.absarc(x, -plateZ, herbHoleRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ShapeGeometry(shape, 11);
  const { position, uv } = geometry.attributes;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / depth + 0.5);
  return geometry;
}

function linerTexture() {
  return paintedTexture(384, 192, (ctx, width, height) => {
    const metal = ctx.createLinearGradient(0, 0, width, 0);
    metal.addColorStop(0, '#55544c');
    metal.addColorStop(0.19, '#827e73');
    metal.addColorStop(0.40, '#3d3b35');
    metal.addColorStop(0.65, '#67625a');
    metal.addColorStop(0.85, '#8d8879');
    metal.addColorStop(1, '#55544c');
    ctx.fillStyle = metal;
    ctx.fillRect(0, 0, width, height);
    for (let row = 0; row < 5; row++) {
      for (let col = -1; col < 20; col++) {
        const x = col * 20 + row % 2 * 10, y = 33 + row * 29;
        ctx.fillStyle = '#a09a87';
        ctx.beginPath();
        ctx.ellipse(x + 0.9, y + 1.8, 4.5, 6.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#201e19';
        ctx.beginPath();
        ctx.ellipse(x, y, 3.9, 5.0, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export function makeHerbStand(m, wood, textures) {
  const { group, structure, proxy, invisible } = makeCabinet(m, wood, herbStand);
  const plate = structure.child([0, herbStand.y, 0], [herbStand.slope, 0, 0]);
  const width = herbStand.w - 0.071, depth = 1.381;
  const brushed = textures['brushed-steel'];
  const steel = m.material({ color: 0xd7d5cd, map: brushed, bumpMap: brushed, bumpScale: 0.00043,
    metalness: 0.68, roughness: 0.34, envMapIntensity: 1.20 });
  const frame = m.paint(0x444446, 0.51, 0.40);
  const rim = m.material({ color: 0xc7c4b9, metalness: 0.84, roughness: 0.24, side: THREE.DoubleSide });
  const texture = linerTexture();
  m.textures.herbLiner = texture;
  const cup = m.material({ color: 0xd3cbbf, map: texture, metalness: 0.49, roughness: 0.39, side: THREE.DoubleSide });
  const lip = lathe([[0.0559, -0.013], [0.0567, 0], [0.058, 0.0026], [0.061, 0.0032], [0.063, 0.0017], [0.0628, -0.002]], 28);
  const liner = lathe([[0, -0.094], [0.037, -0.094], [0.044, -0.087], [0.047, -0.065], [0.051, -0.039], [0.0567, -0.007]], 28);
  plate.box(frame, [0, -0.109, 0], [width - 0.004, 0.016, depth]);
  for (const z of [-depth / 2 + 0.010, depth / 2 - 0.008]) {
    plate.box(frame, [0, -0.022, z], [width + 0.006, 0.049, 0.018]);
    plate.box(steel, [0, -0.006, z], [width, 0.006, 0.019]);
  }
  plate.put(herbPlate(width, depth), steel, [0, 0.0007, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  for (const { x, plateZ } of herbSlots) {
    plate.put(liner, cup, [x, 0, plateZ]);
    plate.put(lip, rim, [x, 0, plateZ]);
  }
  const engraved = m.material({ map: textures['herbes-fraiches'], transparent: true, opacity: 0.76, depthWrite: false, roughness: 0.48 });
  plate.put(plane, engraved, [0, 0.0021, 0.605], [0.275, 0.0611, 1], [-Math.PI / 2, 0, 0]);
  addBedProxy(proxy, invisible, herbStand);
  group.add(structure.finish('Inox brossé et godets perforés'));
  return { group, proxy };
}
