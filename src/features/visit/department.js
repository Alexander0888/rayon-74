import * as THREE from 'three';
import { cartOrigin, departmentBounds, mapCenter, mapSize, pastryOriginZ } from './departmentLayout.js';
import { createCart } from './cart.js';
import { haze, loadMaterials } from './materials.js';
import { createSurroundings, createVisitFloor } from './surroundings.js';
import { makeProtections } from './workInProgress.js';
import { createCarrotDisplay } from './carrot/display.js';
import { createOrchardDisplay } from './pear/display.js';
import { createSaladDisplay } from './salads/display.js';
import { createGroceriesDisplay } from './groceries/display.js';
import { createBakeryDisplay } from './bakery/display.js';
import { cartPlacement } from './surroundingsLayout.js';

const floorFadeDistance = 4.1;

function fogAtFloorEdge(shader) {
  const { left, right, back, front } = departmentBounds;
  shader.uniforms.departmentMin = { value: new THREE.Vector2(left, back) };
  shader.uniforms.departmentMax = { value: new THREE.Vector2(right, front) };
  shader.uniforms.floorFadeDistance = { value: floorFadeDistance };
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
    uniform float floorFadeDistance;
  ` + shader.fragmentShader.replace('#include <fog_fragment>', `
    #include <fog_fragment>
    #ifdef USE_FOG
      float outside = length(max(max(departmentMin - floorWorld, floorWorld - departmentMax), 0.0));
      float border = smoothstep(0.15, floorFadeDistance, outside);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, border);
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

export async function createDepartment(christmasMaterials, renderer, signal) {
  const cart = await loadMaterials(renderer.capabilities.getMaxAnisotropy(), { boundaryFog: false });
  if (signal.aborted) {
    cart.dispose();
    return null;
  }

  let carrots, orchard, salads, groceries, bakery;
  function dispose() {
    bakery?.dispose();
    groceries?.dispose();
    salads?.dispose();
    orchard?.dispose();
    carrots?.dispose();
    cart.dispose();
  }
  try {
    const work = makeProtections(christmasMaterials);
    carrots = await createCarrotDisplay(christmasMaterials, work, renderer, signal);
    if (!carrots) {
      dispose();
      return null;
    }
    const { materials } = cart;
    orchard = await createOrchardDisplay(christmasMaterials, materials, work, renderer, signal, cartOrigin.z);
    if (!orchard) {
      dispose();
      return null;
    }
    salads = await createSaladDisplay(christmasMaterials, renderer, signal);
    if (!salads) {
      dispose();
      return null;
    }
    groceries = await createGroceriesDisplay(christmasMaterials, materials, renderer, signal);
    if (!groceries) {
      dispose();
      return null;
    }
    bakery = await createBakeryDisplay(christmasMaterials, renderer, signal);
    if (!bakery) {
      dispose();
      return null;
    }
    materials.stone.onBeforeCompile = fogAtFloorEdge;
    materials.plain.onBeforeCompile = fogAtCeiling;
    const floor = createVisitFloor(materials.stone, {
      width: mapSize.width + 2 * floorFadeDistance,
      depth: mapSize.depth + 2 * floorFadeDistance,
      ...mapCenter,
      originZ: pastryOriginZ,
    });
    const corner = new THREE.Group();
    const charrette = createCart(materials, { includeFloorBaskets: false });
    charrette.position.set(cartOrigin.x + cartPlacement.x, 0, cartOrigin.z + cartPlacement.z);
    charrette.rotation.y = cartPlacement.yaw;
    const surroundings = createSurroundings(materials, work, cartOrigin.z);
    corner.add(charrette, surroundings.group, carrots.root, orchard.root, salads.root, groceries.root, bakery.root);
    return {
      floor, corner, haze,
      film: orchard.film,
      editors: [carrots.crates, orchard.crates, ...salads.editors, ...groceries.editors, ...bakery.editors],
      hudSources: [charrette, ...orchard.hudSources],
      fixtures: [
        { id: 'charrette', node: charrette, w: 2.22, d: 1.15, height: 1.48, hudHost: true },
        ...surroundings.fixtures, ...carrots.fixtures, ...orchard.fixtures, ...salads.fixtures, ...groceries.fixtures, ...bakery.fixtures,
      ],
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
