import * as THREE from 'three';
import { containsFootprint, coversFloor, overlapsFootprint } from './floorGeometry.js';
import { nearbyPose, releaseCopyNode } from './sceneCopies.js';

const up = new THREE.Vector3(0, 1, 0);
const floor = new THREE.Plane(up, 0);

export function createFixtureEditor(root, specs, bounds, saved, copies = {}) {
  const locations = new Map();
  const entries = new Map();
  const point = new THREE.Vector3(), localRay = new THREE.Ray(), caster = new THREE.Raycaster();
  const padded = new THREE.Box3();
  const outlineBox = new THREE.BoxGeometry(1, 1, 1);
  outlineBox.translate(0, 0.5, 0);
  const material = new THREE.LineBasicMaterial({ color: 0xffd079, toneMapped: false });
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox), material);
  outlineBox.dispose();
  outline.visible = false;
  root.add(outline);

  function setPose(spec, { x, z, yaw }) {
    spec.node.position.set(x, 0, z);
    spec.node.rotation.y = yaw;
    spec.node.updateWorldMatrix(true, true);
    spec.inverse.copy(spec.node.matrixWorld).invert();
    spec.follow?.({ x, z, yaw });
  }

  function register(spec) {
    const { id, node, w, d, height } = spec;
    const initial = { x: node.position.x, z: node.position.z, yaw: node.rotation.y };
    entries.set(id, {
      ...spec, initial, inverse: new THREE.Matrix4(),
      boxes: (spec.hitBoxes ?? [{ w, d, height }]).map(({ x = 0, z = 0, base = 0, w, d, height }) =>
        new THREE.Box3(new THREE.Vector3(x - w / 2, base, z - d / 2), new THREE.Vector3(x + w / 2, height, z + d / 2))),
    });
  }

  specs.forEach(register);

  function copySpec(id, source) {
    const original = entries.get(source);
    const { node: template, proxy: originalProxy, follow, ...spec } = original;
    const node = template.clone();
    node.name = id;
    const proxy = originalProxy ? node.children[template.children.indexOf(originalProxy)] : undefined;
    root.add(node);
    register({ ...spec, id, node, proxy, source, type: original.type ?? source, hudHost: false });
  }

  function apply(overrides, copies = {}) {
    for (const [id, spec] of entries) {
      if (!spec.source || copies[id] === spec.source && Object.hasOwn(overrides, id)) continue;
      releaseCopyNode(spec.node);
      entries.delete(id);
      locations.delete(id);
    }
    for (const [id, source] of Object.entries(copies)) {
      if (entries.has(id) || !entries.has(source) || !Object.hasOwn(overrides, id)) continue;
      copySpec(id, source);
    }
    for (const [id, spec] of entries) {
      const location = Object.hasOwn(overrides, id) ? overrides[id] : spec.initial;
      locations.set(id, location);
      setPose(spec, location);
    }
  }

  function footprint(spec, pose) {
    return { id: spec.id, ...pose, w: spec.w, d: spec.d, radius: spec.radius };
  }

  function footprints(excluded) {
    return [...entries.values()].filter((spec) => !spec.floorCover && spec.id !== excluded)
      .map((spec) => footprint(spec, locations.get(spec.id)));
  }

  function pick(ray, { except, limit = Infinity, padding = 0, blockersOnly = false, hud = false } = {}) {
    let best = null;
    for (const [id, spec] of entries) {
      if (id === except || blockersOnly && spec.floorCover || hud && spec.hudHost) continue;
      localRay.copy(ray).applyMatrix4(spec.inverse);
      let distance = Infinity;
      for (const box of spec.boxes) {
        const hitBox = padding && spec.thin ? padded.copy(box) : box;
        if (hitBox === padded) {
          hitBox.min.z -= padding;
          hitBox.max.z += padding;
        }
        if (localRay.intersectBox(hitBox, point)) distance = Math.min(distance, point.distanceTo(localRay.origin));
      }
      if (distance >= limit) continue;
      if (spec.proxy) {
        caster.ray.copy(ray);
        distance = caster.intersectObject(spec.proxy, true)[0]?.distance ?? Infinity;
        if (distance >= limit) continue;
      }
      limit = distance;
      best = { item: itemById(id), distance };
    }
    return best;
  }

  function itemById(id) {
    const spec = entries.get(id);
    return spec ? { id, kind: 'fixture', type: spec.type ?? id, source: spec.source } : null;
  }

  function valid(spec, target, obstacles, excludeSource = true) {
    const box = footprint(spec, target);
    if (!containsFootprint(bounds, box)) return false;
    if (spec.floorCover) return true;
    return !footprints(excludeSource ? spec.id : undefined).concat(obstacles).some((other) => {
      if (spec.panel && entries.get(other.id)?.panel) {
        return overlapsFootprint({ ...box, w: box.w - .08, d: .055 }, { ...other, w: other.w - .08, d: .055 });
      }
      return overlapsFootprint(box, other);
    });
  }

  apply(saved, copies);
  return {
    entries, location: (id) => locations.get(id), apply, pick, footprints, itemById,
    copyDestination(id, obstacles) {
      const spec = entries.get(id);
      return nearbyPose(locations.get(id), spec, (pose) => valid(spec, pose, obstacles, false));
    },
    pathOpen(x, z) {
      return [...entries.values()].every((spec) => {
        if (spec.floorCover) return true;
        const pose = locations.get(spec.id);
        return spec.radius ? Math.hypot(x - pose.x, z - pose.z) >= spec.radius + 0.135 :
          !coversFloor(footprint(spec, pose), x, z, 0.135);
      });
    },
    grab(id, ray, distance) {
      ray.at(distance, point);
      const pose = locations.get(id);
      return { plane: new THREE.Plane(up, -point.y), dx: pose.x - point.x, dz: pose.z - point.z };
    },
    destination(ray, id, blocked, obstacles, grip) {
      if (!ray.intersectPlane(grip?.plane ?? floor, point)) return null;
      if (!grip && blocked(point.distanceTo(ray.origin))) return null;
      const target = { x: point.x + (grip?.dx ?? 0), z: point.z + (grip?.dz ?? 0), yaw: locations.get(id).yaw };
      return valid(entries.get(id), target, obstacles) ? target : null;
    },
    rotate(id, angle, obstacles) {
      const pose = locations.get(id);
      const target = { ...pose, yaw: (pose.yaw + angle) % (Math.PI * 2) };
      const spec = entries.get(id);
      return spec.radius || valid(spec, target, obstacles) ? target : null;
    },
    preview(id, target) {
      setPose(entries.get(id), target ?? locations.get(id));
    },
    commit(id, target) {
      locations.set(id, target);
      setPose(entries.get(id), target);
    },
    highlight(id, target, moving) {
      outline.visible = id !== undefined;
      if (!outline.visible) return;
      const { w, d, height } = entries.get(id);
      const { x, z, yaw } = target ?? locations.get(id);
      outline.position.set(x, 0.004, z);
      outline.rotation.y = yaw;
      outline.scale.set(w + 0.015, height + 0.02, d + 0.015);
      material.color.setHex(moving ? 0xd9f6b5 : 0xffd079);
    },
    dispose() { material.dispose(); },
  };
}
