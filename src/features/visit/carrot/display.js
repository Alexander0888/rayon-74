import * as THREE from 'three';
import { departmentBounds } from '../departmentLayout.js';
import { loadDisplayTextures } from '../texture.js';
import { makeCrateModels } from './crates.js';
import { makePartitions, makeRack, makeReservePartitions } from './fixtures.js';
import { carrotCrateIds, carrotStand, cells, crateTypes, partitions, reservePartitions } from './layout.js';
import { createRackCrateEditor } from './rackCrateEditor.js';
import { panelMarketPose, shiftMarket } from '../salads/marketPosition.js';

const urls = import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' });

function panelFixtures(group, definitions) {
  return definitions.map(({ id, width, height, photo, x, z, yaw }, index) => {
    const node = group.children[index];
    const pose = panelMarketPose(id, { x, z, yaw });
    node.position.set(pose.x, 0, pose.z);
    node.rotation.y = pose.yaw;
    return { id, node, w: width + 0.08, d: 0.40, height, type: photo ?? 'fence', thin: true, panel: true,
      hitBoxes: [{ w: width + 0.042, d: 0.056, base: 0.14, height }] };
  });
}

export async function createCarrotDisplay(m, work, renderer, signal) {
  const textures = await loadDisplayTextures(m, urls, renderer.capabilities.getMaxAnisotropy(), signal, 'carrot-');
  if (!textures || signal.aborted) return null;
  const stand = { ...shiftMarket(carrotStand), id: 'carrot-stand' };
  const { group, proxy } = makeRack(m, textures['stand-oak'], stand);
  const root = new THREE.Group();
  const models = makeCrateModels(m, textures);
  const panels = makePartitions(m, textures, work);
  const reserve = makeReservePartitions(m);
  root.add(group, panels, reserve, ...models);
  const crates = createRackCrateEditor({
    root, stand, slots: cells, types: crateTypes, models, proxy, bounds: departmentBounds,
    ids: carrotCrateIds,
  });
  return {
    root, crates, fixtures: [
      { ...stand, node: group, height: 1.0, proxy, follow: crates.setStandPose },
      ...panelFixtures(panels, partitions.map((item) => ({ ...item, id: 'partition-' + item.photo }))),
      ...panelFixtures(reserve, reservePartitions),
    ],
    dispose: crates.dispose,
  };
}
