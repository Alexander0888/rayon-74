import { worldOffset } from './floorGeometry.js';

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function nearbyPose(origin, { w, d }, fits) {
  const candidates = [];
  // Начинаем с зазора у грани объекта и ищем ближайшее свободное место вокруг него.
  for (let ring = 0; ring <= 16; ring += 1) {
    const gap = 0.055 + 0.18 * ring;
    for (const [x, z] of directions) {
      const dx = x * (w + gap), dz = z * (d + gap);
      candidates.push({ ...worldOffset(origin, dx, dz), yaw: origin.yaw, distance: Math.hypot(dx, dz) });
    }
  }
  const pose = candidates.sort((left, right) => left.distance - right.distance).find(fits);
  return pose ? { x: pose.x, z: pose.z, yaw: pose.yaw } : null;
}

export function copyRequests(sources, definitions, positions) {
  return Object.entries(definitions).flatMap(([id, source]) => {
    const index = sources.indexOf(source);
    return index >= 0 && Object.hasOwn(positions, id) ? [{ id, index }] : [];
  });
}

export function releaseCopyNode(node) {
  node.removeFromParent();
  // Материалы и геометрия общие, а буферы экземпляров принадлежат конкретной копии.
  node.traverse((child) => { if (child.isInstancedMesh) child.dispose(); });
}

export function syncCopyNodes(root, nodes, copies, makeNode) {
  const active = new Map(copies.map(({ id, index }) => [id, index]));
  for (const [id, { index, node }] of nodes) {
    if (active.get(id) === index) continue;
    releaseCopyNode(node);
    nodes.delete(id);
  }
  return copies.map(({ id, index }) => {
    if (!nodes.has(id)) {
      const node = makeNode(index, id);
      node.name = id;
      root.add(node);
      nodes.set(id, { index, node });
    }
    return nodes.get(id).node;
  });
}
