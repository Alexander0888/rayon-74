export function localOffset({ x, z, yaw = 0 }, worldX, worldZ) {
  const dx = worldX - x, dz = worldZ - z;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

export function worldOffset({ x, z, yaw = 0 }, localX, localZ) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  return { x: x + localX * cos + localZ * sin, z: z - localX * sin + localZ * cos };
}

export function halfExtents({ w, d }, yaw) {
  const sin = Math.abs(Math.sin(yaw)), cos = Math.abs(Math.cos(yaw));
  return { x: (w * cos + d * sin) / 2, z: (w * sin + d * cos) / 2 };
}

function overlapsAlongAxes(box, other) {
  const local = localOffset(box, other.x, other.z);
  const half = halfExtents(other, (other.yaw ?? 0) - (box.yaw ?? 0));
  return Math.abs(local.x) < box.w / 2 + half.x && Math.abs(local.z) < box.d / 2 + half.z;
}

export function overlapsBox(box, other) {
  return overlapsAlongAxes(box, other) && overlapsAlongAxes(other, box);
}

export function overlapsCircle(box, other) {
  const local = localOffset(box, other.x, other.z);
  return Math.hypot(
    Math.max(Math.abs(local.x) - box.w / 2, 0),
    Math.max(Math.abs(local.z) - box.d / 2, 0),
  ) < other.radius;
}

export function coversFloor(box, x, z, margin) {
  const local = localOffset(box, x, z);
  return Math.abs(local.x) < box.w / 2 + margin && Math.abs(local.z) < box.d / 2 + margin;
}

export function containsFootprint({ left, right, back, front }, box) {
  const half = halfExtents(box, box.yaw ?? 0);
  return box.x - half.x >= left && box.x + half.x <= right &&
    box.z - half.z >= back && box.z + half.z <= front;
}

export function overlapsFootprint(box, other) {
  if (box.radius && other.radius) return Math.hypot(box.x - other.x, box.z - other.z) < box.radius + other.radius;
  if (box.radius) return overlapsCircle(other, box);
  if (other.radius) return overlapsCircle(box, other);
  return overlapsBox(box, other);
}
