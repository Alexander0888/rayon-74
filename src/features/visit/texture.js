import * as THREE from 'three';

export function paintedTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function loadDisplayTextures(m, urls, anisotropy, signal, prefix) {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(Object.entries(urls).map(async ([path, url]) => {
    const name = path.slice('./assets/'.length, -'.webp'.length);
    const texture = await loader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, anisotropy);
    return [name, texture];
  }));
  const failed = results.find((result) => result.status === 'rejected');
  const textures = Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value));
  if (signal.aborted || failed) {
    Object.values(textures).forEach((texture) => texture.dispose());
    if (failed) throw failed.reason;
    return null;
  }
  for (const [name, texture] of Object.entries(textures)) m.textures[prefix + name] = texture;
  return textures;
}
