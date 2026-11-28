import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { aisle, standBounds } from './layout.js';
import { marketShiftZ } from '../salads/marketPosition.js';
import { mapCenter } from '../departmentLayout.js';
import { panel } from './geometry.js';
import { paintedTexture } from '../texture.js';

const mist = new THREE.Color(0xc7c4b9);
function flooring(m) {
  const ground = m.material({ color: 0xe3e1d9, map: m.textures['floor-sample'], roughness: 0.76, metalness: 0.045 });
  ground.onBeforeCompile = (shader) => {
    shader.uniforms.standMin = { value: new THREE.Vector2(standBounds.left, standBounds.back + marketShiftZ) };
    shader.uniforms.standMax = { value: new THREE.Vector2(standBounds.right, standBounds.front + marketShiftZ) };
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

function contactShadows(m, fixtures) {
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
  for (const { node, w, d, floorCover, thin } of fixtures) {
    if (!floorCover && !thin) node.add(panel(w + .22, d + .24, material, 0, 0.001, 0, -Math.PI / 2));
  }
}

export function buildWorld(scene, renderer, m, department, fixtures) {
  const center = department ? mapCenter : { x: .16, z: marketShiftZ };
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
  scene.add(department?.floor ?? flooring(m));
  contactShadows(m, fixtures);
  if (department) scene.add(department.corner);
  return () => {
    hdr.dispose();
    sun.shadow.dispose();
  };
}
