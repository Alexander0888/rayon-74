import * as THREE from 'three';
import { types } from './layout.js';
import { box, cylinder, lathe, line, mergeParts, panel, ring, surface } from './geometry.js';

const tau = Math.PI * 2;
const wave = Math.sin;

function bow(material, width, lift, length) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const loop = surface(7, 18, (u, v) => {
      const shape = Math.sin(Math.PI * u);
      return [
        side * width * (0.035 + 0.47 * shape),
        lift * (0.11 + 0.73 * shape * Math.sin(tau * u)) + lift * 0.21 * shape * wave(v * Math.PI),
        (v - 0.5) * length * (0.14 + 0.62 * shape) - length * 0.12 * shape,
      ];
    });
    const tail = surface(3, 12, (u, v) => [
      side * width * (0.05 + 0.51 * u) + (v - 0.5) * width * (0.115 + u * 0.065),
      lift * (0.13 * wave(tau * u) - u * 0.17 + 0.11),
      length * (0.08 + 0.76 * u + (v - 0.5) * (u * 0.26 + 0.11)),
    ]);
    group.add(new THREE.Mesh(loop, material), new THREE.Mesh(tail, material));
  }
  group.add(box(width * 0.16, lift * 0.43, length * 0.19, lift * 0.064, material, 0, lift * 0.16));
  return group;
}

function attachTag(group, m, name, w, h, x, y, z, angle) {
  group.add(panel(w, h, m.photo(name), x, y, z, -1.06, 0, angle));
  group.add(panel(w, h, m.paint(0xe8dece), x, y - 0.0007, z, 2.082, 0, -angle));
}

