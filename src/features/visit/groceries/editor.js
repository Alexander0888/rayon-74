import * as THREE from 'three';
import { containsFootprint, overlapsFootprint, worldOffset } from '../floorGeometry.js';
import { copyRequests, nearbyPose, syncCopyNodes } from '../sceneCopies.js';
import { loadProducts, moveProduct, originalProducts, productPoses, productRecord } from './arrangement.js';
import { stockMeshes } from './stockMeshes.js';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const one = new THREE.Vector3(1, 1, 1);

export function createProductEditor({ root, initial, proxy, slots, pieces: basePieces, sizesByType, templates, bounds, kind,
  stacking = false, allowFloor = stacking, shelfStep = stacking ? 90 : 45, seatFits,
}) {
  const stand = { ...initial };
  const baseIds = basePieces.map(({ id }) => id);
  const copyNodes = new Map();
  const stock = stockMeshes(root, basePieces, templates);
  let pieces = basePieces, sizes = basePieces.map(({ type }) => sizesByType[type]), ids = baseIds;
  let copies = [];
  const position = new THREE.Vector3(), euler = new THREE.Euler(), quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), standInverse = new THREE.Matrix4();
  const localRay = new THREE.Ray(), point = new THREE.Vector3();
  const caster = new THREE.Raycaster();
  const poses = [], matrices = [], inverses = [];
  const boxFor = ({ width, depth, height, bottom = 0 }) => new THREE.Box3(
    new THREE.Vector3(-width / 2, bottom, -depth / 2),
    new THREE.Vector3(width / 2, height, depth / 2),
  );
  let boxes = sizes.map(boxFor);
  const seatPlanes = slots.map(({ x, y, z, slope }) => new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(0, Math.cos(slope), Math.sin(slope)), new THREE.Vector3(x, y, z),
  ));
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffd079, toneMapped: false });
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterial);
  outline.visible = false;
  root.add(outline);
  let outlinedSize;
  let locations = originalProducts(pieces);
  const previewLift = stacking ? 0.027 : 0.046;

  function objectMatrix(pose, lift, target) {
    position.set(pose.x, pose.y + lift, pose.z);
    quaternion.setFromEuler(euler.set(pose.slope, pose.yaw, 0, 'YXZ'));
    return target.compose(position, quaternion, one);
  }

  function showProduct(index, matrix, preview = false) {
    if (index < basePieces.length) stock.set(index, matrix, preview);
    else {
      const node = copies[index - basePieces.length];
      node.matrix.copy(matrix);
      node.updateMatrixWorld(true);
    }
  }

  function refresh() {
    poses.length = locations.length;
    standInverse.makeRotationY(stand.yaw).setPosition(stand.x, 0, stand.z).invert();
    productPoses(stand, slots, locations, sizes).forEach((pose, index) => {
      poses[index] = pose;
      const transform = objectMatrix(pose, 0, matrices[index] ??= new THREE.Matrix4());
      (inverses[index] ??= new THREE.Matrix4()).copy(transform).invert();
      showProduct(index, transform);
    });
    stock.update(true);
  }

  function commit(next) {
    locations = next;
    refresh();
  }

  function solidDistance(ray) {
    caster.ray.copy(ray);
    return caster.intersectObject(proxy, true)[0]?.distance ?? Infinity;
  }

  function pick(ray, except, limit = Infinity) {
    limit = Math.min(limit, solidDistance(ray));
    let best = null;
    for (let index = 0; index < boxes.length; index++) {
      if (index === except) continue;
      localRay.copy(ray).applyMatrix4(inverses[index]);
      if (!localRay.intersectBox(boxes[index], point)) continue;
      const distance = point.applyMatrix4(matrices[index]).distanceTo(ray.origin);
      if (distance >= limit) continue;
      limit = distance;
      best = { item: itemAt(index), distance };
    }
    return best;
  }

  function seatAt(ray, limit) {
    localRay.copy(ray).applyMatrix4(standInverse);
    let hit;
    slots.forEach((seat, index) => {
      if (!localRay.intersectPlane(seatPlanes[index], point)) return;
      const dx = Math.abs(point.x - seat.x), dz = Math.abs(point.z - seat.z) / Math.cos(seat.slope);
      const within = seat.radius ? Math.hypot(dx, dz) <= seat.radius : dx <= seat.halfWidth && dz <= seat.halfDepth;
      const distance = localRay.origin.distanceTo(point);
      if (!within || distance > limit) return;
      hit = { slot: index, distance };
      limit = distance;
    });
    return hit;
  }

  function footprint(index, pose) {
    return { ...pose, w: sizes[index].width, d: sizes[index].depth };
  }

  function floorFits(index, target, obstacles = [], arrangement = locations) {
    const box = footprint(index, target);
    return containsFootprint(bounds, box) && !obstacles.some((piece) => overlapsFootprint(box, piece)) &&
      arrangement.every((item, other) => index === other || item.slot !== undefined || !overlapsFootprint(box, footprint(other, item)));
  }

  function clearsShelf(box, positions, excluded = -1) {
    return positions.every((other, candidate) => candidate === excluded || other.y !== box.y ||
      !overlapsFootprint(box, footprint(candidate, other)));
  }

  function checkedMove(next, obstacles) {
    if (!seatFits) return { locations: next };
    const nextPoses = productPoses(stand, slots, next, sizes);
    const fits = next.every((location, index) => {
      if (location === locations[index]) return true;
      if (location.slot === undefined) return floorFits(index, location, obstacles, next);
      if (!seatFits(slots[location.slot], sizes[index], location.yaw)) return false;
      const box = footprint(index, nextPoses[index]);
      return clearsShelf(box, nextPoses, index);
    });
    return fits ? { locations: next, poses: nextPoses } : null;
  }

  function destination(ray, index, blocked, obstacles) {
    const solid = solidDistance(ray);
    const hit = pick(ray, index, solid);
    if (hit && locations[hit.item.id].slot === undefined) return null;
    const seat = hit ? { slot: locations[hit.item.id].slot, distance: hit.distance } : seatAt(ray, solid + 0.014);
    if (seat) {
      if (blocked(seat.distance)) return null;
      const from = locations[index];
      const yaw = from.slot === undefined ? (from.yaw - stand.yaw) % (Math.PI * 2) : from.yaw;
      return checkedMove(moveProduct(locations, index, { slot: seat.slot, yaw }, stacking, allowFloor, stand.yaw), obstacles);
    }
    if (!allowFloor || !ray.intersectPlane(ground, point)) return null;
    const distance = point.distanceTo(ray.origin);
    if (distance >= solid || blocked(distance)) return null;
    const target = { x: point.x, z: point.z, yaw: poses[index].yaw };
    return floorFits(index, target, obstacles) ? { locations: moveProduct(locations, index, target, stacking, allowFloor) } : null;
  }

  function previewPose(index, target) {
    if (!target) return poses[index];
    target.poses ??= productPoses(stand, slots, target.locations, sizes);
    return target.poses[index];
  }

  function preview(index, target) {
    showProduct(index, objectMatrix(previewPose(index, target), target ? previewLift : 0, matrix), true);
    stock.update(!target);
  }

  function highlight(index, target, moving) {
    outline.visible = index !== undefined;
    if (!outline.visible) return;
    if (outlinedSize !== sizes[index]) {
      const { width, depth, height } = sizes[index];
      const box = new THREE.BoxGeometry(width + 0.008, height + 0.008, depth + 0.008);
      box.translate(0, height / 2, 0);
      outline.geometry.dispose();
      outline.geometry = new THREE.EdgesGeometry(box);
      box.dispose();
      outlinedSize = sizes[index];
    }
    const pose = previewPose(index, target);
    outline.position.set(pose.x, pose.y + (target ? previewLift : 0.002), pose.z);
    outline.rotation.set(pose.slope, pose.yaw, 0, 'YXZ');
    outlineMaterial.color.setHex(moving ? 0xd9f6b5 : 0xffd079);
  }

  function step(index) {
    if (locations[index].slot === undefined) return 15;
    return shelfStep;
  }

  function itemAt(index) {
    return index >= 0 ? { id: index, type: pieces[index].type, kind } : null;
  }

  function load(record, definitions = {}) {
    const requests = copyRequests(baseIds, definitions, record).map((copy) => ({ ...copy, type: basePieces[copy.index].type }));
    const all = [...basePieces, ...requests];
    const next = loadProducts(record, basePieces, slots, stacking, (index, pose) => {
      const { width, depth } = sizesByType[all[index].type];
      return containsFootprint(bounds, { ...pose, w: width, d: depth });
    }, allowFloor, requests);
    const kept = requests.filter((_, index) => next[basePieces.length + index]);
    copies = syncCopyNodes(root, copyNodes, kept, (index, id) => {
      const node = templates[basePieces[index].type].finish(id);
      node.matrixAutoUpdate = false;
      node.traverse((child) => { if (child.material?.userData.castShadow === false) child.castShadow = false; });
      return node;
    });
    pieces = [...basePieces, ...kept];
    sizes = pieces.map(({ type }) => sizesByType[type]);
    ids = pieces.map(({ id }) => id);
    boxes = sizes.map(boxFor);
    commit(next.filter(Boolean));
  }

  function copyDestination(index, obstacles) {
    const origin = poses[index], location = locations[index];
    if (location.slot !== undefined) {
      const occupied = new Set(locations.map(({ slot }) => slot));
      const vacant = slots.flatMap((seat, slot) => {
        if (occupied.has(slot) || seatFits && !seatFits(seat, sizes[index], location.yaw)) return [];
        const pose = { ...worldOffset(stand, seat.x, seat.z), y: seat.y, yaw: origin.yaw };
        if (seatFits && !clearsShelf(footprint(index, pose), poses)) return [];
        const distance = Math.hypot(origin.x - pose.x, (origin.y - seat.y) * 1.8, origin.z - pose.z);
        return [{ slot: seat.id, distance }];
      }).sort((left, right) => left.distance - right.distance)[0];
      if (vacant) return { slot: stacking ? vacant.slot + ':1' : vacant.slot, yaw: location.yaw };
    }
    if (!allowFloor) return null;
    return nearbyPose(origin, footprint(index, origin), (pose) => floorFits(index, pose, obstacles));
  }

  refresh();
  return {
    get ids() { return ids; },
    kind, standId: stand.id, pick, destination, preview, highlight, commit, step, load, copyDestination,
    itemById: (id) => itemAt(ids.indexOf(id)),
    record: () => productRecord(locations, pieces, slots, stacking),
    setStandPose(pose) { Object.assign(stand, pose); refresh(); },
    rotate(index, direction, obstacles) {
      const location = locations[index];
      const rotated = { ...location, yaw: (location.yaw + direction * step(index) * Math.PI / 180) % (Math.PI * 2) || 0 };
      if (location.slot === undefined && !floorFits(index, rotated, obstacles)) return null;
      const next = locations.map((entry, candidate) => candidate === index ? rotated : entry);
      return checkedMove(next, obstacles)?.locations ?? null;
    },
    floorCrates: () => locations.flatMap((location, index) => location.slot === undefined ? [footprint(index, location)] : []),
    dispose: () => outlineMaterial.dispose(),
  };
}
