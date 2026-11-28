import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { atlasUV, lathe, Model, plane, randomSource, rounded, tau } from '../model.js';
import { paintedTexture } from '../texture.js';
import { bakedOval, blueberryBody, blueberryCrown, bowlGeometry, circularFrosting, cupLid, decorationSphere,
  ingredient, packCover, pastryCrust, powderedTop, raspberryGeometry, seedFruit } from './foodShapes.js';

const cake = { width: 0.266, depth: 0.251, height: 0.119 };
const duo = { width: 0.195, depth: 0.114, height: 0.083 };
const cup = { width: 0.085, depth: 0.085, height: 0.137 };
const petit = { width: 0.076, depth: 0.075, height: 0.069 };

export const pastrySizes = {
  raspberry: cake, mixed: cake, flan: cake, chocolate: cake, crumble: cake,
  'raspberry-pair': duo, 'strawberry-pair': duo, 'vanilla-pair': duo, assorted: duo, eclairs: duo, macaron: duo,
  'flan-slice': { width: 0.152, depth: 0.119, height: 0.073 },
  'chocolate-cup': cup, tiramisu: cup,
  milk: { width: 0.062, depth: 0.062, height: 0.153 },
  brioche: { width: 0.131, depth: 0.108, height: 0.095 },
  sandwich: { width: 0.234, depth: 0.105, height: 0.080 },
  'mini-berry': petit, 'mini-custard': petit, 'mini-chocolate': petit, 'mini-strawberry': petit, 'mini-choux': petit,
};

const ripe = [0xca2039, 0xf04b61, 0xd62b45, 0xbc2239, 0xe64b51, 0xd7283b];
const cartonShape = new RoundedBoxGeometry(1, 1, 1, 1, 0.055);
const blue = [0x1e263c, 0x293446, 0x33415b, 0x222b45, 0x374256];

function frosting(model, material, radius, y, depth, tint = 0xffffff) {
  model.put(circularFrosting, material, [0, y + depth / 2, 0], [radius, depth, radius], undefined, tint);
}

function raspberry(model, m, x, y, z, r, random) {
  model.put(m.raspberry, m.berry, [x, y, z], [r, r * 1.83, r * (0.92 + random() * 0.12)],
    [(random() - 0.5) * 0.47, random() * tau, (random() - 0.5) * 0.40], ripe[Math.floor(random() * ripe.length)]);
}

function berries(model, m, radius, y, count, random, size = 0.008) {
  for (let i = 0; i < count; i++) {
    const distance = radius * Math.sqrt((i + 0.45) / count);
    const angle = 2.399963 * i + (random() - 0.5) * 0.11;
    raspberry(model, m, distance * Math.cos(angle), y + random() * 0.0028, distance * Math.sin(angle),
      size * (0.89 + random() * 0.23), random);
  }
}

function blueberries(model, m, radius, y, count, random) {
  for (let i = 0; i < count; i++) {
    const d = radius * Math.sqrt((i + 0.43) / count), angle = i * 2.399963;
    const x = d * Math.sin(angle), z = d * Math.cos(angle), size = 0.0042 + random() * 0.0022;
    const cy = y + 0.004 + random() * 0.004;
    model.put(blueberryBody, m.blue, [x, cy, z], [size, size * 0.83, size], [0, angle, 0], blue[i % blue.length]);
    model.put(m.crown, m.dark, [x + size * 0.06, cy + size * 0.805, z], [size * 0.40, size * 0.40, 1],
      [-Math.PI / 2, 0, angle]);
  }
}

function strawberries(model, m, radius, y, count, random, size = 1) {
  for (let i = 0; i < count; i++) {
    const a = i * tau / count + (random() - 0.5) * 0.13;
    const r = radius + (random() - 0.5) * 0.006;
    model.put(m.strawberry, m.fruit, [r * Math.sin(a), y + random() * 0.004, r * Math.cos(a)],
      [0.0093 * size, 0.014 * size, (0.025 + random() * 0.004) * size],
      [(random() - 0.5) * 0.40, a, (random() - 0.5) * 0.42, 'YXZ'], i % 3 === 0 ? 0xf3a78f : 0xffffff);
  }
}

