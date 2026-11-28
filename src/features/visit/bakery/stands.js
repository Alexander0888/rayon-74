import * as THREE from 'three';
import { makeBlankPartition } from '../carrot/fixtures.js';
import { atlasUV, box, Model, plane } from '../model.js';
import { paintedTexture } from '../texture.js';
import { caseEnds, coldShelves, counterShelfY, shelfBack } from './layout.js';

export function caseMaterials(m, textures) {
  const perforation = (name, slots) => {
    const pattern = paintedTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = slots ? '#757779' : '#4c5356';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = slots ? '#25292b' : '#26282a';
      for (let row = 0; row < 6; row++) {
        for (let x = -2; x < w; x += 8) {
          ctx.fillRect(x + (slots ? 0 : row % 2 * 4), 4 + row * 10, slots ? 2.3 : 1.9, slots ? 7 : 1.7);
        }
      }
    });
    pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping;
    pattern.repeat.set(slots ? 39 : 26, slots ? 1 : 8);
    m.textures['bakery-' + name] = pattern;
    return m.material({ map: pattern, color: 0xe9ebea, roughness: 0.71, metalness: 0.26 });
  };

  textures.oak.wrapS = THREE.RepeatWrapping;
  return {
    wood: m.material({ map: textures.oak, color: 0xfff2dc, roughness: 0.70, bumpMap: textures.oak, bumpScale: 0.0011 }),
    finish: m.material({ map: textures.oak, color: 0xfff3da, roughness: 0.57, bumpMap: textures.oak, bumpScale: 0.0011 }),
    seal: m.paint(0x252729, 0.54, 0.32),
    fascia: m.paint(0x252322, 0.83),
    metal: m.paint(0x959e9f, 0.44, 0.55),
    shelf: m.paint(0x53585d, 0.32, 0.67),
    tray: m.paint(0x343434, 0.83),
    warmRim: m.paint(0xb7a17a, 0.30, 0.58),
    vents: perforation('vents', true),
    perforated: perforation('backwall', false),
    coldLight: m.material({ color: 0xe4f3ff, emissive: 0xc6deff, emissiveIntensity: 0.84, roughness: 0.25 }),
    warmLight: m.material({ color: 0xffe4ba, emissive: 0xffcf85, emissiveIntensity: 0.57, roughness: 0.25 }),
    glass: m.material({ color: 0xb9d4d3, roughness: 0.13, transparent: true, opacity: 0.093, depthWrite: false, forceSinglePass: true,
      side: THREE.DoubleSide, clearcoat: 0.80 }, true),
    edge: m.material({ color: 0x7aa19a, roughness: 0.29, transparent: true, opacity: 0.74, depthWrite: false }),
    sign: m.material({ map: textures.signs, emissive: 0xffffff, emissiveMap: textures.signs,
      emissiveIntensity: 0.31, color: 0xe8dfd2, roughness: 0.84 }),
    proxy: m.material({ side: THREE.DoubleSide }),
  };
}

// Детали по всей длине витрины повторяют срез тумбы у поворота.
function caseBand(stand, back, front, thickness, inset) {
  const [leftBack, rightBack] = caseEnds(stand, back);
  const [leftFront, rightFront] = caseEnds(stand, front);
  const shape = new THREE.Shape().moveTo(leftBack + inset, -back).lineTo(leftFront + inset, -front)
    .lineTo(rightFront - inset, -front).lineTo(rightBack - inset, -back).closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);

  const vertices = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let index = 0; index < vertices.count; index++) {
    const frontFace = Math.abs(normals.getZ(index)) > 0.61;
    const topFace = Math.abs(normals.getY(index)) > 0.8;
    const u = (frontFace || topFace ? vertices.getX(index) : vertices.getZ(index)) / 1.62;
    const v = topFace ? (vertices.getZ(index) - back) / (front - back) : vertices.getY(index) / thickness;
    uv.setXY(index, u, v);
  }
  return geometry;
}

function cornerPane(points) {
  const pane = new THREE.BufferGeometry();
  const positions = points.flat();
  const indices = [];
  for (let index = 1; index < points.length - 1; index++) indices.push(0, index, index + 1);
  pane.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pane.setIndex(indices);
  pane.computeVertexNormals();
  return pane;
}

