import { Model, plane, rounded } from '../model.js';
import { localSign } from '../departmentLayout.js';

export function makeLocalSign(m, texture) {
  const { x, z, yaw, w, d, width, height } = localSign;
  const support = m.paint(0x292927, 0.45, 0.49);
  const print = m.material({ map: texture, roughness: 0.49, clearcoat: 0.41, clearcoatRoughness: 0.41 }, true);
  const model = new Model();
  model.put(rounded, support, [0, 0.010, 0], [w, 0.018, d]);
  for (const side of [-1, 1]) {
    model.box(support, [side * width / 2, height / 2, 0], [0.013, height - 0.003, 0.014]);
  }
  const posterHeight = 0.551, centerY = height - posterHeight / 2 - 0.014;
  model.box(support, [0, centerY, 0], [width - 0.008, posterHeight + 0.018, 0.012]);
  model.put(plane, print, [0, centerY, 0.0068], [width - 0.013, posterHeight, 1]);
  const node = model.finish('Panneau Local');
  node.position.set(x, 0, z);
  node.rotation.y = yaw;
  return { id: 'local-sign', node, w, d, height, thin: true, hitBoxes: [
    { w: width + 0.012, d: 0.038, base: centerY - posterHeight / 2, height },
    { w, d, height: 0.022 },
  ] };
}
