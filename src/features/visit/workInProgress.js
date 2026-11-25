import * as THREE from 'three';
import { departmentVisit } from '../../content/fr.js';
import { surface } from './christmas/geometry.js';
import { paintedTexture } from './texture.js';
import { plane, tubes } from './model.js';

export function makeProtections(m) {
  const print = paintedTexture(512, 240, (ctx, width, height) => {
    ctx.fillStyle = '#f1ece0';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#a28155';
    ctx.fillRect(0, 0, 16, height);
    ctx.fillStyle = '#34332b';
    ctx.font = '600 58px Arial, sans-serif';
    const words = departmentVisit.inProgress.split(' ');
    ctx.fillText(words.slice(0, -1).join(' '), 37, 103);
    ctx.fillText(words.at(-1), 37, 176);
  });
  m.textures.workCard = print;
  return {
    cloth: m.material({
      color: 0xbcb9ae, side: THREE.DoubleSide, roughness: 0.92,
      bumpMap: m.textures.paper, bumpScale: 0.0015,
    }),
    seam: m.paint(0xc5c0b2, 0.88),
    card: m.material({ map: print, roughness: 0.68 }),
    rail: m.paint(0x505049, 0.68),
    glass: m.material({
      color: 0xe9eeee, metalness: 0.14, roughness: 0.15, clearcoat: 0.85,
      transparent: true, opacity: 0.23, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    }, true),
    film: m.material({
      color: 0xd3d9d5, roughness: 0.75, metalness: 0.02,
      transparent: true, opacity: 0.93, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    }),
    tape: m.paint(0xc3b693, 0.79),
  };
}

export function coverProduce(lift, length, work) {
  function clothPoint(u, v) {
    const s = 2 * u - 1;
    const t = 1 - 2 * v;
    const baseX = s * (length / 2 + 0.072);
    const baseZ = t * 0.526;
    const foldX = THREE.MathUtils.smoothstep(Math.abs(baseX), length / 2 - 0.009, length / 2 + 0.066);
    const foldZ = THREE.MathUtils.smoothstep(Math.abs(baseZ), 0.438, 0.516);
    const drape = Math.max(foldX, foldZ);
    const creases = 0.009 * Math.sin(u * 38 + Math.sin(v * 11))
      + 0.0055 * Math.sin(u * 97 - v * 5) + 0.006 * Math.sin(v * 13 + u * 8);
    const end = Math.pow(Math.abs(s), 11) * Math.pow(Math.abs(t), 8);
    const height = 0.182 + (0.72 + drape * 0.73) * creases - drape * (0.129 - 0.018 * end);
    const x = baseX - 0.034 * end * Math.sign(s);
    const z = baseZ + Math.sign(t) * drape * (0.011 * Math.cos(u * 37) - 0.021 * end);
    return [x, height, z];
  }

  lift.put(surface(28, 68, clothPoint), work.cloth, [0, 0, 0]);
  const stitches = [
    Array.from({ length: 57 }, (_, i) => clothPoint(i / 56, 0)),
    Array.from({ length: 57 }, (_, i) => clothPoint(i / 56, 1)),
    Array.from({ length: 21 }, (_, i) => clothPoint(0, i / 20)),
    Array.from({ length: 21 }, (_, i) => clothPoint(1, i / 20)),
  ];
  lift.put(tubes(stitches, 0.0031, 5), work.seam, [0, 0, 0]);
}

export function workCard(p, work, x, y, z, yaw = 0) {
  const card = p.child([x, y, z], [-0.06, yaw, 0]);
  card.box(work.rail, [0, 0, 0], [0.315, 0.152, 0.012]);
  card.put(plane, work.card, [0, 0, 0.007], [0.297, 0.137, 1]);
  card.put(plane, work.card, [0, 0, -0.007], [0.297, 0.137, 1], [0, Math.PI, 0]);
}

export function coverDisplay(p, work, x, y, z, width, height, tilt = 0) {
  const panel = p.child([x, y, z], [tilt, 0, 0]);
  panel.put(plane, work.glass, [0, 0, 0], [width, height, 1]);
  const filmWidth = width - 0.10;
  const filmHeight = height * 0.78;
  panel.put(plane, work.film, [0, 0, 0.008], [filmWidth, filmHeight, 1]);
  for (const side of [-1, 1]) {
    panel.box(work.tape, [side * (filmWidth / 2 - 0.026), filmHeight / 2, 0.01],
      [0.013, 0.059, 0.002], [0, 0, side * 0.26]);
  }
}
