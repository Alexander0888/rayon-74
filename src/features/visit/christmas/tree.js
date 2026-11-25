import * as THREE from 'three';
import { treePosition } from './layout.js';
import { box, cylinder, lathe, line, mergeParts, randomFrom, surface } from './geometry.js';
import { paintedTexture } from '../texture.js';

const tau = 2 * Math.PI;
const height = 2.13;
const profile = [
  [0.09, .05], [.14, .35], [.25, .62], [.42, .59], [.62, .53], [.87, .46], [1.14, .376],
  [1.39, .309], [1.59, .248], [1.77, .169], [1.92, .099], [2.02, .044], [2.12, .005],
];
export function treeRadius(y) {
  const end = profile.findIndex(([h]) => h > y);
  if (end < 1) return 0;
  const [a, r] = profile[end - 1], [b, s] = profile[end];
  return THREE.MathUtils.lerp(r, s, (y - a) / (b - a));
}

function treeMesh(positions, colors, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function needles(y, trunkLength, random, material) {
  const positions = [], colors = [];
  const palette = [0x4e6535,0x65783f,0x314c24,0x425d2c,0x72924d,0x839054,0x567543,0x2b492b].map((ink) => new THREE.Color(ink));
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(), normal = new THREE.Vector3(), axis = new THREE.Vector3();
  const base = new THREE.Vector3(), vector = new THREE.Vector3(), root = new THREE.Vector3();
  const tip = new THREE.Vector3(), hinge = new THREE.Vector3(), edge = new THREE.Vector3();
  const light = new THREE.Color(), shadow = new THREE.Color();
  function sprig(start, end, count, size, warm) {
    axis.subVectors(end, start).normalize();
    side.crossVectors(axis, up);
    if (side.lengthSq() < .001) side.set(1,0,0);
    else side.normalize();
    normal.crossVectors(side, axis).normalize();
    for (let i = 0; i < count; i++) {
      const t = (i + random() * .7) / count;
      base.lerpVectors(start, end, t);
      const angle = i * 2.39996 + random() * 1.25;
      const scale = size * (.60 + .42 * random()) * (1 - .50 * t * t);
      vector.copy(side).multiplyScalar(Math.cos(angle) * scale)
        .addScaledVector(normal, Math.sin(angle) * scale * .87)
        .addScaledVector(axis, scale * (.24 + .41 * random()));
      tip.copy(base).add(vector);
      hinge.copy(base).addScaledVector(vector, .43);
      edge.copy(axis).multiplyScalar(.00105 + size * .05 * random());
      root.copy(hinge).add(edge);
      hinge.sub(edge);
      positions.push(base.x,base.y,base.z,root.x,root.y,root.z,tip.x,tip.y,tip.z);
      positions.push(base.x,base.y,base.z,tip.x,tip.y,tip.z,hinge.x,hinge.y,hinge.z);
      const shade = palette[(warm + Math.floor(random() * palette.length)) % palette.length];
      light.copy(shade).multiplyScalar(1 + random() * .38);
      shadow.copy(shade).multiplyScalar(.49 + random() * .36);
      for (const color of [shadow,shade,light,shadow,light,shade]) colors.push(color.r,color.g,color.b);
    }
  }
  const boughs = Math.max(5, Math.round(6 + trunkLength * 10));
  for (let b = 0; b < boughs; b++) {
    const a = b * tau / boughs + (random() - .5) * .44 + y * 6.34;
    const length = trunkLength * (.80 + .34 * random());
    const rise = y > 1.67 ? .065 : (.03 + random() * .105) * (random()>.23 ? -1 : 1);
    const shift = (random() - .5) * .083, sway = (random() - .5) * .4;
    const inward = new THREE.Vector3(Math.sin(a),0,Math.cos(a));
    const tangent = new THREE.Vector3(Math.cos(a),0,-Math.sin(a));
    function position(t) {
      return new THREE.Vector3().addScaledVector(inward, .021 + length * t)
        .addScaledVector(tangent, Math.sin(t * Math.PI) * length * sway)
        .setY(shift + rise * t * t + Math.sin(t * Math.PI) * .048);
    }
    const stems = Math.round(4 + length * 19);
    sprig(position(.05), position(1.05), 23 + Math.round(length * 115), .012 + .017 * random(), b);
    for (let k = 0; k < stems; k++) {
      const t = .105 + (k / stems) * .91, sign = k % 2 ? -1 : 1;
      const spread = Math.pow(Math.sin(t * Math.PI), .69) * length * (.19 + .23 * random());
      const start = position(t);
      const end = position(Math.min(t + .16 + random() * .15, 1.12))
        .addScaledVector(tangent, spread * sign)
        .addScaledVector(up, (random() - .54) * Math.min(.15, .033 + length * .26));
      const fan = end.clone().sub(start);
      sprig(start,end,20+Math.round(fan.length()*94),.010+.019*random(),b+1);
      if (length > .30) {
        const branch = start.clone().addScaledVector(fan,.30+random()*.25);
        const flank = start.clone().addScaledVector(fan,.83).addScaledVector(inward,.03+random()*.038);
        flank.y -= .015+random()*.034;
        sprig(branch,flank,19,.014+.012*random(),b+3);
      }
    }
  }
  return treeMesh(positions,colors,material);
}

function branches(y, radius, random, cards) {
  const group = new THREE.Group();
  const count = Math.round(8 + radius * 18);
  const boughs = new THREE.Group();

  function spray(start, end, width, roll, material) {
    const axis = end.clone().sub(start).normalize();
    const along = new THREE.Vector3(axis.z,0,-axis.x).normalize().applyAxisAngle(axis,roll);
    const geo = surface(6,3,(u,v)=>{
      const c = start.clone().lerp(end,v);
      c.y += (.013 + width * .22) * Math.sin(Math.PI * v);
      c.addScaledVector(along,(u-.5)*width*(.91 + .09 * Math.sin(v*6)));
      c.y += (u-.5)**2 * width * -.19;
      return c.toArray();
    });
    boughs.add(new THREE.Mesh(geo,material));
  }
  for(let i=0;i<count;i++){
    const a=y*9.7+i*tau/count+(random()-.5)*.39;
    const direction=new THREE.Vector3(Math.sin(a),0,Math.cos(a));
    const width=radius*(.49+random()*.26)+.027;
    const start=direction.clone().multiplyScalar(radius*(.03+random()*.18)).setY((random()-.5)*.07);
    const end=direction.clone().multiplyScalar(radius*(.84+random()*.27)).setY(-.052+random()*.11);
    if(y>1.73) end.y+=.044;
    const roll=(random()-.5)*1.65;
    spray(start,end,width,roll,cards[i%cards.length]);
    for(const turn of [-1,1]){
      const spread = radius*(.175+random()*.21);
      const offset = new THREE.Vector3(direction.z,0,-direction.x).multiplyScalar(turn*spread);
      const s=start.clone().lerp(end, .18+random()*.19);
      const e=start.clone().lerp(end,.78+random()*.18).add(offset);
      e.y+=turn*(.035+random()*.057);
      spray(s,e,width*(.66+random()*.32),roll+turn*(.54+random()*.35),cards[(i+(turn+3)/2)%cards.length]);
    }
  }
  for(const {geometry,material} of mergeParts(boughs)) group.add(new THREE.Mesh(geometry,material));
  return group;
}

function garland(bands, random, material) {
  const positions = bands.map(() => []);
  const colors = bands.map(() => []);
  const palette = [0x5c070e,0x8f100e,0xb3211f,0xc92b21,0xe13e2a,0x820816].map((c) => new THREE.Color(c));
  for (let i = 0; i < 780; i++) {
    const t = i / 779, theta = 0.35 + t * tau * 4.23;
    const y = .199 + t * 1.36 + Math.sin(theta * 2.22) * .043;
    const closest = Math.min(bands.length - 1, Math.max(0, Math.round((y - bands[0].position.y) / .115)));
    const r = treeRadius(y) * (1.004 + Math.sin(theta * 3.2) * .063);
    const center = new THREE.Vector3(Math.sin(theta)*r,y-bands[closest].position.y,Math.cos(theta)*r);
    for (let j=0;j<11;j++) {
      const s = j * 2.39996 + random(), reach = .034 + .041 * random();
      const end = center.clone().add(new THREE.Vector3(
        Math.cos(s) * reach,.036 * (random()-.47)+Math.sin(s)*reach*.75,Math.sin(s)*reach,
      ));
      const width = .0007 + random() * .0018;
      positions[closest].push(center.x,center.y,center.z,end.x,end.y+width,end.z-width,end.x+width,end.y-width,end.z+width);
      const color = palette[Math.floor(random() * palette.length)];
      colors[closest].push(color.r*.53,color.g*.53,color.b*.53,color.r,color.g,color.b,color.r*.73,color.g*.73,color.b*.73);
    }
  }
  for (let i=0;i<bands.length;i++) if (positions[i].length) bands[i].add(treeMesh(positions[i], colors[i], material));
}

function goldStar(m) {
  const model = new THREE.Group(), straw = m.paint(0xcab480,.45,.54);
  for (let i=0;i<12;i++) {
    const a = i * tau / 12, span = i % 3 === 0 ? .102 : .081;
    model.add(line([[0,0,0],[Math.cos(a)*span*.42,Math.sin(a)*span*.42,.010*Math.sin(i*2.7)],
      [Math.cos(a)*span,Math.sin(a)*span,-.006*Math.sin(i*2.7)]],.00185,straw,4));
  }
  model.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.009,0),straw));
  return model;
}

