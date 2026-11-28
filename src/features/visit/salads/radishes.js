import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from '../christmas/geometry.js';
import { tau } from '../model.js';

const { lerp, smoothstep } = THREE.MathUtils;
const up = new THREE.Vector3(0, 1, 0);

// Crate-local positions and yaw, with the tops pointing away from the aisle.
const bunches = [
  [-0.066, -0.129, -2.93, 0.92], [0.064, -0.130, 2.96, 0.96],
  [-0.066, -0.010, 2.84, 1.01], [0.067, 0.002, -2.88, 0.96],
  [-0.064, 0.131, -2.76, 0.99], [0.062, 0.130, 2.71, 1.02],
];

// Loose lower ring and two bulbs resting on it. The stems converge just past the crowns.
const bulbs = [
  [-0.035, 0.024, -0.055, 0.022], [0.010, 0.025, -0.073, 0.024], [0.046, 0.022, -0.045, 0.020],
  [-0.031, 0.023, -0.013, 0.021], [-0.010, 0.055, -0.036, 0.024], [0.029, 0.048, -0.019, 0.021],
];

// Blade origin, length, yaw, pitch and roll. The longer leaves cover the smaller lateral ones.
const fan = [
  [[-0.018, 0.046, 0.036], 0.071, -0.81, 0.13, -0.27],
  [[0.016, 0.048, 0.035], 0.080, 0.76, -0.05, 0.38],
  [[-0.008, 0.061, 0.044], 0.098, -0.31, 0.18, -0.10],
  [[0.013, 0.063, 0.049], 0.092, 0.33, -0.02, 0.31],
  [[-0.017, 0.071, 0.041], 0.084, -0.62, -0.29, -0.39],
  [[0.015, 0.070, 0.041], 0.087, 0.61, -0.21, 0.21],
  [[0.000, 0.079, 0.057], 0.084, -0.06, -0.20, -0.16],
  [[0.011, 0.075, 0.031], 0.062, 1.12, -0.34, 0.13],
];

function tintVertices(mesh, getColor) {
  const { uv, position } = mesh.attributes;
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) getColor(uv.getX(i), uv.getY(i), position.getY(i)).toArray(colors, i * 3);
  mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return mesh;
}

function radishSkin(bend, red) {
  const rings = 32, sides = 24;
  const profile = new THREE.SplineCurve([
    [0.009, -2.67], [0.025, -2.36], [0.044, -1.99], [0.061, -1.69], [0.082, -1.43],
    [0.115, -1.16], [0.225, -1.02], [0.469, -0.88], [0.702, -0.71], [0.889, -0.48],
    [0.995, -0.17], [0.993, 0.17], [0.928, 0.43], [0.761, 0.65], [0.493, 0.84],
    [0.245, 0.91], [0.010, 0.93],
  ].map(([r, y]) => new THREE.Vector2(r, y)));
  const mesh = surface(rings, sides, (u, v) => {
    const angle = u * tau;
    const { x: radius, y } = profile.getPoint(v);
    const tail = Math.max(0, (-y - 0.98) / 1.69);
    const r = radius * (1 + 0.036 * Math.sin(angle * 3 + y * 3 + bend) + 0.035 * Math.cos(angle * 2 - y * 2));
    return [Math.cos(angle) * r + bend * tail ** 2, y, -Math.sin(angle) * r + 0.40 * Math.sin(tail * Math.PI) * tail];
  });
  // The UV seam duplicates vertices. Average the two edge normals to keep the highlight continuous.
  const { normal } = mesh.attributes;
  const left = new THREE.Vector3(), right = new THREE.Vector3();
  for (let ring = 0; ring <= rings; ring++) {
    const first = ring * (sides + 1), last = first + sides;
    left.fromBufferAttribute(normal, first).add(right.fromBufferAttribute(normal, last)).normalize();
    normal.setXYZ(first, left.x, left.y, left.z);
    normal.setXYZ(last, left.x, left.y, left.z);
  }
  const skin = new THREE.Color(red), pink = new THREE.Color(0xed8791);
  const ivory = new THREE.Color(0xf0d8b6), crown = new THREE.Color(0xa98758), color = new THREE.Color();
  return tintVertices(mesh, (u, v, y) => {
    const angle = u * tau;
    const fleck = Math.sin(angle * 7 + v * 48) * Math.cos(angle * 11 - v * 67);
    const fade = 0.077 * Math.sin(angle * 5 + bend) + 0.045 * Math.cos(angle * 8 - v * 12);
    color.copy(skin).lerp(pink, 0.044 + fleck * 0.038);
    color.lerp(pink, 1 - smoothstep(y + fade, -1.48, -0.92));
    color.lerp(ivory, 1 - smoothstep(y + fade, -1.98, -1.35));
    return color.lerp(crown, smoothstep(y + fade * 0.30, 0.79, 0.95));
  });
}

function blade(width, bow, twist, sweep) {
  return surface(32, 12, (u, v) => {
    const side = 1 - 2 * u;
    const sideWeight = Math.abs(side);
    const lobeOffset = (v - 0.30 + side * 0.037) / 0.091;
    const lobe = 0.075 * Math.exp(-lobeOffset * lobeOffset);
    const terminal = 0.33 * Math.sin(Math.PI * v ** 1.72) ** 0.57;
    const ripple = Math.sin(v * 31 + side * 2.4) + 0.47 * Math.sin(v * 61 - side * 4);
    const halfWidth = (0.002 + terminal + lobe) * width * (1 + 0.12 * side * sweep + 0.037 * ripple);
    const envelope = Math.sin(v * Math.PI);
    const spine = bow * Math.sin(v * 2.92) - 0.092 * v ** 3;
    const rib = 0.019 * Math.exp(-sideWeight * 14) * envelope;
    const fold = (sideWeight ** 1.85 * (0.11 + 0.024 * ripple) + twist * side * v) * envelope;
    return [side * halfWidth + sweep * v * v, spine + rib + fold, v - 0.021 * side * envelope];
  });
}

