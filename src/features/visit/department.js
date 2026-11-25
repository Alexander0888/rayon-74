import * as THREE from 'three';
import { cartObstacles, cartOrigin, departmentBounds } from './departmentLayout.js';
import { column, timberFloor } from './surroundingsLayout.js';
import { createCart } from './cart.js';
import { haze, loadMaterials } from './materials.js';
import { createSurroundings, createVisitFloor } from './surroundings.js';
import { makeProtections } from './workInProgress.js';

function fogAtFloorEdge(shader) {
  const { left, right, back, front } = departmentBounds;
  shader.uniforms.departmentMin = { value: new THREE.Vector2(left, back) };
  shader.uniforms.departmentMax = { value: new THREE.Vector2(right, front) };
  shader.uniforms.timberEdge = { value: cartOrigin.z + timberFloor.z + timberFloor.depth / 2 };
  shader.vertexShader = 'varying vec2 floorWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `
    #include <project_vertex>
    vec4 floorPoint = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      floorPoint = instanceMatrix * floorPoint;
    #endif
    floorWorld = (modelMatrix * floorPoint).xz;
  `);
  shader.fragmentShader = `
    varying vec2 floorWorld;
    uniform vec2 departmentMin, departmentMax;
    uniform float timberEdge;
  ` + shader.fragmentShader.replace('#include <fog_fragment>', `
    #include <fog_fragment>
    #ifdef USE_FOG
      float outside = length(max(max(departmentMin - floorWorld, floorWorld - departmentMax), 0.0));
      float border = smoothstep(0.15, 4.1, outside);
      float behindCoffee = smoothstep(timberEdge - 1.26, timberEdge - 0.025, floorWorld.y);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, max(border, behindCoffee));
    #endif
  `);
}

function fogAtCeiling(shader) {
  shader.vertexShader = 'varying float shopHeight;\n' + shader.vertexShader.replace('#include <project_vertex>', `
    #include <project_vertex>
    vec4 shopPoint = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      shopPoint = instanceMatrix * shopPoint;
    #endif
    shopHeight = (modelMatrix * shopPoint).y;
  `);
  shader.fragmentShader = 'varying float shopHeight;\n' + shader.fragmentShader.replace('#include <fog_fragment>', `
    #include <fog_fragment>
    #ifdef USE_FOG
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(2.85, 3.8, shopHeight));
    #endif
  `);
}

function occlusionBoxes() {
  const obstacles = [...cartObstacles, {
    x: column.x, z: column.z + cartOrigin.z, w: column.radius * 2, d: column.radius * 2, y: column.height,
  }];
  return obstacles.map(({ x, z, w, d, y, cartBody }) => ({
    cartBody,
    box: new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, y, z + d / 2),
    ),
  }));
}

export async function createDepartment(christmasMaterials, renderer, signal) {
  const cart = await loadMaterials(renderer.capabilities.getMaxAnisotropy(), { boundaryFog: false });
  if (signal.aborted) {
    cart.dispose();
    return null;
  }

  try {
    const { materials } = cart;
    materials.stone.onBeforeCompile = fogAtFloorEdge;
    materials.oak.onBeforeCompile = fogAtFloorEdge;
    materials.plain.onBeforeCompile = fogAtCeiling;
    const floor = createVisitFloor(materials.stone, {
      width: 30, depth: 42, z: 6.5, originZ: cartOrigin.z,
    });
    const corner = new THREE.Group();
    corner.position.set(cartOrigin.x, 0, cartOrigin.z);
    const charrette = createCart(materials);
    corner.add(charrette, createSurroundings(materials, {
      work: makeProtections(christmasMaterials),
    }));
    const occluders = occlusionBoxes(), hit = new THREE.Vector3();
    return {
      floor,
      corner,
      charrette,
      haze,
      shadows: cartObstacles.map(({ x, z, w, d }) => [x, z, w + 0.25, d + 0.28]),
      hides(ray, distance, includeCart = true) {
        return occluders.some(({ box, cartBody }) =>
          (includeCart || !cartBody) && ray.intersectBox(box, hit) && hit.distanceTo(ray.origin) < distance
        );
      },
      dispose: () => cart.dispose(),
    };
  } catch (error) {
    cart.dispose();
    throw error;
  }
}