function label(model, m, index, x, y, z, w, h, rotation = [-0.18, 0, 0]) {
  model.put(m.labels[index], m.paper, [x, y, z], [w, h, 1], rotation);
}

function packageBase(model, m, { width: w, depth: d, height }, large, labelIndex = 0) {
  const tray = large ? m.kraft : m.paperboard;
  const base = large ? 0.009 : 0.005;
  model.put(cartonShape, tray, [0, base * 0.5, 0], [w, base, d]);
  for (const sign of [-1, 1]) {
    model.box(tray, [sign * (w / 2 - 0.0021), base + 0.002, 0], [0.004, 0.011, d - 0.004]);
    model.box(tray, [0, base + 0.002, sign * (d / 2 - 0.0021)], [w - 0.007, 0.011, 0.004]);
  }
  model.put(m.shell, m.film, [0, base + 0.004, 0], [w - 0.006, height - base - 0.006, d - 0.007]);
  const seal = large ? 0.043 : 0.032;
  if (large) {
    model.put(cartonShape, m.strap, [-w * 0.095, height - 0.004, -d * 0.12],
      [0.077, 0.002, 0.020], [0, 0.09, 0], 0xe6d4ac);
  }
  label(model, m, 6, -w * 0.095, height - 0.0016, -d * 0.13, seal, seal * 0.63, [-Math.PI / 2, 0, 0.05]);
  label(model, m, labelIndex, -w * 0.13, base + (large ? 0.0195 : 0.0131),
    d * 0.497, large ? 0.047 : 0.045, large ? 0.039 : 0.024);
}

function wholeTart(model, m, type, random) {
  packageBase(model, m, cake, true, type === 'mixed' ? 1 : type === 'flan' ? 2 : type === 'chocolate' ? 3 : 0);
  const pastry = model.child([0, 0.009, -0.001]);
  const radius = 0.109;
  if (type === 'chocolate') {
    pastry.put(m.cocoa, m.cocoaCrumb, [0, 0, 0], [radius * 0.95, 0.062, radius * 0.945]);
    frosting(pastry, m.chocolate, radius * 0.91, 0.036, 0.006);
    pastry.put(powderedTop, m.dusted, [0, 0.0634, 0], [radius * 0.90, radius * 0.89, 1], [-Math.PI / 2, 0, 0.3]);
    for (let i = 0; i < 32; i++) {
      const r = radius * 0.90 * Math.sqrt(random()), a = random() * tau;
      const size = 0.0014 + random() * 0.0021;
      pastry.put(decorationSphere, m.dust, [r * Math.cos(a), 0.064 + random() * 0.0018, r * Math.sin(a)],
        [size * 1.4, size * 0.29, size]);
    }
    return;
  }

  const tall = type === 'crumble', flan = type === 'flan';
  const crustHeight = tall ? 0.055 : flan ? 0.034 : 0.024;
  pastry.put(m.crust, m.dough, [0, 0, 0], [radius, crustHeight, radius * 0.984]);
  frosting(pastry, m.custard, radius * 0.94, 0.014, crustHeight - 0.011);
  if (flan) {
    pastry.put(m.flanTop, m.bakedCustard, [0.001, crustHeight + 0.001, 0], [radius * 0.938, radius * 0.924, 1], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 13; i++) {
      const a = i * 2.399963, r = radius * 0.85 * Math.sqrt(random());
      pastry.put(decorationSphere, m.caramel, [r * Math.sin(a), crustHeight + 0.0011, r * Math.cos(a)],
        [0.005 + 0.003 * random(), 0.0005, 0.0035], [0, a, 0], 0xe8b97b);
    }
    return;
  }
  frosting(pastry, m.glaze, radius * 0.92, crustHeight - 0.002, 0.0052);
  if (type === 'mixed') {
    strawberries(pastry, m, radius * 0.809, crustHeight + 0.012, 26, random, 1.19);
    for (let i = 0; i < 32; i++) {
      const angle = i * tau / 32 + random() * 0.07;
      const distance = radius * (0.36 + (i % 2) * 0.20) + random() * 0.006;
      raspberry(pastry, m, distance * Math.cos(angle), crustHeight + 0.004 + random() * 0.003,
        distance * Math.sin(angle), 0.0074 + random() * 0.0019, random);
    }
    blueberries(pastry, m, radius * 0.31, crustHeight + 0.014, 24, random);
  } else {
    berries(pastry, m, radius * 0.86, crustHeight + 0.004, tall ? 65 : 86, random, tall ? 0.0090 : 0.0088);
  }
  if (tall) {
    for (let i = 0; i < 42; i++) {
      const a = i * tau / 42 + random() * 0.067, r = radius * (0.976 + random() * 0.036);
      const size = 0.003 + random() * 0.005;
      pastry.put(decorationSphere, m.flakes, [r * Math.sin(a), 0.017 + random() * 0.023, r * Math.cos(a)],
        [size, size * 0.73, size * 1.12], [0, a, 0], i % 4 ? 0xffdfac : 0xce9866);
    }
  }
}