export function addPastrySign(model, m, index, width, x, z, span) {
  const y = 2.64;
  model.box(m.fascia, [x, y, z - 0.044], [span, 0.36, 0.156]);
  model.put(atlasUV(plane.clone(), index, 1, 2, 0.008, 0.025), m.sign,
    [x, y + 0.004, z + 0.035], [width, width * 0.174, 1]);
  model.box(m.seal, [x, y - 0.174, z - 0.044], [span + 0.018, 0.012, 0.170]);
}

function counterBase(model, proxy, m, stand) {
  function band(material, y, thickness, back, front, inset = 0.001, solid = false) {
    const geometry = caseBand(stand, back, front, thickness, inset);
    model.put(geometry, material, [0, y, 0]);
    if (solid) {
      const collider = new THREE.Mesh(geometry, m.proxy);
      collider.position.y = y;
      proxy.add(collider);
    }
  }

  const half = stand.d / 2;
  band(m.seal, 0.001, 0.064, -half + 0.034, half - 0.018, 0.014, true);
  band(m.wood, 0.065, 0.448, -half, half, 0.001, true);
  band(m.metal, 0.512, 0.056, -half, half, 0.001, true);
  band(m.warmRim, 0.562, 0.008, half - 0.027, half + 0.001);
  band(m.warmLight, 0.568, 0.0035, half - 0.018, half - 0.009);

  const bays = Math.round(stand.w / 0.91);
  for (let i = 1; i < bays; i++) {
    model.box(m.seal, [(i / bays - 0.5) * stand.w, 0.288, half + 0.0005], [0.0024, 0.447, 0.0019]);
  }
  return band;
}

function backing(model, material, width, y, z, height) {
  model.put(plane, material, [0, y, z], [width, height, 1]);
}

