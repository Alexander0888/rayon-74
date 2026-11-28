import * as THREE from 'three';
import { departmentBounds } from '../departmentLayout.js';
import { makeColumn, makeScale } from '../surroundings.js';
import { loadDisplayTextures } from '../texture.js';
import { createProductEditor } from './editor.js';
import { herbColumn, herbPieces, herbScale, herbSlots, herbStand, olivePieces, oliveSlots, oliveStand } from './layout.js';
import { makeHerbStand, makeOliveStand } from './fixtures.js';
import { herbSizes, makeHerbTemplates } from './herbs.js';
import { oliveSizes, makeOliveTemplates } from './olives.js';

const urls = import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' });

export async function createGroceriesDisplay(m, cartMaterials, renderer, signal) {
  const textures = await loadDisplayTextures(m, urls, renderer.capabilities.getMaxAnisotropy(), signal, 'groceries-');
  if (!textures) return null;
  const root = new THREE.Group();
  root.name = 'Olives et herbes fraîches';
  const wood = m.textures['carrot-stand-oak'];
  const olives = makeOliveStand(m, wood, textures['olive-notice']);
  const herbs = makeHerbStand(m, wood, textures);

  function register({ stand, rack, templates, pieces, slots, sizesByType, kind, stacking, height }) {
    const stock = new THREE.Group();
    stock.name = kind;
    root.add(rack.group, stock);
    const editor = createProductEditor({
      root: stock, initial: stand, proxy: rack.proxy, slots, pieces, sizesByType, templates, bounds: departmentBounds,
      kind, stacking,
    });
    const fixture = { ...stand, height, node: rack.group, proxy: rack.proxy, follow: editor.setStandPose };
    return { editor, fixture };
  }

  const displays = [
    register({ stand: oliveStand, rack: olives, slots: oliveSlots, pieces: olivePieces, sizesByType: oliveSizes,
      templates: makeOliveTemplates(m, textures['olive-lids']), kind: 'olive-pack', stacking: true, height: 1.42 }),
    register({ stand: herbStand, rack: herbs, slots: herbSlots, pieces: herbPieces, sizesByType: herbSizes,
      templates: makeHerbTemplates(m), kind: 'herb-bunch', height: 1.39 }),
  ];

  const pillar = makeColumn(cartMaterials, herbColumn).finish(herbColumn.id);
  const scale = makeScale(cartMaterials).finish(herbScale.id);
  pillar.position.set(herbColumn.x, 0, herbColumn.z);
  scale.position.set(herbScale.x, 0, herbScale.z);
  scale.rotation.y = herbScale.yaw;
  root.add(pillar, scale);
  const { radius } = herbColumn;
  return {
    root, editors: displays.map(({ editor }) => editor),
    fixtures: [...displays.map(({ fixture }) => fixture),
      { ...herbColumn, w: 2 * radius, d: 2 * radius, node: pillar },
      { ...herbScale, height: herbScale.y, node: scale },
    ],
    dispose() { displays.forEach(({ editor }) => editor.dispose()); },
  };
}