function stalk(points, segments, sides, startRadius, endRadius, startColor, endColor) {
  const path = new THREE.CatmullRomCurve3(points);
  const frames = path.computeFrenetFrames(segments, false);
  const centers = path.getSpacedPoints(segments);
  const mesh = surface(segments, sides, (u, v) => {
    const step = Math.round(v * segments), angle = u * tau, radius = lerp(startRadius, endRadius, v);
    return centers[step].clone()
      .addScaledVector(frames.normals[step], Math.cos(angle) * radius)
      .addScaledVector(frames.binormals[step], Math.sin(angle) * radius)
      .toArray();
  });
  const start = new THREE.Color(startColor), end = new THREE.Color(endColor), color = new THREE.Color();
  return tintVertices(mesh, (u, v) => color.copy(start).lerp(end, v).multiplyScalar(0.92 + 0.08 * Math.cos(u * tau * 3)));
}

function binding(tie) {
  const loop = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24, angle = tau * t * 1.83 + 0.42;
    return tie.clone().add(new THREE.Vector3(
      0.011 * Math.cos(angle), 0.008 * Math.sin(angle), 0.006 * (t - 0.5) + 0.0008 * Math.sin(angle),
    ));
  });
  const knot = [loop.at(-1), tie.clone().add(new THREE.Vector3(0.009, 0.009, 0.003)),
    tie.clone().add(new THREE.Vector3(0.013, 0.011, -0.002)), tie.clone().add(new THREE.Vector3(0.018, 0.007, -0.008))];
  return [stalk(loop, 40, 6, 0.00115, 0.00100, 0xd0ad73, 0xe7cca0),
    stalk(knot, 13, 6, 0.00155, 0.00054, 0xb38a56, 0xe5c093)];
}

export function radishMaterials(m, { 'radish-skin': skin, 'radish-leaf': leaf }) {
  // The texture maps sample the reference photo's skin and leaf veins.
  return {
    skin: m.material({ map: skin, vertexColors: true, bumpMap: skin, bumpScale: 0.00019, roughness: 0.48,
      clearcoat: 0.13, clearcoatRoughness: 0.51 }, true),
    leaf: m.material({ map: leaf, bumpMap: leaf, bumpScale: 0.00034, side: THREE.DoubleSide, roughness: 0.78 }),
    stalk: m.material({ vertexColors: true, roughness: 0.76 }),
  };
}

export function fillRadishCrate(model, material, random) {
  const roots = [radishSkin(0.64, 0xcf1740), radishSkin(-0.79, 0xde2147), radishSkin(1.04, 0xc61637)];
  const leaves = [blade(0.93, 0.12, 0.11, 0.08), blade(1.03, 0.16, -0.20, -0.10), blade(1.10, 0.21, 0.18, -0.06)];
  const leafTints = [0xbbd19b, 0xf1f8d2, 0xd8e7be, 0xc4d6ac];
  const jitter = (span) => (random() - 0.5) * span;

  for (const [index, [x, z, yaw, size]] of bunches.entries()) {
    const bunch = model.child([x, 0.0335, z], [0, yaw, 0], [size, size, size]);
    const tie = new THREE.Vector3(0, 0.054, 0.015);
    const crowns = bulbs.map(([x, y, z, baseRadius], i) => {
      const center = new THREE.Vector3(x + jitter(0.008), y + jitter(0.004), z + jitter(0.011));
      const radius = baseRadius * (0.92 + random() * 0.14);
      const aim = tie.clone().add(new THREE.Vector3(jitter(0.036), jitter(0.023), 0.016)).sub(center);
      aim.y = Math.min(aim.y, Math.hypot(aim.x, aim.z) * 0.31);
      aim.normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(up, aim)
        .multiply(new THREE.Quaternion().setFromAxisAngle(up, random() * tau));
      bunch.put(roots[(i + index) % roots.length], material.skin, center.toArray(),
        [radius, radius * (0.91 + random() * 0.13), radius * (0.92 + random() * 0.13)], rotation);
      return center.addScaledVector(aim, radius * 0.83);
    });

    const stems = fan.map(([origin, length, yaw, pitch, roll], i) => {
      const start = new THREE.Vector3(...origin).add(new THREE.Vector3(jitter(0.013), jitter(0.010), jitter(0.013)));
      const scale = length * (0.91 + random() * 0.17);
      const rotation = new THREE.Euler(pitch + jitter(0.28), yaw + jitter(0.29), roll + jitter(0.31), 'YXZ');
      bunch.put(leaves[(i + index) % leaves.length], material.leaf, start.toArray(), [scale, scale, scale],
        rotation.toArray(), leafTints[(i + index) % leafTints.length]);

      const crown = crowns[i % crowns.length];
      const angle = i * tau / fan.length;
      const through = tie.clone().add(new THREE.Vector3(0.0078 * Math.cos(angle), 0.0048 * Math.sin(angle), 0));
      const fromCrown = crown.clone().lerp(through, 0.48);
      fromCrown.y += 0.003;
      const leafBase = new THREE.Vector3(0, 0.004, 0.011).applyEuler(rotation).add(start);
      return stalk([crown, fromCrown, through, start, leafBase], 14, 6, 0.0035, 0.00074,
        i % 2 ? 0x94aa52 : 0xb1bd70, 0x78964a);
    });

    stems.push(...binding(tie));
    bunch.put(mergeGeometries(stems), material.stalk, [0, 0, 0]);
    stems.forEach((stem) => stem.dispose());
  }
}
