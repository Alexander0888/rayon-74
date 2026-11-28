import * as THREE from 'three';

// Все пачки одного типа используют одни и те же матрицы деталей и общие группы отрисовки.
export function stockMeshes(root, pieces, templates) {
  const batches = new Map();
  const refs = pieces.map(() => []);
  pieces.forEach(({ type }, index) => {
    for (const [key, { geometry, material, entries }] of templates[type].batches) {
      if (!batches.has(key)) batches.set(key, { geometry, material, entries: [] });
      const batch = batches.get(key);
      entries.forEach(([matrix, tint]) => {
        refs[index].push({ batch, slot: batch.entries.length, matrix });
        batch.entries.push(tint);
      });
    }
  });

  const dirty = new Set();
  const combined = new THREE.Matrix4(), bounds = new THREE.Sphere();
  for (const batch of batches.values()) {
    const { geometry, material, entries } = batch;
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = !material.transparent && material.userData.castShadow !== false;
    mesh.receiveShadow = !material.transparent;
    entries.forEach((tint, index) => {
      if (tint !== 0xffffff) mesh.setColorAt(index, new THREE.Color(tint));
    });
    batch.mesh = mesh;
    root.add(mesh);
  }

  return {
    set(index, pose, preview = false) {
      for (const { batch, slot, matrix } of refs[index]) {
        const { mesh, geometry } = batch;
        combined.multiplyMatrices(pose, matrix);
        mesh.setMatrixAt(slot, combined);
        if (preview) mesh.boundingSphere.union(bounds.copy(geometry.boundingSphere).applyMatrix4(combined));
        dirty.add(mesh);
      }
    },
    update(rebuild = false) {
      for (const mesh of dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        if (rebuild) mesh.computeBoundingSphere();
      }
      dirty.clear();
    },
  };
}
