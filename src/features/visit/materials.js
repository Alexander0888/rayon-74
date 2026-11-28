import * as THREE from 'three';
import oakUrl from './assets/oak.webp';
import pineUrl from './assets/pine.webp';
import stoneUrl from './assets/limestone.webp';
import wickerUrl from './assets/wicker.webp';
import skinsUrl from './assets/fruit-skins.webp';
import photosUrl from './assets/shop-details.webp';
import firUrl from './assets/fir.webp';
import scaleScreenUrl from './assets/scale-screen.webp';

export const haze = 0xcecdc7;

// Туман начинается за разными ориентирами и остаётся на месте при перемещении камеры.
function addBoundaryFog(shader) {
  shader.vertexShader =
    'varying vec3 visitWorld;\n' +
    shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
     vec4 visitPosition = vec4(transformed, 1.0);
     #ifdef USE_INSTANCING
       visitPosition = instanceMatrix * visitPosition;
     #endif
     visitWorld = (modelMatrix * visitPosition).xyz;`,
    );
  shader.fragmentShader =
    'varying vec3 visitWorld;\n' +
    shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#include <fog_fragment>
     #ifdef USE_FOG
       float edgeX = max(smoothstep(4.48, 5.35, visitWorld.x), smoothstep(2.74, 3.85, -visitWorld.x));
       float edgeZ = max(smoothstep(3.70, 4.63, visitWorld.z), smoothstep(2.24, 3.78, -visitWorld.z));
       float roof = smoothstep(2.83, 3.72, visitWorld.y);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, max(roof, max(edgeX, edgeZ)));
     #endif`,
    );
}

export async function loadMaterials(anisotropy, { boundaryFog = true } = {}) {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(
    [oakUrl, pineUrl, stoneUrl, wickerUrl, skinsUrl, photosUrl, firUrl, scaleScreenUrl].map((url) => loader.loadAsync(url)),
  );
  if (results.some((result) => result.status === 'rejected')) {
    results.forEach((result) => {
      if (result.status === 'fulfilled') result.value.dispose();
    });
    throw new Error('visit-textures');
  }
  const textures = results.map((result) => result.value);
  const [oak, pine, stone, wicker, skins, photos, fir, scaleScreen] = textures;
  for (const texture of textures) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(anisotropy, 8);
  }
  for (const texture of [oak, pine, stone, wicker]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  wicker.repeat.set(1.82, 1);
  stone.repeat.set(32, 32);
  const standard = (color, options) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options });
  const materials = {
    oak: standard(0xffffff, { map: oak, bumpMap: oak, bumpScale: 0.0018 }),
    pine: standard(0xffffff, { map: pine, bumpMap: pine, bumpScale: 0.001 }),
    stone: standard(0xffffff, { map: stone, roughness: 0.58 }),
    wicker: standard(0xffffff, { map: wicker, bumpMap: wicker, bumpScale: 0.007 }),
    reed: standard(0xb39b77),
    iron: standard(0x282522, { metalness: 0.56, roughness: 0.43 }),
    wire: standard(0x262321, { metalness: 0.45, roughness: 0.45 }),
    brass: standard(0xb0965c, { metalness: 0.57, roughness: 0.46 }),
    steel: standard(0xa4a7a2, { metalness: 0.72, roughness: 0.32 }),
    dark: standard(0x262724),
    cream: standard(0xe4ddc8),
    plain: standard(0xffffff),
    fruit: standard(0xffffff, { map: skins, bumpMap: skins, bumpScale: 0.0016, roughness: 0.43, vertexColors: true }),
    leaves: standard(0xffffff, { side: THREE.DoubleSide, vertexColors: true, roughness: 0.7 }),
    sleeves: standard(0xf2ede0, { roughness: 0.9 }),
    photos: standard(0xffffff, { map: photos, roughness: 0.76 }),
    scaleScreen: new THREE.MeshBasicMaterial({ map: scaleScreen, toneMapped: false }),
    film: standard(0xfcfbef, {
      roughness: 0.18,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      flatShading: true,
    }),
    fir: standard(0xffffff, { map: fir, alphaTest: 0.35, side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff3cd }),
  };
  for (const [name, material] of Object.entries(materials)) {
    material.name = name;
    if (boundaryFog) material.onBeforeCompile = addBoundaryFog;
  }
  return {
    materials,
    dispose() {
      textures.forEach((t) => t.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