function wrapped(type, spec, m) {
  const [w, h, d] = spec.size, group = new THREE.Group();
  const paper = m.paper(type, spec), satin = m.ribbon(spec.ribbon);
  const gift = spec.gift, tall = spec.tall, bodyHeight = h * (gift ? 0.93 : tall ? 0.935 : 0.924);
  const exponent = gift ? 0.20 : tall ? 0.40 : 0.57;
  const points = gift
    ? [[0, 0.94], [.034, .985], [.16, 1], [.39, 1], [.65, 1], [.9, 1], [.983, .987], [1, .941], [1, 0]]
    : tall
      ? [[0, 0.9], [.041, .968], [.23, .985], [.57, .885], [.82, .765], [.96, .683], [1, .582], [1, 0]]
      : [[0, .73], [.035, .865], [.13, .945], [.33, 1], [.57, 1], [.75, .964], [.89, .85], [.978, .645], [1, .41], [1, 0]];
  function point(u, row, offset = 0) {
    const [y, radius] = points[row], phi = tau * u;
    const pleats = gift ? 0.013 : tall ? 0.025 : 0.052;
    const crease = radius * (1 + pleats * (0.60 * wave(phi * 11 + y * 3) + 0.37 * wave(phi * 19 - y * 6)
      + 0.36 * wave(y * 15 + phi * 8)));
    const s = Math.sin(phi), c = Math.cos(phi);
    return [
      (w * 0.5 * crease + offset) * Math.sign(s) * Math.pow(Math.abs(s), exponent),
      y * bodyHeight + (row > 0 && row < points.length - 2 ? (gift ? 0.001 : 0.003) * wave(phi * 5 + y * 8) : 0),
      (d * 0.5 * crease + offset) * Math.sign(c) * Math.pow(Math.abs(c), exponent),
    ];
  }
  const shell = surface(points.length - 1, gift ? 80 : 52, (u, v) => point(u, Math.round(v * (points.length - 1))));
  group.add(new THREE.Mesh(shell, paper));
  const bandWidth = w * (gift ? 0.115 : .15);
  function belt(reversed) {
    const span = reversed ? d : w;
    const rows = 2 * (points.length - 1);
    return new THREE.Mesh(surface(rows, 8, (u, v) => {
      const step = Math.round(v * rows);
      const half = rows / 2;
      const row = step <= half ? step : rows - step;
      const [,radius] = points[row];
      const across = (u - 0.5) * bandWidth + .003 * wave(v * 10);
      if (row === half) return reversed ? [0, bodyHeight+.003, across] : [across, bodyHeight+.003, 0];
      const axis = (reversed ? .25 : 0) + (step > half ? .5 : 0);
      const ratio = THREE.MathUtils.clamp(across / (span * radius * .5), -.88, .88);
      const twist = Math.asin(Math.sign(ratio) * Math.pow(Math.abs(ratio), 1 / exponent));
      const offset = .0017 + .0017 * (1 - (2 * u - 1) ** 2);
      const p = point(axis + twist / tau, row, offset);
      p[1] += row === half - 1 ? .0018 : .0006;
      return p;
    }), satin);
  }
  group.add(belt(false));
  if (gift) group.add(belt(true));
  const knot = bow(satin, w * (gift ? 0.62 : 0.70), h * 0.15, d * 0.56);
  knot.position.set(0.003, bodyHeight * 1.01, 0.007);
  knot.rotation.y = 0.27;
  group.add(knot);

  if (gift) {
    const fold = m.material({ color: 0xac3528, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const vertices = new Float32Array([
        w * side * .486, bodyHeight * .06, d * .492,
        w * side * .233, bodyHeight * .62, d * .517,
        w * side * .478, bodyHeight * .963, d * .491,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, fold));
    }
  }
  attachTag(group, m, spec.tag || 'tag-gift', w * 0.31, d * 0.45, w * 0.16, bodyHeight * 0.95, d * 0.32, -0.41);
  return group;
}

function printBox(group, spec, m, height) {
  const [w, , d] = spec.size;
  const stock = m.paint(spec.ink, 0.58, 0.04);
  group.add(box(w, height, d, 0.0035, stock, 0, height * 0.5));
  const front = m.photo(spec.front, 0.52, 0.07);
  group.add(panel(w - 0.006, height - 0.008, front, 0, height * 0.5, d * 0.5 + 0.0004));
  group.add(panel(w - 0.006, height - 0.008, front, 0, height * 0.5, -d * 0.5 - 0.0004, 0, Math.PI));
  if (spec.side) {
    const side = m.photo(spec.side, 0.53, 0.05);
    group.add(panel(d - 0.006, height - 0.008, side, w * 0.5 + 0.0004, height * 0.5, 0, 0, Math.PI / 2));
    group.add(panel(d - 0.006, height - 0.008, side, -w * 0.5 - 0.0004, height * 0.5, 0, 0, -Math.PI / 2));
  }
  if (spec.lid) group.add(panel(w - 0.007, d - 0.007, m.photo(spec.lid, 0.51, 0.08), 0, height + 0.0004, 0, -Math.PI / 2));
  return stock;
}

function loopHandle(width, height, thickness, m) {
  const loop = surface(9, 2, (u, v) => {
    const angle = Math.PI * v;
    const r = 1 - u * 0.52;
    return [Math.cos(angle) * width * 0.5 * r, Math.sin(angle) * height * r, thickness * (u - 0.5)];
  });
  const board = m.material({ color: 0xdacdb4, roughness: 0.7, side: THREE.DoubleSide });
  return new THREE.Mesh(loop, board);
}

function carton(type, spec, m) {
  const group = new THREE.Group(), [w,h,d] = spec.size;
  if (spec.gable) {
    const rise = h * 0.17, topD = d * 0.48;
    const front = m.photo(spec.front, 0.46, type === 'miniGold' ? 0.30 : 0.05);
    const side = spec.side ? m.photo(spec.side) : m.paint(spec.ink, 0.39, 0.26);
    const top = m.paint(spec.ink, 0.49, 0.06);
    const dAt = (v) => 0.5 * (v * h > h - rise ? THREE.MathUtils.lerp(d, topD, (v * h - h + rise) / rise) : d);
    for (const sign of [-1, 1]) {
      group.add(new THREE.Mesh(surface(12, 1, (u, v) => [sign * (u - 0.5) * w, v * h, sign * dAt(v)]), front));
      group.add(new THREE.Mesh(surface(12, 1, (u, v) => [sign * w / 2, v * h, -sign * (2 * u - 1) * dAt(v)]), side));
    }
    group.add(box(w, 0.005, topD, 0.0012, top, 0, h - 0.002, 0));
    if (type === 'miniGold') {
      const handle = loopHandle(w * 0.31, h * 0.12, 0.004, m);
      handle.position.y = h - 0.003;
      group.add(handle);
    }
  } else if (type === 'giftBag') {
    const body = h * 0.72;
    printBox(group, spec, m, body);
    const rope = m.paint(0xc5a264, 0.58, 0.35);
    for (const z of [-d * 0.45, d * 0.45]) {
      group.add(line([[-w*.28, body*.91, z],[-w*.23, h*.93, z*1.35],[0,h,z*1.5],[w*.23,h*.93,z*1.35],[w*.28,body*.91,z]], .0026, rope, 15));
    }
  } else {
    const handle = type === 'windowBox';
    printBox(group, spec, m, handle ? h - 0.023 : h);
    if (handle) {
      const grip = loopHandle(w * 0.43, 0.025, 0.004, m);
      grip.position.y = h - 0.024;
      group.add(grip);
      const fold = m.paint(0x8f8068, 0.88);
      group.add(line([[-w*.44,h-.023,-d*.43],[0,h-.022,0],[w*.44,h-.023,d*.43]], .00085, fold, 4));
    }
  }
  return group;
}

function tin(type, spec, m) {
  const [w,h,d] = spec.size, group = new THREE.Group(), lip = h * 0.058;
  const metal = m.paint(spec.ink, 0.36, 0.46);
  const edge = m.paint(type === 'roundVergani' ? 0x9c362b : 0xc5a264, 0.23, type === 'roundVergani' ? 0.04 : 0.68);
  if (spec.square) {
    const b = 0.007;
    group.add(box(w, h - lip, d, b, metal, 0, (h - lip) * 0.5));
    group.add(box(w + .007, lip, d + .007, 0.004, edge, 0, h - lip * .57));
    group.add(panel(w - .008, d - .008, m.photo(spec.lid, .39, .25), 0, h, 0, -Math.PI / 2));
    for (const sign of [-1, 1]) {
      group.add(panel(w - .013, h - .023, m.photo(spec.front, .4, .26), 0, (h - lip)*.5, sign*(d*.5+.0005), 0, sign>0?0:Math.PI));
      group.add(panel(d - .013, h - .023, m.photo(spec.side || spec.front, .41, .23), sign*(w*.5+.0005), (h - lip)*.5, 0, 0, sign*Math.PI/2));
    }
    return group;
  }
  const r = w * .5, sides = spec.sides || 48;
  const printedWall = new THREE.CylinderGeometry(r, r*.993, h - .012, sides, 1, true);
  const uv = printedWall.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (spec.sides ? 4 : 2) + .5);
  const wall = new THREE.Mesh(printedWall, m.photo(spec.front, spec.cord ? .54 : .43, spec.cord ? .05 : .28));
  wall.position.y = (h - .010) * .5;
  group.add(wall, cylinder(r + .0016, .0038, edge, 0, .002, 0, sides),
    cylinder(r + .0026, lip, edge, 0, h - lip * .51, 0, sides));
  if (spec.lid) {
    const image = new THREE.Mesh(new THREE.CircleGeometry(r - .0015, sides), m.photo(spec.lid, .35, .19));
    image.rotation.x = -Math.PI / 2;
    image.position.y = h + .0005;
    group.add(image);
  } else if (spec.blankLid) {
    for (const factor of [.56, .71, .93]) group.add(ring(r * factor, h, .00095, edge, 24));
  } else {
    const cord = m.paint(0xac9974, .93);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI / 3;
      const points = [-1.01,-.94,-.52,0,.53,.94,1.01].map((k, j) => [
        k * r * Math.cos(angle), h + (j === 0 || j === 6 ? -.014 : .0014), k * r * Math.sin(angle),
      ]);
      group.add(line(points, .0014, cord, 12));
    }
  }
  return group;
}

