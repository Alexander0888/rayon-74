import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function box(width, height, depth, bevel, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 1, bevel), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function panel(width, height, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

export function cylinder(radius, depth, material, x, y, z, segments = 32, topRadius = radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, depth, segments), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function lathe(profile, material, segments = 36, angle = 0, sweep = Math.PI * 2) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, angle, sweep), material);
}

export function line(points, thickness, material, segments = points.length * 2) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(path, segments, thickness, 5), material);
}

export function ring(radius, y, thickness, material, segments = 40) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 5, segments), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

export function surface(rows, columns, getPoint) {
  const position = [], uv = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      position.push(...getPoint(i / columns, j / rows));
      uv.push(i / columns, j / rows);
      if (i && j) {
        const br = j * (columns + 1) + i;
        const bl = br - 1;
        indices.push(bl - columns - 1, br - columns - 1, br, bl - columns - 1, br, bl);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Instances share one set of geometry. Merge the mesh parts that use the same material.
export function mergeParts(group) {
  const byMaterial = new Map();
  group.updateMatrixWorld(true);
  group.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    if (!byMaterial.has(node.material)) byMaterial.set(node.material, []);
    byMaterial.get(node.material).push(geometry);
    node.geometry.dispose();
  });
  return Array.from(byMaterial, ([material, geometries]) => {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometries.length > 1) geometries.forEach((part) => part.dispose());
    return { material, geometry };
  });
}

export function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
