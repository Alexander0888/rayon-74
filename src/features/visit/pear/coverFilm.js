import * as THREE from 'three';
import { randomFrom, surface } from '../christmas/geometry.js';
import { paintedTexture } from '../texture.js';

const { clamp, smoothstep } = THREE.MathUtils;
const maxLift = 0.27;

export function makeCoverFilm(m, width, stand, offset) {
  const grain = paintedTexture(384, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4e1d6';
    ctx.fillRect(0, 0, w, h);
    const rng = randomFrom(7315);
    for (let i = 0; i < 12000; i++) {
      const x = rng() * w, y = rng() * h;
      ctx.fillStyle = rng() > 0.50 ? 'rgba(255,255,245,.27)' : 'rgba(136,135,125,.15)';
      ctx.fillRect(x, y, 0.8 + rng() * 5, 0.25 + rng() * 1.2);
    }
    for (let i = 0; i < 32; i++) {
      const x = rng() * w, y = rng() * h;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 8 + rng() * 42);
      gradient.addColorStop(0, i % 2 ? 'rgba(245,243,231,.21)' : 'rgba(133,127,113,.10)');
      gradient.addColorStop(1, 'rgba(225,222,213,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 50, y - 50, 100, 100);
    }
  });
  m.textures.orchardFilm = grain;
  const material = m.material({
    map: grain, bumpMap: grain, bumpScale: 0.0021, color: 0xf0eee5,
    roughness: 0.61, clearcoat: 0.38, clearcoatRoughness: 0.47,
    side: THREE.DoubleSide, transparent: true, opacity: 0.76, depthWrite: false, forceSinglePass: true,
  }, true);

  function shape(u, v) {
    const x = (u - 0.5) * (width + 0.11);
    const z = (0.5 - v) * 1.43;
    const sides = smoothstep(Math.abs(z), 0.545, 0.715);
    const ends = smoothstep(Math.abs(x), width / 2 - 0.050, width / 2 + 0.065);
    const edge = Math.max(sides, ends);
    const valley = Math.sin(u * 41 + 3 * Math.sin(v * 7));
    const folds = 0.016 * valley + 0.010 * Math.sin(90 * u + 11 * v) +
      0.018 * Math.sin(12 * u - 6 * v) + 0.017 * Math.cos(31 * v + 18 * u);
    const crease = 0.028 * Math.exp(-55 * Math.abs(v - (0.13 + 0.62 * u))) * Math.sin(Math.PI * u);
    const bunch = Math.exp(-Math.pow((u - 0.78) / 0.22, 2) - Math.pow((v - 0.88) / 0.20, 2));
    const crumple = (0.023 + 0.023 * Math.sin(118 * u - 25 * v)) * bunch;
    return [
      x + edge * (0.017 * Math.cos(v * 39) + 0.019 * Math.sin(u * 9)),
      0.232 + folds * (0.70 + 0.51 * edge) + crease + crumple - edge * (0.155 + 0.019 * valley),
      z + sides * (0.025 * Math.sin(u * 26) + 0.010 * Math.sin(u * 67)) + 0.009 * Math.cos(v * 11),
    ];
  }

  const geometry = surface(36, 104, shape);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += maxLift;
  const base = geometry.attributes.position.array.slice();
  const node = new THREE.Mesh(geometry, material);
  node.name = 'Film froissé';
  node.position.set(offset, stand.y, 0);
  node.rotation.x = stand.slope;
  node.receiveShadow = true;
  const raycaster = new THREE.Raycaster();
  const cosine = Math.cos(stand.slope), sine = Math.sin(stand.slope);
  let handle = null, height = 0, releaseTime = 0, releasedHeight = 0;

  function deform(value) {
    height = value;
    const { position, uv } = geometry.attributes;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const distance = Math.hypot((u - handle.x) * 1.25, (v - handle.y) * 1.17);
      const lift = value * (1 - smoothstep(distance, 0.015, 0.59));
      position.setY(i, base[i * 3 + 1] + lift * cosine);
      position.setZ(i, base[i * 3 + 2] - lift * sine);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return {
    node,
    pick(ray) {
      raycaster.ray.copy(ray);
      const hit = raycaster.intersectObject(node)[0];
      if (!hit?.uv) return null;
      const { x, y } = hit.uv;
      return Math.min(x, 1 - x, y, 1 - y) <= 0.18 ? hit : null;
    },
    grab(uv) {
      handle = uv.clone();
      releaseTime = 0;
      deform(0);
    },
    lift(metres) { if (handle) deform(clamp(metres, 0, maxLift)); },
    release(time) {
      if (!height) { handle = null; return; }
      releaseTime = time;
      releasedHeight = height;
    },
    update(time) {
      if (!releaseTime) return false;
      const progress = smoothstep(time - releaseTime, 0, 425);
      deform(releasedHeight * (1 - progress));
      if (progress < 1) return true;
      releaseTime = 0;
      handle = null;
      return false;
    },
  };
}