function tartlet(model, m, flavor, r, random) {
  const isChoux = flavor === 'choux';
  const isChoc = flavor === 'chocolate';
  model.put(m.crust, m.dough, [0, 0.003, 0], [r, isChoux ? 0.021 : 0.012, r]);
  frosting(model, isChoc ? m.chocolate : m.custard, r * 0.92, 0.010, isChoux ? 0.013 : 0.009);
  if (flavor === 'berry' || flavor === 'strawberry') {
    frosting(model, m.glaze, r * 0.88, 0.019, 0.0034);
    if (flavor === 'berry') berries(model, m, r * 0.76, 0.023, 10, random, 0.0045);
    else strawberries(model, m, r * 0.60, 0.029, 6, random, 0.70);
  } else if (isChoc) {
    model.put(decorationSphere, m.chocolate, [0, 0.028, 0], [r * 0.86, 0.016, r * 0.87]);
    model.put(rounded, m.dust, [0.006, 0.045, 0.002], [0.015, 0.002, 0.007], [0.08, 0.3, 0.11]);
  } else if (isChoux) {
    model.put(decorationSphere, m.custard, [0, 0.033, 0], [r * 0.77, 0.017, r * 0.75]);
    model.put(m.pastry, m.bread, [0, 0.047, 0], [r * 0.72, 0.010, r * 1.39], [0, 1.6, -0.12]);
    raspberry(model, m, 0, 0.048, 0.002, 0.0047, random);
  } else {
    model.put(decorationSphere, m.custard, [0, 0.026, 0], [r * 0.74, 0.009, r * 0.74]);
    model.put(decorationSphere, m.dust, [-0.008, 0.032, 0.001], [0.0057, 0.0038, 0.0047]);
  }
}

function smallPack(model, m, type, random) {
  packageBase(model, m, duo, false, type === 'vanilla-pair' ? 2 : 0);
  if (type === 'eclairs') {
    for (const z of [-0.026, 0.025]) {
      model.put(m.pastry, m.bread, [0, 0.028, z], [0.019, 0.017, 0.147], [0, Math.PI / 2, 0]);
      model.put(m.topEclair, z < 0 ? m.chocolate : m.coffee, [0, 0.036, z], [0.014, 0.010, 0.138], [0, Math.PI / 2, 0]);
    }
  } else if (type === 'macaron') {
    const flavors = [0xc28a84, 0xb4a05c, 0xa9ba74, 0x987280, 0xaa754a, 0xdebbc1];
    for (let i = 0; i < 6; i++) {
      const macaron = model.child([(i - 2.5) * 0.027, 0.027, 0], [0, 0, -0.22]);
      for (const x of [-0.006, 0.006]) {
        macaron.put(decorationSphere, m.macaron, [x, 0, 0], [0.007, 0.019, 0.019],
          undefined, flavors[i]);
      }
      macaron.put(decorationSphere, m.dust, [0, 0, 0], [0.0055, 0.0167, 0.0167]);
    }
  } else {
    const a = type === 'raspberry-pair' ? 'berry' : type === 'strawberry-pair' ? 'strawberry' : 'custard';
    const b = type === 'assorted' ? 'berry' : a;
    tartlet(model.child([-0.046, 0.006, 0]), m, a, 0.036, random);
    tartlet(model.child([0.043, 0.006, 0]), m, b, 0.035, random);
  }
}

