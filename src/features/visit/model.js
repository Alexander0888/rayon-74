import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const tau = Math.PI * 2;
export const box = new THREE.BoxGeometry();
export const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.075);
export const ball = new THREE.SphereGeometry(1, 16, 12);
export const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
export const plane = new THREE.PlaneGeometry();
const up = new THREE.Vector3(0, 1, 0);

export function randomSource(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function ring(radius, y, count = 48) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = (tau * i) / count;
    return [radius * Math.cos(a), y, radius * Math.sin(a)];
  });
}

// Круглое сечение вдоль линии сохраняет объём проволоки, прута или гирлянды при повороте.
export function tubes(paths, radius, sides = 5) {
  const positions = [],
    normals = [],
    indices = [];
  const tangent = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    binormal = new THREE.Vector3();
  for (const path of paths) {
    const start = positions.length / 3;
    const points = path.map((p) => new THREE.Vector3(...p));
    for (let i = 0; i < points.length; i++) {
      tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]).normalize();
      if (i === 0) normal.set(...(Math.abs(tangent.y) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      binormal.crossVectors(tangent, normal);
      for (let edge = 0; edge < sides; edge++) {
        const angle = (tau * edge) / sides;
        const n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
        positions.push(...points[i].clone().addScaledVector(n, radius).toArray());
        normals.push(...n.toArray());
        if (i + 1 < points.length) {
          const a = start + i * sides + edge,
            b = start + i * sides + ((edge + 1) % sides);
          indices.push(a, b, a + sides, b, b + sides, a + sides);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function lathe(profile, segments = 48) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

export function atlasUV(geometry, index, columns, rows, padX, padY) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      ((index % columns) + padX + uv.getX(i) * (1 - 2 * padX)) / columns,
      1 - (Math.floor(index / columns) + padY + (1 - uv.getY(i)) * (1 - 2 * padY)) / rows,
    );
  }
  return geometry;
}

const photoPlanes = new Map();
export function photoPlane(index) {
  if (!photoPlanes.has(index)) photoPlanes.set(index, atlasUV(plane.clone(), index, 4, 8, 0.013, 0.02));
  return photoPlanes.get(index);
}

function transform(position, rotation, scale) {
  const q = rotation.isQuaternion ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale));
}

// Детали задаются в своих координатах. Одинаковые формы рисуются одной командой.
export class Model {
  constructor(batches = new Map(), matrix = new THREE.Matrix4()) {
    this.batches = batches;
    this.matrix = matrix;
  }

  child(position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    return new Model(this.batches, this.matrix.clone().multiply(transform(position, rotation, scale)));
  }

  put(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], tint = 0xffffff) {
    const key = geometry.uuid + material.uuid;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, material, entries: [] });
    this.batches.get(key).entries.push([this.matrix.clone().multiply(transform(position, rotation, scale)), tint]);
  }

  box(material, position, size, rotation, tint) {
    this.put(box, material, position, size, rotation, tint);
  }

  rod(material, from, to, radius) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    this.put(cylinder, material, a.lerp(b, 0.5).toArray(), [radius, length, radius], rotation);
  }

  finish(name, castShadow = true) {
    const group = new THREE.Group();
    group.name = name;
    for (const { geometry, material, entries } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
      entries.forEach(([matrix, tint], i) => {
        mesh.setMatrixAt(i, matrix);
        if (tint !== 0xffffff) mesh.setColorAt(i, new THREE.Color(tint));
      });
      mesh.castShadow = castShadow && !material.transparent && !material.isMeshBasicMaterial;
      mesh.receiveShadow = !material.transparent;
      group.add(mesh);
    }
    return group;
  }
}