function bottle(type, m) {
  const group = new THREE.Group(), spec = types[type];
  const r = 0.044, h = spec.size[1];
  const darkGreen = m.material({ color: 0x17261d, roughness: 0.20, metalness: 0.28, clearcoat: 1, clearcoatRoughness: .18 }, true);
  const foil = m.material({
    color: spec.ink, metalness: 0.67, roughness: 0.34, bumpMap: m.textures.paper, bumpScale: .0016,
    clearcoat: 0.27,
  }, true);
  const shape = [
    [.013,0],[.034,0],[.04,.002],[r,.01],[r*1.009,.038],[r,.103],
    [r*.981,.143],[r*.91,.179],[.033,.198],[.025,.211],[.019,.228],[.016,.247],[.015,.298],[.016,.305],
  ];
  group.add(lathe(shape, darkGreen));
  group.add(lathe([[.022,.219],[.019,.226],[.016,.245],[.015,.29],[.017,.301],[.0168,h-.002],[.014,h],[.001,h]],foil));
  group.add(ring(.0165,.299,.0013,foil,28), ring(.0171,h-.012,.001,foil,28));
  const label = m.bottleLabel(type);
  const panelGeometry = surface(5, 16, (u, v) => {
    const phi = (u - .5) * (type === 'bottleBow' ? 1.86 : 2.4);
    return [r*1.011*Math.sin(phi), .041 + v*.069, r*1.011*Math.cos(phi)];
  });
  group.add(new THREE.Mesh(panelGeometry,label));
  if (type === 'bottleBow') {
    const velvet = bow(m.ribbon(0xa22019, true), .161, .041, .114);
    velvet.rotation.x = Math.PI / 2;
    velvet.position.set(0,.189,.035);
    group.add(velvet);
  }
  return group;
}