function biscuitMaterial(m) {
  const map = paintedTexture(128, 160, (ctx, w, h) => {
    const rand = randomFrom(81);
    function person() {
      ctx.beginPath();
      ctx.moveTo(50, 46);
      ctx.bezierCurveTo(24, 40, 37, 6, 62, 7);
      ctx.bezierCurveTo(91, 7, 95, 39, 77, 48);
      ctx.bezierCurveTo(91, 50, 111, 64, 114, 75);
      ctx.quadraticCurveTo(115, 87, 103, 84);
      ctx.lineTo(84, 73);
      ctx.lineTo(85, 103);
      ctx.quadraticCurveTo(105, 135, 100, 145);
      ctx.quadraticCurveTo(94, 155, 84, 147);
      ctx.lineTo(63, 120);
      ctx.lineTo(45, 146);
      ctx.quadraticCurveTo(35, 158, 27, 147);
      ctx.quadraticCurveTo(21, 137, 43, 101);
      ctx.lineTo(42, 74);
      ctx.lineTo(24, 86);
      ctx.quadraticCurveTo(12, 90, 13, 77);
      ctx.quadraticCurveTo(16, 62, 50, 46);
      ctx.closePath();
    }
    const dough = ctx.createLinearGradient(0, 0, w, h);
    dough.addColorStop(0,'#b87a45'); dough.addColorStop(.48,'#c69257'); dough.addColorStop(1,'#9b5b34');
    person(); ctx.fillStyle=dough; ctx.fill(); ctx.clip();
    for(let i=0;i<1100;i++){
      ctx.fillStyle=i%2?'#6e45291e':'#f4cd873b';
      ctx.fillRect(rand()*w,rand()*h,1.2,1.1);
    }
    person(); ctx.strokeStyle='#854d2e';ctx.lineWidth=4;ctx.stroke();
    ctx.lineWidth=2.6;ctx.strokeStyle='#e9d9bc';
    for (const [x,y] of [[31,75],[96,75],[36,133],[91,133]]) {
      ctx.beginPath();ctx.moveTo(x-5,y-6);ctx.quadraticCurveTo(x-1,y+1,x+5,y+5);ctx.stroke();
    }
    for (const [x,y,c] of [[54,27,'#35251c'],[72,27,'#35251c'],[64,67,'#4e6940'],[64,83,'#94302b']]) {
      ctx.beginPath();ctx.arc(x,y,3.6,0,tau);ctx.fillStyle=c;ctx.fill();
    }
    ctx.beginPath();ctx.arc(63,32,8,.18,Math.PI-.18);ctx.stroke();
    ctx.fillStyle='#627947';ctx.fillRect(49,48,28,6);
  });
  m.textures.biscuit = map;
  return m.material({ map, alphaTest:.5, side:THREE.DoubleSide, roughness:.86 });
}

