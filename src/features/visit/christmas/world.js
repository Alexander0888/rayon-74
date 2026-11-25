import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { aisle, bagRail, rack, standBounds, tables, treePosition } from './layout.js';
import { mapCenter } from '../departmentLayout.js';
import { box, cylinder, mergeParts, panel, ring } from './geometry.js';
import { paintedTexture } from '../texture.js';

const mist = new THREE.Color(0xc7c4b9);
const margin = 0.135;

const noelBounds = {
  left: standBounds.left - aisle, right: standBounds.right + aisle,
  back: standBounds.back - aisle, front: standBounds.front + aisle,
};

export function walkable(x, z, { left, right, back, front } = noelBounds) {
  if (x < left || x > right || z < back || z > front) return false;
  if (Math.hypot(x - treePosition.x, z - treePosition.z) < treePosition.radius + margin) return false;
  if (Math.hypot(x - rack.x, z - rack.z) < rack.levels[0][1] + margin) return false;
  return !tables.some((table) => Math.abs(x - table.x) < table.w / 2 + margin && Math.abs(z - table.z) < table.d / 2 + margin);
}

function flooring(m) {
  const ground = m.material({ color: 0xe3e1d9, map: m.textures['floor-sample'], roughness: 0.76, metalness: 0.045 });
  ground.onBeforeCompile = (shader) => {
    shader.uniforms.standMin = { value: new THREE.Vector2(standBounds.left, standBounds.back) };
    shader.uniforms.standMax = { value: new THREE.Vector2(standBounds.right, standBounds.front) };
    shader.uniforms.emptyAisle = { value: aisle };
    shader.uniforms.mistColor = { value: mist.clone().convertLinearToSRGB() };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 floorPos;').replace(
      '#include <worldpos_vertex>', '#include <worldpos_vertex>\nfloorPos=(modelMatrix*vec4(transformed,1.0)).xz;',
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec2 floorPos;
      uniform vec2 standMin, standMax;
      uniform float emptyAisle;
      uniform vec3 mistColor;
    `).replace('#include <map_fragment>', `
      vec2 tile = (floorPos + vec2(0.113, 0.202)) / 0.538;
      vec2 cell = floor(tile);
      vec2 inTile = fract(tile);
      vec2 stoneUv = inTile * 0.92 + 0.04;
      float turn = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      if (turn > 0.49) stoneUv = 1.0 - stoneUv.yx;
      vec2 edge = min(inTile, 1.0 - inTile);
      float seam = min(edge.x, edge.y);
      float grain = clamp(fwidth(tile.x) + fwidth(tile.y), 0.001, 0.083);
      float bevel = smoothstep(0.005 - grain * 0.32, 0.008 + grain * 0.41, seam);
      vec3 stone = texture2D(map, stoneUv).rgb * (0.88 + turn * 0.18);
      vec3 grout = vec3(0.323, 0.298, 0.256);
      diffuseColor.rgb *= mix(grout, stone, bevel);
    `).replace('#include <fog_fragment>', `
      float outside = length(max(max(standMin - floorPos, floorPos - standMax), 0.0));
      float airy = smoothstep(emptyAisle, emptyAisle + 4.3, outside);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, mistColor, airy);
    `);
  };
  const mesh = panel(62, 62, ground, 0, -.002, 0, -Math.PI / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function fixtures(m) {
  const group = new THREE.Group();
  const steel = m.paint(0x272823,.5,.35), surface = m.paint(0xe3e0d4,.54,.03);
  const railShade = m.paint(0x776855,.38,.63);
  for (const table of tables) {
    const {x,z,w,d,y}=table;
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
  group.add(cylinder(.225,.072,steel,rack.x,.036,rack.z,46,.177));
  group.add(cylinder(.026,1.55,steel,rack.x,.805,rack.z,24));
  for (const [y, radius] of rack.levels) {
    group.add(cylinder(radius,.028,steel,rack.x,y-.014,rack.z,54));
    const rim=ring(radius-.005,y+.004,.006,steel,54);
    rim.position.x=rack.x; rim.position.z=rack.z;
    group.add(rim);
  }
  group.add(box(.30,.012,.27,.002,railShade,bagRail.x,.008,bagRail.z));
  group.add(cylinder(.008, .628, railShade, bagRail.x+.139, .32, bagRail.z));
  const rod=cylinder(.008,.378,railShade,bagRail.x,.629,bagRail.z,20);
  rod.rotation.z=Math.PI/2;
  group.add(rod);
  return mergeParts(group).map(({geometry,material})=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
}

function contactShadows(m, extra) {
  const group=new THREE.Group();
  const map=paintedTexture(96,96,(ctx)=>{
    const gradient=ctx.createRadialGradient(48,48,2,48,48,48);
    gradient.addColorStop(0,'#28221fdc');
    gradient.addColorStop(.42,'#2c251f65');
    gradient.addColorStop(.80,'#2c251f12');
    gradient.addColorStop(1,'#2c251f00');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,96,96);
  });
  m.textures.contact=map;
  const material=m.material({map,transparent:true,depthWrite:false,opacity:.37});
  for (const [x,z,w,d] of [...tables.filter((t)=>!t.base).map((t)=>[t.x,t.z,t.w+.17,t.d+.26]),
    [treePosition.x,treePosition.z,1.58,1.12],[rack.x,rack.z,.98,.85], ...extra]) {
    group.add(panel(w,d,material,x,0.001,z,-Math.PI/2));
  }
  return group;
}

export function buildWorld(scene, renderer, m, department) {
  const center = department ? mapCenter : { x: .16, z: 0 };
  scene.background = department ? new THREE.Color(department.haze) : mist;
  if (department) scene.fog = new THREE.Fog(department.haze, 4.8, 32);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let hdr;
  try {
    hdr=pmrem.fromScene(environment,.032,.1,40,{size:128});
  } finally {
    pmrem.dispose();
    environment.dispose();
  }
  scene.environment=hdr.texture;
  scene.environmentIntensity=.46;
  const sun=new THREE.DirectionalLight(0xfff3dd,3.0);
  sun.position.set(center.x - 3.66, 6.9, center.z + 4.2);
  sun.target.position.set(center.x, 0.4, center.z);
  sun.castShadow=true;
  const mapSize=renderer.getPixelRatio()>1.45 ? 2048 : 1536;
  sun.shadow.mapSize.set(mapSize,mapSize);
  const shadowBounds = department
    ? { left: -8.9, right: 8.9, top: 9.9, bottom: -9.9, near: 0.2, far: 31 }
    : { left: -4.75, right: 4.75, top: 3.75, bottom: -3.75, near: 0.2, far: 15 };
  Object.assign(sun.shadow.camera, shadowBounds);
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.00029;
  sun.shadow.normalBias=.0075;
  sun.shadow.radius=2.2;
  sun.shadow.intensity=.76;
  const fill=new THREE.DirectionalLight(0xebefff,.48);
  fill.position.set(3.3,2.8,-4);
  scene.add(new THREE.HemisphereLight(0xfff6e6,0x817969,.65), sun,sun.target,fill);
  scene.add(department?.floor ?? flooring(m), contactShadows(m, department?.shadows ?? []), ...fixtures(m));
  if (department) scene.add(department.corner);
  return () => {
    hdr.dispose();
    sun.shadow.dispose();
  };
}