function stemware(type, m) {
  const group = new THREE.Group(), flute = type === 'flute';
  const rim = flute ? .028 : .031, h = flute ? .211 : .177, stem = flute ? .108 : .083;
  const profile = [[.004, .001], [.025,.001], [.027,.004], [.023,.006], [.008,.008], [.0031,.012],
    [.0025,stem*.72],[.0037,stem*.89],[.0065,stem],[.012,stem+.014],[rim*.75,stem+.035],
    [rim*.98,h-.034],[rim,h-.012],[rim*.984,h],[rim*.905,h],[rim*.927,h-.013],[rim*.89,h-.032],
    [rim*.66,stem+.035],[.009,stem+.018],[.002,stem+.012]];
  group.add(lathe(profile,m.glass,flute?40:32), ring(rim*.987,h-.0005,.0007,m.clearRim,40), ring(.025,.0035,.00085,m.clearRim,32));
  if (flute) {
    for (let i = 0; i < 24; i++) {
      const a = i*tau/24, s=Math.sin(a), c=Math.cos(a);
      group.add(line([[s*.0122,.121,c*.0122],[s*.021,.145,c*.021],[s*.0277,.178,c*.0277],[s*.0279,.200,c*.0279]],.00034,m.glass,7));
    }
  }
  if (type === 'glassLying') {
    const down = new THREE.Group();
    group.rotation.x = Math.PI / 2;
    group.position.set(0, .032, -.089);
    down.add(group);
    return down;
  }
  return group;
}

