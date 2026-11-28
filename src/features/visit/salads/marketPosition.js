export const marketShiftZ = -2.5;
export const marketRevision = 1;

// Центры напольных опор на отмечённом пользователем плане до сдвига.
export const markedPanels = {
  'partition-counters': { x: 4.15, z: 3.76, yaw: -Math.PI / 2 },
  'partition-chilled': { x: 4.07, z: 6.14, yaw: -Math.PI / 2 },
  'partition-wall': { x: 8.68, z: 0.77, yaw: Math.PI / 2 },
  'fence-15': { x: 5.13, z: 2.56, yaw: Math.PI },
  'fence-16': { x: 6.94, z: 2.53, yaw: Math.PI },
};

export const shiftMarket = (pose) => ({ ...pose, z: pose.z + marketShiftZ });

export function panelMarketPose(id, defaults) {
  return Object.hasOwn(markedPanels, id) ? shiftMarket(markedPanels[id]) : defaults;
}

function inChristmasArea({ x, z }) {
  return x >= -4.37 && x <= 3.82 && z >= -3.1 && z <= 2.32;
}

function inMarkedFenceArea({ x, z }) {
  return x >= 3.38 && x <= 9.65 && z >= -1.88 &&
    (z <= 3.53 || x <= 5.22 && z <= 6.96);
}

export function updateMarketPositions(layout) {
  if (layout.sceneRevision >= marketRevision) return layout;
  const fixtures = Object.fromEntries(Object.entries(layout.fixtures).map(([id, pose]) => {
    const shift = id.startsWith('noel-') && inChristmasArea(pose) ||
      id === 'carrot-stand' && pose.x >= -2.0 && pose.x <= 2.40 && pose.z >= 2.18 && pose.z <= 4.85 ||
      (id.startsWith('fence-') || id.startsWith('partition-')) && inMarkedFenceArea(pose);
    return [id, shift ? shiftMarket(pose) : pose];
  }));
  return {
    ...layout, sceneRevision: marketRevision, fixtures,
    christmas: layout.christmas?.map((item) => inChristmasArea(item) ? shiftMarket(item) : item),
  };
}