function frozenCup(model, m, type, random) {
  const dark = type === 'chocolate-cup';
  const radius = cup.width * 0.47;
  model.put(m.bowl, m.film, [0, 0, 0], [radius, 0.092, radius]);
  frosting(model, m.custard, radius * 0.82, 0.003, 0.017);
  frosting(model, m.coffee, radius * 0.86, 0.020, 0.022);
  frosting(model, m.custard, radius * 0.90, 0.042, 0.019);
  frosting(model, m.coffee, radius * 0.92, 0.061, 0.017);
  frosting(model, dark ? m.chocolate : m.custard, radius * 0.94, 0.078, 0.013);
  model.put(m.dome, m.film, [0, 0.091, 0], [radius, 0.043, radius]);
  label(model, m, 2, -0.014, 0.033, radius * 0.91, 0.029, 0.047, [0, -0.17, 0]);
  if (dark) frosting(model, m.chocolate, 0.022, 0.091, 0.003);
  else {
    for (let i = 0; i < 11; i++) {
      const a = random() * tau, r = 0.025 * Math.sqrt(random());
      model.put(decorationSphere, m.chocolate, [r * Math.sin(a), 0.092, r * Math.cos(a)], [0.0025, 0.0018, 0.0024]);
    }
    model.put(rounded, m.chocolate, [0.003, 0.108, 0], [0.012, 0.025, 0.004], [0.06, -0.17, 0.28]);
  }
}

function otherProduct(model, m, type) {
  if (type === 'milk') {
    model.put(m.bottle, m.milk, [0, 0, 0], [0.029, 0.146, 0.029]);
    frosting(model, m.dust, 0.0162, 0.142, 0.011);
    label(model, m, 2, 0, 0.061, 0.027, 0.035, 0.064, [0, 0, 0]);
    return;
  }
  const size = pastrySizes[type];
  packageBase(model, m, size, false, 2);
  if (type === 'flan-slice') {
    model.put(m.slice, m.bread, [0.001, 0.008, 0.005], [0.113, 0.031, 0.090], [0, -0.17, 0]);
    model.put(m.slice, m.custard, [0.001, 0.024, 0.004], [0.106, 0.018, 0.083], [0, -0.17, 0]);
  } else {
    const brioche = type === 'brioche';
    const yaw = Math.PI / 2;
    const w = brioche ? 0.042 : 0.033, d = brioche ? 0.109 : 0.208;
    model.put(m.pastry, m.bread, [0, 0.025, 0], [w, brioche ? 0.028 : 0.018, d], [0, yaw, 0]);
    if (!brioche) {
      model.put(m.pastry, m.leaf, [0, 0.029, 0.011], [w * 0.96, 0.004, d * 0.96], [0, yaw, 0]);
      model.put(m.pastry, m.bread, [0, 0.048, 0], [w * 0.96, 0.017, d * 0.97], [0, yaw, -0.02]);
    }
  }
}