function sparkleTexture(m) {
  const map = paintedTexture(48,48,(ctx)=>{
    const glow=ctx.createRadialGradient(24,24,0,24,24,23.5);
    glow.addColorStop(0,'#fff5c8'); glow.addColorStop(.17,'#ffd88bcb'); glow.addColorStop(.42,'#ffc36c56');
    glow.addColorStop(1,'#ffc16c00'); ctx.fillStyle=glow;ctx.fillRect(0,0,48,48);
  });
  m.textures.treeGlow=map;
  return map;
}

export function makeTree(m) {
  const root = new THREE.Group();
  root.position.set(treePosition.x, 0, treePosition.z);
  const random = randomFrom(42961);
  const trunk = m.paint(0x45372b,.86);
  const stand = m.paint(0x242820,.76,.25);
  root.add(cylinder(.019,1.95,trunk,0,1,0,13,.006));
  for (let i=0;i<3;i++) {
    const a=i*tau/3;
    const foot=box(.021,.026,.32,.004,stand,Math.sin(a)*.134,.018,Math.cos(a)*.134);
    foot.rotation.y=a; root.add(foot);
  }
  const foliage = m.material({ vertexColors: true,roughness:.81, side:THREE.DoubleSide });
  const tinsel = m.material({ vertexColors: true,roughness:.31,metalness:.61,side:THREE.DoubleSide });
  const cards = ['fir-bough-a','fir-bough-b','fir-bough-c'].map((name) => m.material({
    map:m.textures[name], color:0xc7cfb0, alphaTest:.36, side:THREE.DoubleSide, roughness:.90,
  }));
  const topMaterial=m.material({
    map:m.textures['fir-spike'], color:0xcbcfad, alphaTest:.39,side:THREE.DoubleSide,roughness:.88,
  });
  const bands = Array.from({length:17},(_,i)=>{
    const y=.247+i*.115;
    const band=new THREE.Group();
    band.position.y=y;
    const radius=treeRadius(y);
    band.add(needles(y,radius,random,foliage),branches(y,radius,random,cards));
    root.add(band);
    return band;
  });
  const spike = needles(2.03,.031,random,foliage);
  spike.rotation.x=Math.PI/2;
  spike.position.set(.006,.055,-.004);
  bands.at(-1).add(spike);
  for(let i=0;i<3;i++){
    const stem=new THREE.Mesh(new THREE.PlaneGeometry(.065,.21),topMaterial);
    stem.rotation.y=i*Math.PI/3;
    stem.position.set(.008,-.028,-.004);
    bands.at(-1).add(stem);
  }
  garland(bands,random,tinsel);
  const red = m.material({color:0xa9161b,roughness:.25,metalness:.61,clearcoat:.7},true);
  const satin = m.material({color:0xa82925,roughness:.41,metalness:.23,clearcoat:.37},true);
  const ivory = m.material({color:0xf7ebcb,roughness:.39,metalness:.17,clearcoat:.41},true);
  const ballGeo = new THREE.SphereGeometry(1,20,15);
  const capGeo = new THREE.CylinderGeometry(.008,.007,.008,10);
  const cap = m.paint(0xb3955f,.42,.66);
  const cookie = biscuitMaterial(m);
  const biscuit = new THREE.PlaneGeometry(.071,.094);
  const stars = mergeParts(goldStar(m));
  const ornaments = [], ornamentBatches = new Map();
  function addOrnament(swing, geometry, material, y, scale=1) {
    const id = `${geometry.id}-${material.id}`;
    if (!ornamentBatches.has(id)) ornamentBatches.set(id,{geometry,material,parts:[]});
    const local=new THREE.Matrix4().makeScale(scale,scale,scale);
    local.setPosition(0,y,0);
    ornamentBatches.get(id).parts.push({swing,local});
  }
  function hang(y,a,decor,radius,scale=1) {
    const band=bands[Math.max(0,Math.min(16,Math.round((y-.247)/.115)))];
    const swing=new THREE.Group();
    swing.position.set(Math.sin(a)*radius,y-band.position.y-.004,Math.cos(a)*radius);
    swing.rotation.y=a;
    swing.scale.setScalar(scale);
    if (decor==='star') {
      for (const part of stars) addOrnament(swing,part.geometry,part.material,-.041);
    } else if (decor==='biscuit') {
      addOrnament(swing,biscuit,cookie,-.056);
    } else {
      const r=.037+random()*.008;
      addOrnament(swing,ballGeo,decor,-r-.015,r);
      addOrnament(swing,capGeo,cap,-.011);
    }
    band.add(swing);
    ornaments.push({ node:swing, phase:random()*tau });
  }
  for (let i=0;i<59;i++) {
    const y=.244+(i/58)*1.55+random()*.049, a=i*2.39996+(random()-.5)*.8;
    const radius=treeRadius(y)*(1.02+random()*.13);
    const decor=i%14===4 ? 'star' : i%11===6 ? 'biscuit' : [red,ivory,satin,red,ivory][i%5];
    hang(y,a,decor,radius,.71+random()*.45);
  }
  const front = [
    [1.86,-.73,satin,1.17],[1.82,.61,ivory,1.18],[1.67,-.29,ivory,1.06],
    [1.50,.47,red,1.13],[1.50,-.68,'star',.96],[1.32,-.35,ivory,1.17],
    [1.18,.24,satin,1.03],[1.14,-.64,'biscuit',1.04],[1.02,.36,'star',1.02],
    [.89,-.43,red,.93],[.79,.23,ivory,1.17],[.68,-.56,'star',.91],
    [.62,.62,red,.87],[.51,.22,'biscuit',1.06],[.46,-.49,ivory,1.04],[.33,.34,satin,.89],
  ];
  for (const [y,a,decor,scale] of front) hang(y,a,decor,treeRadius(y)*(decor==='star'?1.16:1.15),scale);

  const matrix = new THREE.Matrix4();
  const fromWorld = new THREE.Matrix4();
  for (const batch of ornamentBatches.values()) {
    batch.mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.parts.length);
    batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.mesh.castShadow=batch.mesh.receiveShadow=true;
    batch.mesh.frustumCulled=false;
    root.add(batch.mesh);
  }
  function syncOrnaments() {
    root.updateMatrixWorld(true);
    fromWorld.copy(root.matrixWorld).invert();
    for (const {mesh,parts} of ornamentBatches.values()) {
      for(let i=0;i<parts.length;i++) {
        matrix.multiplyMatrices(fromWorld,parts[i].swing.matrixWorld).multiply(parts[i].local);
        mesh.setMatrixAt(i,matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  syncOrnaments();
  const glow = sparkleTexture(m);
  const lightPositions = bands.map(() => []);
  const lightGeometry = new THREE.IcosahedronGeometry(.005,0);
  const lightMaterial = new THREE.MeshBasicMaterial({ color:0xffe4a8, toneMapped:false });
  const glowMaterial = new THREE.PointsMaterial({
    map:glow, color:0xffe8b0, size:.051, transparent:true, opacity:.72, blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
  });
  const temp = new THREE.Matrix4();
  for (let i=0;i<174;i++) {
    const y=.18+(i/174)*1.79, theta=i*2.39996+random()*.27;
    const r=treeRadius(y)*(.74+random()*.29);
    const j=Math.max(0,Math.min(16,Math.round((y-.247)/.115)));
    lightPositions[j].push(Math.sin(theta)*r,y-bands[j].position.y,Math.cos(theta)*r);
  }
  for (let i=0;i<bands.length;i++) {
    const positions=lightPositions[i];
    if (!positions.length) continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const lights=new THREE.InstancedMesh(lightGeometry,lightMaterial,positions.length/3);
    for (let j=0;j<positions.length;j+=3) lights.setMatrixAt(j/3,temp.makeTranslation(positions[j],positions[j+1],positions[j+2]));
    bands[i].add(lights,new THREE.Points(geometry,glowMaterial));
  }
  const proxy = lathe([[0,0],...profile.map(([y,r])=>[r*1.03,y]),[0,height]], foliage, 20);
  proxy.position.copy(root.position);
  proxy.updateMatrixWorld();

  let touched=-Infinity;
  const duration=2700;
  return {
    root, proxy,
    shake(time) { touched=time; },
    update(time) {
      if (touched === -Infinity) return false;
      const elapsed=Math.max(0,time-touched);
      const finished=elapsed>=duration;
      const t=elapsed/1000;
      const damping=finished ? 0 : Math.exp(-1.56*t)*(1-elapsed/duration);
      for (let i=0;i<bands.length;i++) {
        const band=bands[i], lag=i*.17, bend=(.026+i*.0028)*damping;
        band.rotation.set(bend*Math.sin(t*17-lag),bend*.32*Math.sin(t*24+lag),bend*Math.sin(t*16-lag+.9));
        band.position.x=bend*.75*Math.sin(t*17-lag);
      }
      for (const {node,phase} of ornaments) {
        node.rotation.x=damping*.43*Math.sin(t*12.5+phase);
        node.rotation.z=damping*.36*Math.sin(t*14.5+phase*.93);
      }
      syncOrnaments();
      if (finished) touched=-Infinity;
      return !finished;
    },
    dispose() {
      proxy.geometry.dispose();
      lightMaterial.dispose();
      glowMaterial.dispose();
    },
  };
}
