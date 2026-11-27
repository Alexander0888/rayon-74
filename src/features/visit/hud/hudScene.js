import * as THREE from 'three';
import { productHud as copy } from '../../../content/fr.js';
import { facePixels, makeHudBody, makeHudProjection, slab } from './hudVisuals.js';

const { clamp, smoothstep } = THREE.MathUtils;
const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const frontNormal = new THREE.Vector3(0, 0, 1);

export function createHudScene({ scene, camera, cart, layer, orbit, onChange, redraw, aimOnFoot, hides }) {
  const face = document.createElement('div');
  face.className = 'hud-face';
  face.style.visibility = 'hidden';
  layer.prepend(face);
  const pixelScale = slab.width / facePixels.width;
  const faceToSlab = new THREE.Matrix4().set(
    pixelScale, 0, 0, -slab.width / 2,
    0, -pixelScale, 0, slab.height / 2,
    0, 0, 1, slab.depth / 2 + 0.001,
    0, 0, 0, 1,
  );
  const viewport = new THREE.Matrix4(), css = new THREE.Matrix4();

  const body = makeHudBody();
  const projection = makeHudProjection();
  scene.add(body.root, projection.root);
  cart.updateWorldMatrix(true, false);
  const targets = cart.userData.hudTargets.map(({
    id, product = id, label = copy.products[product], top, hit, radii,
  }) => {
    const beacon = document.createElement('button');
    beacon.type = 'button';
    beacon.className = 'hud-hotspot';
    beacon.hidden = true;
    beacon.dataset.hudProduct = product;
    beacon.dataset.label = label ?? copy.product;
    beacon.setAttribute('aria-label', copy.inspect(beacon.dataset.label));
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    beacon.append(dot);
    const transform = new THREE.Matrix4().makeScale(...radii).setPosition(...hit).premultiply(cart.matrixWorld);
    const target = {
      id, product, label, beacon, top: cart.localToWorld(new THREE.Vector3(...top)),
      transform, inverse: transform.clone().invert(),
    };
    beacon.addEventListener('click', (event) => open(target, event.detail === 0));
    layer.append(beacon);
    return target;
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ray = new THREE.Ray(), hit = new THREE.Vector3(), point = new THREE.Vector3();
  const sight = new THREE.Ray(), direction = new THREE.Vector3(), inView = new THREE.Vector3();
  const center = new THREE.Vector3(), toViewer = new THREE.Vector3(), normal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();
  let enabled = false, chosen = null, start = 0, openingYaw = 0, focus = null;
  let width = 1, height = 1, focusCard = false;

  function close() {
    if (!chosen) return;
    chosen = null;
    focus = null;
    body.root.visible = projection.root.visible = focusCard = false;
    face.style.visibility = 'hidden';
    onChange(null);
    redraw();
  }

  function getFocus(aim) {
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const narrow = width < 560;
    const distance = Math.max(
      slab.width / ((narrow ? 1.8 : 1.68) * tangent * camera.aspect),
      slab.height / ((narrow ? 1.52 : 1.31) * tangent),
    );
    const fromCamera = camera.position.clone().sub(aim);
    const horizontal = Math.hypot(fromCamera.x, fromCamera.z);
    if (horizontal < 0.25) fromCamera.set(0.19, 0.3, 1);
    else fromCamera.y = clamp(fromCamera.y, horizontal * 0.14, horizontal * 0.44);
    return {
      fromPosition: camera.position.clone(),
      toPosition: aim.clone().add(fromCamera.setLength(distance)),
      fromTarget: orbit.target.clone(),
      toTarget: aim,
    };
  }

  function open(target, byKeyboard = false) {
    if (!enabled || chosen === target) return;
    chosen = target;
    start = performance.now();
    focusCard = byKeyboard;
    center.copy(chosen.top);
    center.y += slab.height / 2 + 0.12;
    const aim = center.clone().lerp(chosen.top, width < 560 ? 0.18 : 0.12);
    openingYaw = Math.atan2(camera.position.x - aim.x, camera.position.z - aim.z);
    if (orbit.enabled) {
      focus = getFocus(aim);
    } else {
      aimOnFoot(aim);
    }
    onChange({ product: chosen.product, label: chosen.label, mount: face });
    redraw();
  }

  function selectFromRay(cameraRay) {
    if (!enabled) return false;
    let best = Infinity, target;
    for (const item of targets) {
      if (!ray.copy(cameraRay).applyMatrix4(item.inverse).intersectSphere(unitSphere, hit)) continue;
      const distance = hit.applyMatrix4(item.transform).distanceTo(cameraRay.origin);
      if (distance >= best || hides?.(cameraRay, distance - 0.035)) continue;
      best = distance;
      target = item;
    }
    if (target) open(target);
    else close();
    return Boolean(target);
  }

  function visibleAt(world, padding = 0) {
    inView.copy(world).project(camera);
    if (inView.z < -1 || inView.z > 1 || Math.abs(inView.x) > 1 + padding || Math.abs(inView.y) > 1 + padding) return false;
    if (!hides) return true;
    const distance = direction.subVectors(world, camera.position).length();
    sight.set(camera.position, direction.normalize());
    return !hides(sight, distance - 0.07);
  }

  function draw(time) {
    if (!enabled) return false;
    const elapsed = Math.max(0, time - start);
    if (focus) {
      const t = reducedMotion.matches ? 1 : smoothstep(elapsed, 0, 380);
      camera.position.lerpVectors(focus.fromPosition, focus.toPosition, t);
      orbit.target.lerpVectors(focus.fromTarget, focus.toTarget, t);
      orbit.update();
      if (t === 1) focus = null;
    }
    camera.updateMatrixWorld();
    const spots = [];
    for (const { beacon, top } of targets) {
      point.copy(top);
      point.y += 0.042;
      beacon.hidden = Boolean(chosen) || !visibleAt(point, -0.045);
      if (!beacon.hidden) {
        spots.push({ beacon, x: (inView.x + 1) * width / 2, y: (1 - inView.y) * height / 2 });
      }
    }
    for (const spot of spots) {
      const nearest = Math.min(...spots.filter((other) => other !== spot)
        .map((other) => Math.hypot(spot.x - other.x, spot.y - other.y)));
      spot.beacon.style.setProperty('--hud-target-size', `${clamp(nearest * 1.5, 18, 42)}px`);
      spot.beacon.style.left = `${spot.x}px`;
      spot.beacon.style.top = `${spot.y}px`;
    }
    if (!chosen) return false;

    const t = reducedMotion.matches ? 1 : clamp(elapsed / 1000, 0, 1);
    const assemble = smoothstep(t, 0.38, 0.96);
    body.root.visible = assemble > 0;
    body.root.position.copy(center);
    body.root.position.y -= (1 - assemble) * 0.39;
    body.root.scale.setScalar(0.57 + assemble * 0.43);
    body.fade(assemble);
    toViewer.subVectors(camera.position, body.root.position);
    const relativeYaw = Math.atan2(toViewer.x, toViewer.z) - openingYaw;
    // The front follows the viewer across a wide arc and the back remains accessible.
    const yaw = openingYaw + Math.sin(relativeYaw) * 1.08;
    const pitch = clamp(-Math.atan2(toViewer.y, Math.hypot(toViewer.x, toViewer.z)), -0.63, 0.49);
    body.root.rotation.set(pitch, yaw, 0, 'YXZ');

    projection.root.position.copy(chosen.top);
    projection.root.position.y += 0.08 + smoothstep(t, 0, 1) * 0.57;
    projection.animate(t, chosen.id === 'yellowDragon' ? 0.83 : 1);

    normal.copy(frontNormal).applyQuaternion(body.root.quaternion);
    faceCenter.copy(body.root.position).addScaledVector(normal, body.root.scale.x * slab.depth / 2 + 0.001);
    let showFront = assemble > 0.26 && normal.dot(toViewer) > toViewer.length() * 0.075 && visibleAt(faceCenter, 0.67);
    if (showFront) {
      body.root.updateMatrixWorld();
      css.copy(viewport).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse)
        .multiply(body.root.matrixWorld).multiply(faceToSlab);
      // Project the face at the same scale in WebGL and in the browser compositor.
      const depth = css.elements[15];
      showFront = depth > camera.near;
      if (showFront) face.style.transform = `matrix3d(${css.elements.map((value) => value / depth).join(',')})`;
    }
    face.style.visibility = showFront ? 'visible' : 'hidden';
    if (showFront) {
      face.style.opacity = String(assemble);
      if (focusCard && assemble > 0.65) {
        const card = face.querySelector('.hud-card');
        if (card) {
          card.focus({ preventScroll: true });
          focusCard = false;
        }
      }
    }

    return t < 1 || Boolean(focus) || (focusCard && elapsed < 1500);
  }

  return {
    draw, close, selectFromRay,
    get isOpen() { return Boolean(chosen); },
    cancelFocus() { focus = null; },
    resize(w, h) {
      width = w;
      height = h;
      viewport.set(
        w / 2, 0, 0, w / 2,
        0, -h / 2, 0, h / 2,
        0, 0, 1, 0,
        0, 0, 0, 1,
      );
    },
    setEnabled(value) {
      enabled = value;
      if (!enabled) {
        close();
        for (const { beacon } of targets) beacon.hidden = true;
      }
      redraw();
    },
    dispose() {
      face.remove();
      for (const { beacon } of targets) beacon.remove();
      body.root.removeFromParent();
      projection.root.removeFromParent();
      body.dispose();
      projection.dispose();
    },
  };
}