export function makePastryCase(m, materials, stand, refrigerated, bakery = false) {
  const model = new Model();
  const proxy = new THREE.Group();
  proxy.visible = false;
  const band = counterBase(model, proxy, materials, stand);
  const { w, d } = stand, rim = d / 2;
  const backLength = caseEnds(stand, -rim);
  const backWidth = backLength[1] - backLength[0];
  const backCenter = (backLength[0] + backLength[1]) / 2;

  if (refrigerated) {
    const rear = model.child([backCenter, 0, 0]);
    rear.box(materials.seal, [0, 1.048, -rim + 0.019], [backWidth - 0.022, 0.977, 0.042]);
    backing(rear, materials.perforated, backWidth - 0.032, 1.040, -rim + 0.042, 0.935);
    const rearProxy = new THREE.Mesh(box, materials.proxy);
    rearProxy.position.set(backCenter, 1.048, -rim + 0.020);
    rearProxy.scale.set(backWidth - 0.022, 0.977, 0.040);
    proxy.add(rearProxy);
    for (const { y, front } of coldShelves) {
      band(materials.shelf, y - 0.038, 0.038, shelfBack, front, 0.014, true);
      band(materials.metal, y - 0.033, 0.021, front - 0.006, front + 0.008, 0.010);
      band(materials.edge, y - 0.014, 0.011, front - 0.001, front + 0.006, 0.011);
      band(materials.coldLight, y - 0.036, 0.007, front - 0.024, front - 0.010, 0.034);
    }
    backing(model, materials.vents, w - 0.032, 0.580, rim + 0.001, 0.021);
    band(materials.finish, 1.483, 0.102, -rim, 0.185, 0.003, true);
    band(materials.coldLight, 1.475, 0.007, 0.128, 0.162, 0.028);
    band(materials.glass, 0.601, 0.136, rim - 0.019, rim - 0.014, 0.008);
    band(materials.edge, 0.735, 0.0045, rim - 0.021, rim - 0.013, 0.008);

    const inscription = paintedTexture(640, 92, (ctx, width, height) => {
      ctx.font = '65px Georgia';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#724c2fb0';
      ctx.fillText('Pâtisseries', width / 2, height / 2 + 2);
    });
    m.textures['bakery-inscription'] = inscription;
    const engraved = m.material({ map: inscription, transparent: true, alphaTest: 0.16, roughness: 0.84 });
    model.put(plane, engraved, [2.04, 1.534, 0.186], [0.84, 0.106, 1]);
    addPastrySign(model, materials, 0, 1.64, 1.69, -0.39, 2.68);
    model.box(materials.fascia, [0.39, 1.47, -rim + 0.040], [0.05, 2.25, 0.048]);
    model.box(materials.fascia, [2.41, 1.52, -rim + 0.114], [0.06, 2.19, 0.055]);

    for (const side of [0, 1]) {
      const point = (y, z) => [caseEnds(stand, z)[side] + (side === 0 ? 0.007 : -0.007), y, z];
      const points = [point(0.601, rim - 0.014), point(0.601, -rim + 0.014), point(1.549, -rim + 0.014),
        point(1.549, 0.174), point(1.112, 0.280), point(1.087, rim - 0.022)];
      model.put(cornerPane(points), materials.glass, [0, 0, 0]);
      for (const index of [1, 2, 3, 4]) model.rod(materials.seal, points[index], points[index + 1], 0.006);
      model.rod(materials.seal, points[5], points[0], 0.007);
    }
    model.put(atlasUV(plane.clone(), 7, 4, 2, 0.027, 0.035), m.material({ map: m.textures['bakery-labels'], roughness: 0.78 }),
      [0.42, 1.333, 0.145], [0.074, 0.048, 1], [-0.21, 0, 0]);
  } else {
    band(bakery ? materials.finish : materials.tray, 0.576, counterShelfY - 0.576, shelfBack, rim - 0.020, 0.008, true);
    band(materials.metal, 0.585, 0.024, rim - 0.061, rim - 0.011);
    band(materials.glass, 0.610, 0.557, rim - 0.012, rim - 0.005, 0.004);
    band(materials.edge, 1.160, 0.008, rim - 0.016, rim - 0.003, 0.004);
    band(materials.glass, 1.165, 0.010, -rim + 0.059, rim - 0.008, 0.006);
    band(materials.edge, 1.163, 0.009, -rim + 0.055, -rim + 0.071, 0.006);
    band(materials.metal, 0.61, 0.18, -rim + 0.006, -rim + 0.052, 0.008, true);
    band(materials.finish, 0.96, 0.040, -rim + 0.018, -rim + 0.312, 0.008);
    band(materials.warmLight, 0.954, 0.007, -rim + 0.248, -rim + 0.290, 0.048);

    for (const side of [0, 1]) {
      const point = (y, z) => [caseEnds(stand, z)[side] + (side === 0 ? 0.005 : -0.005), y, z];
      const points = [point(0.605, rim - 0.007), point(0.605, -rim + 0.058),
        point(1.169, -rim + 0.058), point(1.169, rim - 0.007)];
      model.put(cornerPane(points), materials.glass, [0, 0, 0]);
      model.rod(materials.edge, points[2], points[3], 0.0036);
      model.rod(bakery && side === 1 ? materials.seal : materials.edge, points[3], points[0], 0.0046);
    }
    for (const x of [w * -0.17, w * 0.17]) {
      model.box(materials.edge, [x, 0.889, rim - 0.006], [0.004, 0.549, 0.006]);
    }
  }

  return { model, proxy };
}

export function assembleCase(stand, model, proxy) {
  const group = model.finish(stand.id);
  if (proxy) group.add(proxy);
  group.position.set(stand.x, 0, stand.z);
  group.rotation.y = stand.yaw;
  return group;
}

export function makeBakeryPartition(m, spec) {
  const { id, width, height, x, z, yaw } = spec;
  const node = makeBlankPartition(m, spec, id);
  node.position.set(x, 0, z);
  node.rotation.y = yaw;
  const w = width + 0.12, d = 0.38;
  return { id, node, w, d, height, type: 'bakery-partition', thin: true, panel: true, hitBoxes: [
    { w: width + 0.035, d: 0.037, height, base: 0.169 },
    { w: 0.12, d, height: 0.064, x: -width / 2 },
    { w: 0.12, d, height: 0.064, x: width / 2 },
  ] };
}