function bakery(type, m) {
  const group = new THREE.Group();
  if (type === 'plate') {
    group.add(lathe([[.001,.003],[.104,.003],[.118,.008],[.122,.013],[.12,.016],[.115,.014],[.109,.011],[.001,.011]], m.paint(0xe7ddcb,.37),48));
  } else if (type === 'dome') {
    group.add(lathe([[.117,0],[.118,.007],[.116,.061],[.113,.088],[.1,.109],[.079,.121],
      [.050,.127],[.022,.128],[.013,.13],[.018,.139],[.017,.148],[.011,.153],[.002,.154]],m.glass,56));
    group.add(ring(.117,.003,.00145,m.clearRim,48), ring(.015,.137,.0011,m.clearRim,24));
  } else {
    const start = .38, sweep = tau - 1.24;
    const crust = m.photo('cake-crust', .82, 0.02);
    const profile = [[.101,.004],[.102,.018],[.101,.041],[.1,.081],[.089,.096],[.070,.104],[.042,.107],[.001,.101]];
    group.add(lathe(profile,crust,46,start,sweep));
    group.add(lathe([[.101,0],[.103,.018],[.103,.039],[.101,.047]],m.photo('cake-paper',.81),46,start,sweep));
    const crumb = m.material({ map: m.textures['cake-crumb'], roughness: 0.9, side: THREE.DoubleSide });
    for (const phi of [start,start+sweep]) {
      group.add(new THREE.Mesh(surface(5, 10, (u,v) => [
        .101 * Math.sin(phi) * u,.002+v*(.095+.012*Math.sin(u*Math.PI)),.101*Math.cos(phi)*u,
      ]),crumb));
    }
  }
  return group;
}

function cloth(type, m) {
  const [w,h,d] = types[type].size;
  if (type === 'velvetBow') {
    const knot = bow(m.ribbon(types[type].ink, true), w * .94, .023, d * .78);
    knot.position.y = .011;
    return knot;
  }
  const fabric = m.material({
    color: types[type].ink, roughness: .91, bumpMap: m.textures.paper, bumpScale: .0012,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(surface(11,14,(u,v)=>[
    (u-.5)*w + Math.cos(v*9)*.003, h*.5 + Math.sin(u*11+v*7)*h*.18 + Math.sin(v*16)*h*.13, (.5-v)*d,
  ]),fabric));
  return group;
}

function wicker(type, m) {
  const group = new THREE.Group(), tall = type === 'wireBasket', span = tall ? .225 : .136;
  const height = tall ? .526 : .231, base = tall ? .116 : .077;
  const steel = m.paint(0x232521,.42,.66);
  const profile = tall ? [[0,base],[.19,.158],[.52,.204],[.80,.221],[1,span]]
    : [[0,base],[.11,.064],[.29,.037],[.49,.033],[.56,.054],[.73,.106],[1,span]];
  group.add(ring(span,height,.0024,steel), ring(base,.004,.0023,steel));
  if (tall) group.add(ring(.20,height*.53,.0014,steel));
  for (const spin of [-1,1]) {
    const rows = tall ? 22 : 16;
    for (let i=0;i<rows;i++) {
      const a = tau*i/rows;
      const points = profile.map(([y,r])=>{
        const phi = a + spin * y * (tall ? 1.62 : 1.09);
        return [Math.sin(phi)*r,height*y,Math.cos(phi)*r];
      });
      group.add(line(points, tall ? .0015 : .00125,steel,17));
    }
  }
  return group;
}

function priceTag(spec, m) {
  const group = new THREE.Group(), [w,h,d]=spec.size;
  const metal = m.paint(0xb6b8aa,.34,.59);
  group.add(box(w,.005,d,.0015,metal,0,.0025,0));
  const card = new THREE.Group();
  card.position.z = .009;
  card.rotation.x = -.15;
  card.add(box(w-.002,h-.009,.003,.001,metal,0,(h-.009)/2,0));
  card.add(panel(w-.006,h-.013,m.photo(spec.front,.73,.04),0,(h-.009)/2,.0017));
  group.add(card);
  return group;
}

export function productParts(type, m) {
  const spec = types[type];
  let group;
  if (spec.family === 'wrap') group = wrapped(type,spec,m);
  else if (spec.family === 'box') group = carton(type,spec,m);
  else if (spec.family === 'tin') group = tin(type,spec,m);
  else if (type.startsWith('bottle')) group = bottle(type,m);
  else if (type === 'flute' || type.startsWith('glass')) group = stemware(type,m);
  else if (type === 'plate' || type === 'cake' || type === 'dome') group = bakery(type,m);
  else if (spec.family === 'serve') group = cloth(type,m);
  else if (type.startsWith('wire')) group = wicker(type,m);
  else group = priceTag(spec,m);
  return mergeParts(group);
}
