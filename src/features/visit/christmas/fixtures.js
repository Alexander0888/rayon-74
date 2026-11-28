import * as THREE from 'three';
import { marketShiftZ } from '../salads/marketPosition.js';
import { bagRail, rack, tables, treePosition } from './layout.js';
import { box, cylinder, mergeParts, panel, ring } from './geometry.js';

function addTable(group, m, table, origin, steel, surface) {
  const { w, d, y } = table;
  const x = table.x - origin.x, z = table.z - origin.z;
  const bottom = table.base ?? 0.014, top = y - .025;
  const thickness = table.base ? 0.013 : 0.023;
  group.add(box(w,.022,d,.0018,surface,x,y-.011,z));
  for(const signX of [-1,1]) for(const signZ of [-1,1]) {
    group.add(box(thickness,top-bottom,thickness,.0013,steel,
      x+signX*(w-thickness)/2,(top+bottom)/2,z+signZ*(d-thickness)/2));
  }
  for(const sign of [-1,1]) {
    for(const yy of (table.base ? [top] : [bottom+thickness*.5,top])) {
      group.add(box(w,thickness,thickness,.001,steel,x,yy,z+sign*(d-thickness)/2));
      group.add(box(thickness,thickness,d,.001,steel,x+sign*(w-thickness)/2,yy,z));
    }
  }
  if (table.panel || table.back) {
    const h=top-.007, pw=table.back ? .67 : w-.016;
    const px=table.back ? (table.id==='leftRear'?x-.343:x-.436) : x;
    const pz=z+(table.panel ? 1 : -1)*(d*.5+.001);
    const green=m.paint(0x274b39,.81);
    group.add(box(pw,h,.006,.001,green,px,h*.5+.007,pz));
    group.add(panel(pw-.003,h-.003,m.photo(table.panel || 'back-panel',.79),
      px,h*.5+.007,pz+(table.panel ? .0034 : -.0034),0,table.panel ? 0 : Math.PI));
  }
}

function finish(group, id, position) {
  const node = new THREE.Group();
  node.name = id;
  node.position.set(position.x, 0, position.z);
  for (const { geometry, material } of mergeParts(group)) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    node.add(mesh);
  }
  return node;
}

export function christmasFixtures(m, tree) {
  const steel = m.paint(0x272823, .5, .35), surface = m.paint(0xe3e0d4, .54, .03);
  const railShade = m.paint(0x776855, .38, .63);
  const fixtures = tables.filter((table) => !table.base).map((table) => {
    const group = new THREE.Group();
    const attached = table.id === 'leftRear' ? ['ivoryTier'] :
      table.id === 'rightBack' ? ['goldTier', 'glassTier', 'bowlTier'] : [];
    const parts = [table, ...tables.filter(({ id }) => attached.includes(id))];
    const id = 'noel-table-' + table.id;
    const boards = parts.map((part) => ({
      id: part.id, x: part.x - table.x, z: part.z - table.z, y: part.y, w: part.w, d: part.d,
    }));
    parts.forEach((part) => addTable(group, m, part, table, steel, surface));
    return {
      id, type: 'noel-table', node: finish(group, id, table), w: table.w, d: table.d, height: Math.max(...parts.map(({ y }) => y)), boards,
      hitBoxes: boards.map(({ x, z, w, d, y }, i) => ({ x, z, w, d, height: y, base: parts[i].base ?? 0 })),
    };
  });

  const shelves = new THREE.Group();
  shelves.add(cylinder(.225,.072,steel,0,.036,0,46,.177));
  shelves.add(cylinder(.026,1.55,steel,0,.805,0,24));
  for (const [y, radius] of rack.levels) {
    shelves.add(cylinder(radius,.028,steel,0,y-.014,0,54));
    const rim=ring(radius-.005,y+.004,.006,steel,54);
    shelves.add(rim);
  }
  const rackNode = finish(shelves, 'noel-rack', rack);
  fixtures.push({
    id: 'noel-rack', node: rackNode, w: .69, d: .69, radius: .344, height: 1.63,
    boards: rack.levels.map(([y, radius], i) => ({ id: 'tray-' + i, x: 0, z: 0, radius, y })),
    hitBoxes: [{ w: .075, d: .075, height: 1.61 }, ...rack.levels.map(([y, radius]) =>
      ({ w: radius * 2, d: radius * 2, base: y - .028, height: y }))],
  });

  const hanging = new THREE.Group();
  hanging.add(box(.30,.012,.27,.002,railShade,0,.008,0));
  hanging.add(cylinder(.008, .628, railShade, .139, .32, 0));
  const rod=cylinder(.008,.378,railShade,0,.629,0,20);
  rod.rotation.z=Math.PI/2;
  hanging.add(rod);
  fixtures.push({
    id: 'noel-bags', node: finish(hanging, 'noel-bags', bagRail), w: .378, d: .27, height: .65,
    boards: [{ id: 'bag-support', x: 0, z: 0, w: .39, d: .16, y: .38, hanging: true }],
    hitBoxes: [
      { w: .31, d: .28, height: .022 },
      { x: .139, w: .036, d: .036, height: .63 },
      { w: .38, d: .045, base: .60, height: .65 },
    ],
  });

  tree.root.name = 'noel-tree';
  tree.proxy.position.set(0, 0, 0);
  tree.proxy.visible = false;
  tree.root.add(tree.proxy);
  fixtures.push({
    id: 'noel-tree', node: tree.root, proxy: tree.proxy, radius: treePosition.radius,
    w: treePosition.radius * 2.2, d: treePosition.radius * 2.2, height: 2.21,
  });
  for (const { node } of fixtures) node.position.z += marketShiftZ;
  return fixtures;
}
