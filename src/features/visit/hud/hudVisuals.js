import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { randomSource, tau } from '../model.js';

export const facePixels = { width: 448, height: 356 };
export const slab = { width: 1.81, height: 1.81 * facePixels.height / facePixels.width, depth: 0.10 };

function rearFinish() {
  const canvas = document.createElement('canvas');
  canvas.width = facePixels.width * 2;
  canvas.height = facePixels.height * 2;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#526b79');
  gradient.addColorStop(0.48, '#a3b4ba');
  gradient.addColorStop(1, '#5e7782');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const random = randomSource(429);
  for (let y = 0; y < height; y += 2) {
    ctx.fillStyle = random() > 0.5 ? '#e1eff215' : '#17283119';
    ctx.fillRect(0, y, width, 1);
  }
  ctx.strokeStyle = '#293e4d94';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = '#293b48';
  for (const x of [24, width - 24]) {
    for (const y of [24, height - 24]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, tau);
      ctx.fill();
      ctx.fillRect(x - 1.7, y - 0.4, 3.4, 0.8);
    }
  }
  ctx.fillStyle = '#20262aa8';
  ctx.font = 'italic 28px "Marker Felt", "Bradley Hand", cursive';
  const markerText = 'In fraud we trust';
  let x = (width - ctx.measureText(markerText).width) / 2;
  for (const letter of markerText) {
    ctx.save();
    ctx.translate(x, height - 19 + random() * 2 - 1);
    ctx.rotate((random() - 0.5) * 0.4);
    ctx.fillText(letter, 0, 0);
    x += ctx.measureText(letter).width + (random() - 0.5) * 0.7;
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeHudBody() {
  const root = new THREE.Group();
  const geometry = new RoundedBoxGeometry(slab.width, slab.height, slab.depth, 3, 0.036);
  const shell = new THREE.MeshStandardMaterial({
    color: 0x849da9, metalness: 0.32, roughness: 0.42, transparent: true,
  });
  const glazed = new THREE.MeshBasicMaterial({ color: 0xc6e1ee, transparent: true, toneMapped: false });
  const sheet = new THREE.Mesh(geometry, [shell, shell, shell, shell, glazed, shell]);
  const finish = rearFinish();
  const rear = new THREE.Mesh(
    new THREE.PlaneGeometry(slab.width - 0.07, slab.height - 0.07),
    new THREE.MeshBasicMaterial({ map: finish, transparent: true, toneMapped: false }),
  );
  rear.rotation.y = Math.PI;
  rear.position.z = -slab.depth / 2 - 0.0003;
  root.add(sheet, rear);
  root.visible = false;
  return {
    root,
    fade(opacity) {
      shell.opacity = glazed.opacity = rear.material.opacity = opacity;
    },
    dispose() {
      geometry.dispose();
      rear.geometry.dispose();
      shell.dispose();
      glazed.dispose();
      rear.material.dispose();
      finish.dispose();
    },
  };
}

function orbitLines(random, index) {
  const vertices = [];
  const radius = 0.25 + index * 0.035;
  for (let track = 0; track < 3; track++) {
    for (let i = 0; i < 104; i++) {
      if (random() < (track === 0 ? 0.36 : 0.76)) continue;
      const r = radius + track * 0.012;
      const start = i * tau / 104;
      const end = start + tau / 104 * (track === 0 ? 0.96 : 0.62);
      vertices.push(Math.cos(start) * r, 0, Math.sin(start) * r * 0.84);
      vertices.push(Math.cos(end) * r, 0, Math.sin(end) * r * 0.84);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: index % 3 === 0 ? 0xb8691d : 0x087f98,
    transparent: true, depthWrite: false, toneMapped: false,
  }));
}

export function makeHudProjection() {
  const root = new THREE.Group();
  const random = randomSource(75);
  const rings = Array.from({ length: 6 }, (_, index) => orbitLines(random, index));
  const dots = [], colors = [];
  const cyan = new THREE.Color(0x39cce7), amber = new THREE.Color(0xffae52);
  for (let i = 0; i < 218; i++) {
    const azimuth = random() * tau, elevation = random() * 2 - 1;
    const r = 0.07 + random() * 0.42;
    const radial = Math.sqrt(1 - elevation * elevation) * r;
    dots.push(Math.cos(azimuth) * radial, r * elevation, Math.sin(azimuth) * radial);
    colors.push(...(i % 3 ? cyan : amber).toArray());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.018, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
  }));
  root.add(...rings, points);
  root.visible = false;
  return {
    root,
    animate(t, amount) {
      const strength = Math.sin(Math.PI * t) ** 0.68;
      root.visible = t < 1;
      root.rotation.y = -t * 1.8;
      root.scale.setScalar((0.36 + 1.36 * t) * amount);
      rings.forEach((ring, i) => {
        ring.rotation.set(0.38 + i * 0.59 + t * (i % 2 ? -1.65 : 2.24), i * 0.48, i * 0.38 - t * 0.95);
        ring.material.opacity = strength * (i % 3 ? 0.69 : 0.88);
      });
      points.material.opacity = strength * 0.87;
    },
    dispose() {
      for (const shape of root.children) {
        shape.geometry.dispose();
        shape.material.dispose();
      }
    },
  };
}
