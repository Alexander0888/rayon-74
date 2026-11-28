export const columns = 6;
export const rows = 2;
export const cellWidth = 0.40;
export const cellDepth = 0.60;
export const crateSize = { width: 0.388, depth: 0.584, height: 0.131 };
export const carrotStand = {
  name: 'Présentoir de carottes', x: 0.38, z: 3.51, y: 0.68, w: 2.50, d: 1.25, slope: 0.35,
  columns, yaw: Math.PI, dispenser: true,
};
export const crateTypes = [
  'loose', 'bag', 'organic', 'mixed', 'bunch', 'beans',
  'loose', 'bag', 'organic', 'mixed', 'beans', 'beans',
];
export const carrotCrateIds = ['loose-a', 'bag-a', 'organic-a', 'mixed-a', 'bunch', 'beans-a',
  'loose-b', 'bag-b', 'organic-b', 'mixed-b', 'beans-b', 'beans-c'].map((id) => 'carrot-' + id);

export const partitions = [
  { x: -3.18, z: 6.52, width: 2.43, height: 2.54, yaw: Math.PI, photo: 'chilled' },
  { x: -0.84, z: 6.52, width: 2.25, height: 2.54, yaw: Math.PI, photo: 'counters' },
  { x: -4.41, z: 5.40, width: 2.23, height: 2.54, yaw: Math.PI / 2, photo: 'wall' },
];

export const reservePartitions = Array.from({ length: 20 }, (_, index) => ({
  id: `fence-${String(index + 1).padStart(2, '0')}`, x: index < 10 ? -8.92 : -7.59,
  z: -5.8 + (index % 10) * 1.8, width: 1.46, height: 2.36, yaw: Math.PI / 2,
}));

export function partitionFootprint(index, { x, z, yaw = partitions[index].yaw }, panelOnly = false) {
  const { width } = partitions[index];
  // The bases can meet at a joint between two panels.
  return { x, z, yaw, w: panelOnly ? width - 0.04 : width + 0.08, d: panelOnly ? 0.05 : 0.40 };
}

export const partitionFootprints = partitions.map((position, index) => partitionFootprint(index, position));

export function rackCells(count, rowCount = rows, depth = cellDepth) {
  return Array.from({ length: count * rowCount }, (_, index) => ({
    id: `${Math.floor(index / count) + 1}:${index % count + 1}`,
    x: (index % count + 0.5 - count / 2) * cellWidth,
    z: (Math.floor(index / count) + 0.5 - rowCount / 2) * depth,
  }));
}

export const cells = rackCells(columns);

export const walkFromCarrots = { x: carrotStand.x + 0.33, z: 1.46, yaw: Math.PI + 0.15, pitch: -0.37 };

export function rackCratePose(stand, slots, location, lift = 0) {
  if (location.slot === undefined) return { ...location, y: 0.004 + lift, slope: 0, yaw: location.yaw ?? Math.PI };
  const { x, z } = slots[location.slot];
  const sine = Math.sin(stand.slope), cosine = Math.cos(stand.slope);
  const depth = cosine * z + sine * lift;
  const sinYaw = Math.sin(stand.yaw), cosYaw = Math.cos(stand.yaw);
  return {
    x: stand.x + cosYaw * x + sinYaw * depth,
    y: stand.y + cosine * lift - sine * z,
    z: stand.z - sinYaw * x + cosYaw * depth,
    slope: Math.cos(location.yaw ?? 0) < 0 ? -stand.slope : stand.slope,
    yaw: stand.yaw + (location.yaw ?? 0),
  };
}

export function rackCellAt(stand, slots, worldX, worldZ, dimensions = crateSize) {
  const dx = worldX - stand.x, dz = worldZ - stand.z;
  const sine = Math.sin(stand.yaw), cosine = Math.cos(stand.yaw);
  const x = dx * cosine - dz * sine;
  const z = (dx * sine + dz * cosine) / Math.cos(stand.slope);
  return slots.findIndex((cell) =>
    Math.abs(x - cell.x) <= dimensions.width / 2 && Math.abs(z - cell.z) <= dimensions.depth / 2,
  );
}

export const cratePose = (location, lift) => rackCratePose(carrotStand, cells, location, lift);
export const cellAt = (x, z) => rackCellAt(carrotStand, cells, x, z);