export function pastryMaterials(m, textures) {
  const photograph = (roughness, color = 0xffffff) => m.material({
    map: textures.ingredients, bumpMap: textures.ingredients, bumpScale: 0.00082, roughness, color,
  });
  const berry = m.material({ map: textures.ingredients, color: 0xf3978f, clearcoat: 0.61, clearcoatRoughness: 0.23, roughness: 0.49 }, true);
  berry.userData.castShadow = false;
  const cocoa = ingredient(lathe([[0, 0], [0.91, 0], [0.991, 0.16], [1, 0.38],
    [0.98, 0.49], [1.01, 0.58], [0.99, 0.90], [0.94, 1], [0, 1]], 40), 1);
  const slice = new THREE.Shape().moveTo(0, 0.5).lineTo(-0.5, -0.35).quadraticCurveTo(0, -0.58, 0.5, -0.35).closePath();
  const wedge = new THREE.ExtrudeGeometry(slice, { bevelEnabled: false, depth: 1, curveSegments: 10 });
  wedge.rotateX(-Math.PI / 2);
  const vertices = wedge.attributes.position, uv = wedge.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, vertices.getX(i) + 0.5, vertices.getZ(i) + 0.5);
  const contact = paintedTexture(64, 64, (ctx) => {
    const shade = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
    shade.addColorStop(0, '#19120e8c');
    shade.addColorStop(0.53, '#19120e52');
    shade.addColorStop(1, '#19120e00');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 64, 64);
  });
  m.textures['bakery-contact'] = contact;
  return {
    shell: packCover(), crust: pastryCrust(), raspberry: raspberryGeometry(), strawberry: seedFruit(), crown: blueberryCrown(),
    dome: cupLid(), bowl: bowlGeometry(), cocoa, slice: ingredient(wedge, 3),
    bottle: lathe([[0, 0], [0.91, 0], [1, 0.045], [0.98, 0.58], [0.86, 0.72],
      [0.66, 0.82], [0.55, 0.91], [0.55, 1]], 23),
    pastry: bakedOval(), topEclair: bakedOval(1), flanTop: ingredient(new THREE.CircleGeometry(1, 42), 3),
    labels: Array.from({ length: 8 }, (_, index) => atlasUV(plane.clone(), index, 4, 2, 0.027, 0.035)),
    paper: m.material({ map: textures.labels, color: 0xf6efe0, roughness: 0.78 }),
    kraft: m.paint(0xb28758, 0.79), paperboard: m.paint(0xe1cba5, 0.76), strap: m.paint(0xd9c6a8, 0.73),
    contact: m.material({ map: contact, transparent: true, depthWrite: false, roughness: 0.88 }),
    film: m.material({ color: 0xf1f5ef, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
      roughness: 0.19, clearcoat: 0.73, clearcoatRoughness: 0.19 }, true),
    dough: photograph(0.72, 0xc49b6d), bread: photograph(0.70), cocoaCrumb: photograph(0.76, 0x61453e), dusted: photograph(0.82, 0xbba286),
    bakedCustard: photograph(0.63, 0xcf9557), fruit: m.material({ map: textures.ingredients, clearcoat: 0.58, roughness: 0.39 }, true),
    berry, dark: m.paint(0x39342b, 0.71), blue: m.paint(0xffffff, 0.4),
    milk: m.paint(0xeee9d9, 0.49), custard: m.paint(0xf0dcb0, 0.54), dust: m.paint(0xf1e7d8, 0.82),
    coffee: m.paint(0xa17753, 0.55), chocolate: m.paint(0x542f23, 0.41), caramel: m.paint(0xc59358, 0.62),
    glaze: m.material({ color: 0x7f1324, roughness: 0.39, clearcoat: 0.66 }, true),
    flakes: m.paint(0xcbb389, 0.74), leaf: m.paint(0x748252, 0.79), macaron: m.paint(0xffffff, 0.68),
  };
}

export function makePastryTemplates(m, productTypes) {
  return Object.fromEntries([...new Set(productTypes)].map((type, i) => {
    const model = new Model(), random = randomSource(62321 + i * 135);
    const { width, depth } = pastrySizes[type];
    model.put(plane, m.contact, [0.002, 0.001, 0.005], [width * 1.35, depth * 1.44, 1], [-Math.PI / 2, 0, 0]);
    if (type.startsWith('mini-')) {
      frosting(model, m.kraft, 0.037, 0, 0.003);
      tartlet(model, m, type.slice(5), 0.031, random);
    } else if (pastrySizes[type] === cake) wholeTart(model, m, type, random);
    else if (pastrySizes[type] === duo) smallPack(model, m, type, random);
    else if (pastrySizes[type] === cup) frozenCup(model, m, type, random);
    else otherProduct(model, m, type);
    return [type, model];
  }));
}
