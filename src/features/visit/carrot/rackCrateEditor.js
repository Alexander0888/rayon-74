import * as THREE from 'three';
import { crateRecord, loadCrateCopies, loadCrateRecord, moveCrate, originalCrates, swapCrates } from './arrangement.js';
import { crateSize, rackCellAt, rackCratePose } from './layout.js';
import { copyRequests, nearbyPose, syncCopyNodes } from '../sceneCopies.js';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function createRackCrateEditor({ root, stand: initial, slots, types: baseTypes, models: baseModels, proxy, ids: baseIds, bounds,
  kind = 'crate', dimensions = crateSize, pickHeight }) {
  const { width, depth, height } = dimensions;
  const stand = { ...initial };
  const copyNodes = new Map();
  let models = baseModels, types = baseTypes, ids = baseIds;
  const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), center = new THREE.Vector3();
  const bed = new THREE.Plane();

  function setPose(node, location, lift) {
    const pose = rackCratePose(stand, slots, location, lift);
    node.position.set(pose.x, pose.y, pose.z);
    node.rotation.set(pose.slope, pose.yaw, 0, 'YXZ');
    node.updateMatrixWorld(true);
  }

  const outlineBox = new THREE.BoxGeometry(width + 0.009, height + 0.012, depth + 0.009);
  outlineBox.translate(0, height / 2, 0);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffd079, toneMapped: false });
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox), outlineMaterial);
  outlineBox.dispose();
  outline.visible = false;
  root.add(outline);
  root.updateMatrixWorld(true);

  const localRay = new THREE.Ray(), point = new THREE.Vector3();
  const caster = new THREE.Raycaster();
  const inverses = [], matrices = [];
  const pickBox = (type) => new THREE.Box3(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, pickHeight ?? (type === 'bunch' ? 0.168 : 0.143), depth / 2),
  );
  let pickBoxes = types.map(pickBox);
  let locations = originalCrates(models.length);

  function refresh() {
    normal.set(0, Math.cos(stand.slope), Math.sin(stand.slope)).applyAxisAngle(up, stand.yaw);
    bed.setFromNormalAndCoplanarPoint(normal, center.set(stand.x, stand.y, stand.z));
    locations.forEach((location, index) => {
      const model = models[index];
      setPose(model, location);
      (matrices[index] ??= new THREE.Matrix4()).copy(model.matrixWorld);
      (inverses[index] ??= new THREE.Matrix4()).copy(model.matrixWorld).invert();
    });
  }

  function restorePreview(index) {
    setPose(models[index], locations[index]);
  }

  function highlight(index, destination, moving) {
    outline.visible = index !== undefined;
    if (!outline.visible) return;
    setPose(outline, destination ? destination.locations[index] : locations[index], 0.006);
    outlineMaterial.color.setHex(moving ? 0xd9f6b5 : 0xffd079);
  }

  function preview(index, destination) {
    if (!destination) {
      restorePreview(index);
      return;
    }
    const lift = destination.swapping ? 0.184 : 0.027;
    setPose(models[index], destination.locations[index], lift);
  }

  function solidDistance(ray) {
    caster.ray.copy(ray);
    return caster.intersectObject(proxy, true)[0]?.distance ?? Infinity;
  }

  function pick(ray, excluded, limit = solidDistance(ray)) {
    let best = null;
    for (let index = 0; index < models.length; index++) {
      if (index === excluded) continue;
      localRay.copy(ray).applyMatrix4(inverses[index]);
      if (!localRay.intersectBox(pickBoxes[index], point)) continue;
      const distance = point.applyMatrix4(matrices[index]).distanceTo(ray.origin);
      if (distance >= limit) continue;
      limit = distance;
      best = { item: itemAt(index), distance };
    }
    return best;
  }

  function destination(ray, index, blocked, floorItems) {
    const solid = solidDistance(ray);
    const hit = pick(ray, index, solid);
    if (hit) {
      if (blocked(hit.distance)) return null;
      return { swapping: true, locations: swapCrates(locations, index, hit.item.id) };
    }
    if (ray.intersectPlane(bed, point)) {
      const slot = rackCellAt(stand, slots, point.x, point.z, dimensions);
      const distance = point.distanceTo(ray.origin);
      if (slot >= 0 && distance < solid && !blocked(distance)) {
        return { locations: moveCrate(locations, index, { slot }) };
      }
    }
    if (!ray.intersectPlane(ground, point)) return null;
    const distance = point.distanceTo(ray.origin);
    if (distance >= solid || blocked(distance)) return null;
    const yaw = locations[index].slot !== undefined ? Math.PI : locations[index].yaw ?? Math.PI;
    const next = moveCrate(locations, index, { x: point.x, z: point.z, yaw }, floorItems, bounds, dimensions);
    return next ? { locations: next } : null;
  }

  function commit(next) {
    locations = next;
    refresh();
  }

  function itemAt(index) {
    return index >= 0 ? { kind, id: index, type: types[index] } : null;
  }

  function load(record, definitions = {}) {
    const base = loadCrateRecord(record, baseIds, slots);
    const requests = copyRequests(baseIds, definitions, record);
    const copies = loadCrateCopies(record, requests, slots, base, bounds, dimensions);
    const extra = syncCopyNodes(root, copyNodes, copies, (index) => baseModels[index].clone());
    models = [...baseModels, ...extra];
    types = [...baseTypes, ...copies.map(({ index }) => baseTypes[index])];
    ids = [...baseIds, ...copies.map(({ id }) => id)];
    pickBoxes = types.map(pickBox);
    commit([...base, ...copies.map(({ location }) => location)]);
  }

  function copyDestination(index, obstacles) {
    const origin = rackCratePose(stand, slots, locations[index]);
    return nearbyPose(origin, { w: width, d: depth },
      (pose) => moveCrate(locations, index, pose, obstacles, bounds, dimensions));
  }

  refresh();
  return {
    get ids() { return ids; },
    kind, standId: stand.id, pick, destination, preview, highlight, commit, load, copyDestination,
    itemById: (id) => itemAt(ids.indexOf(id)),
    record: () => crateRecord(locations, ids, slots, baseIds.length),
    setStandPose(pose) {
      Object.assign(stand, pose);
      refresh();
    },
    step(index) { return locations[index].slot === undefined ? 15 : 180; },
    rotate(index, direction, obstacles) {
      const location = locations[index];
      const onFloor = location.slot === undefined;
      const yaw = onFloor ? (location.yaw ?? Math.PI) + direction * Math.PI / 12 :
        Math.cos(location.yaw ?? 0) < 0 ? 0 : Math.PI;
      return moveCrate(locations, index, { ...location, yaw }, obstacles, bounds, dimensions);
    },
    floorCrates: () => locations.filter((location) => location.slot === undefined)
      .map(({ x, z, yaw = Math.PI }) => ({ x, z, yaw, w: width, d: depth })),
    dispose: () => outlineMaterial.dispose(),
  };
}
