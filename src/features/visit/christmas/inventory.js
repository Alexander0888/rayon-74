import * as THREE from 'three';
import { productParts } from './products.js';
import { types } from './layout.js';

const unit = new THREE.Vector3(1,1,1);
function useMatrix(item, matrix, position, rotation, quaternion) {
  position.set(item.x,item.y,item.z);
  rotation.set(item.tiltX,item.rotation,item.tiltZ,'YXZ');
  quaternion.setFromEuler(rotation);
  matrix.compose(position,quaternion,unit);
}

export function createInventory(scene, materials) {
  const group = new THREE.Group(), templates = new Map();
  group.name = 'Objets du présentoir';
  const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), rotation = new THREE.Euler();
  const localRay = new THREE.Ray(), hit = new THREE.Vector3();
  const box = new THREE.Box3(), caster = new THREE.Raycaster();
  const precise = new THREE.Mesh(new THREE.BufferGeometry(),materials.clearRim);
  precise.matrixAutoUpdate = false;
  let items = [];
  const slots = new Map();
  let dirtyOutline;
  function prepare(type) {
    if (!templates.has(type)) {
      const parts = productParts(type, materials);
      templates.set(type,{ parts, batches: [], capacity: 0 });
    }
    return templates.get(type);
  }
  function fill(type, pieces) {
    const template=prepare(type);
    const {parts}=template;
    if (template.capacity < pieces.length) {
      for (const mesh of template.batches) { group.remove(mesh); mesh.dispose(); }
      template.capacity=2**Math.ceil(Math.log2(Math.max(4,pieces.length)));
      template.batches=parts.map(({geometry,material})=>{
        const mesh=new THREE.InstancedMesh(geometry,material,template.capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow=!material.transparent && !types[type].flat;
        mesh.receiveShadow=!material.transparent;
        mesh.name=type;
        group.add(mesh);
        return mesh;
      });
    }
    for (let i=0;i<pieces.length;i++) {
      slots.set(pieces[i].id, i);
      useMatrix(pieces[i],matrix,position,rotation,quaternion);
      for (const batch of template.batches) batch.setMatrixAt(i,matrix);
    }
    for (const mesh of template.batches) {
      mesh.count=pieces.length;
      mesh.computeBoundingSphere();
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  function show(next) {
    slots.clear();
    const perType=new Map();
    for(const item of next) {
      if(!perType.has(item.type)) perType.set(item.type,[]);
      perType.get(item.type).push(item);
    }
    for(const [type,pieces] of perType) fill(type,pieces);
    for(const [type,template] of templates) if(!perType.has(type)) template.batches.forEach((mesh)=> { mesh.count=0; });
    items=next;
  }

  const outlineMaterial=new THREE.LineBasicMaterial({
    color:0xffd079, transparent:true, opacity:.91, depthTest:false, depthWrite:false, toneMapped:false,
  });
  const outline=new THREE.LineSegments(new THREE.BufferGeometry(),outlineMaterial);
  outline.visible=false;
  outline.renderOrder=10;
  scene.add(group,outline);
  function highlight(item, isTarget = false) {
    outline.visible=Boolean(item);
    if (!item) return;
    if(dirtyOutline!==item.type) {
      const [w,h,d]=types[item.type].size;
      const edges=new THREE.BoxGeometry(w+.012,h+.012,d+.012);
      edges.translate(0,h/2,0);
      outline.geometry.dispose();
      outline.geometry=new THREE.EdgesGeometry(edges);
      edges.dispose();
      dirtyOutline=item.type;
    }
    outline.position.set(item.x,item.y,item.z);
    outline.rotation.set(item.tiltX,item.rotation,item.tiltZ,'YXZ');
    outlineMaterial.color.setHex(isTarget ? 0xceeab3 : 0xffd079);
  }

  function pick(ray, excluded) {
    let closest = Infinity, best = null;
    caster.ray.copy(ray);
    for (const item of items) {
      if (item.id===excluded) continue;
      const spec=types[item.type], [w,h,d]=spec.size;
      useMatrix(item,matrix,position,rotation,quaternion);
      inverse.copy(matrix).invert();
      localRay.copy(ray).applyMatrix4(inverse);
      const tolerance=spec.flat ? .007 : .001;
      box.min.set(-w*.5-tolerance,-tolerance,-d*.5-tolerance);
      box.max.set(w*.5+tolerance,h+tolerance,d*.5+tolerance);
      if (!localRay.intersectBox(box,hit)) continue;
      hit.applyMatrix4(matrix);
      let distance=hit.distanceTo(ray.origin);
      if (spec.hollow || item.type.startsWith('glass') || item.type==='flute') {
        distance=Infinity;
        precise.matrixWorld.copy(matrix);
        for(const {geometry,material} of prepare(item.type).parts) {
          precise.geometry=geometry;
          precise.material=material;
          const intersect=caster.intersectObject(precise,false)[0];
          if(intersect) distance=Math.min(distance,intersect.distance);
        }
      }
      if (distance<closest) { closest=distance; best=item; }
    }
    return best ? { item:best,distance:closest } : null;
  }

  function preview(item) {
    const index = slots.get(item.id);
    if (index === undefined) return;
    useMatrix(item,matrix,position,rotation,quaternion);
    for (const mesh of templates.get(item.type).batches) {
      mesh.setMatrixAt(index,matrix);
      mesh.computeBoundingSphere();
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  return {
    show, highlight, pick, preview,
    dispose() {
      for(const {parts,batches} of templates.values()) {
        parts.forEach(({geometry})=>geometry.dispose());
        batches.forEach((mesh)=>mesh.dispose());
      }
      outline.geometry.dispose();
      outlineMaterial.dispose();
      scene.remove(group,outline);
    },
  };
}
