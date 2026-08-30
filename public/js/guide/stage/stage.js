/* Avatar stage — transparent cutout canvas, waist-up framing.
 *
 * references/rendering.md §Stage. The avatar is a CUTOUT floating over the
 * page, not a widget in a window: alpha renderer, zero clear alpha, and
 * `pointer-events: none` on the canvas so the page stays clickable through it.
 */
import * as THREE from 'three';
import { loadGlbAvatar, UnusableModelError } from './glbAvatar.js';

export { UnusableModelError };

export async function createStage(host, opts = {}) {
  const modelUrl = opts.modelUrl || '/assets/guide/models/anmol.glb';
  const width = opts.width || host.clientWidth || 300;
  const height = opts.height || host.clientHeight || 260;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  // The page stays clickable through the avatar; the panel's own controls are
  // DOM siblings with their own pointer events.
  canvas.style.pointerEvents = 'none';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 20);

  // Soft key + ambient is all a PBR head needs at this size.
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(0.6, 1.6, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  rim.position.set(-0.9, 1.2, -1.1);
  scene.add(rim);

  let avatar = null;
  let raf = 0;
  let disposed = false;

  avatar = await loadGlbAvatar(modelUrl, { onProgress: opts.onProgress });
  if (disposed) { avatar.dispose(); throw new Error('stage disposed during load'); }

  scene.add(avatar.scene);
  scene.add(avatar.proxyRoot);
  // Face the viewer. Mixamo exports face +Z already, but being explicit means
  // a differently-oriented export is one constant away from correct.
  avatar.scene.rotation.y = opts.faceRotation ?? 0;

  /* Waist-up framing, computed from the loaded rig rather than hardcoded.
     The bottom sits just under the hips (rendering.md: `hips.y - 0.02`), which
     crops the legs out — this export models shoes and trousers that are simply
     never in frame. */
  function frame() {
    const head = avatar.bones.head;
    const hips = avatar.bones.hips;
    const headPos = new THREE.Vector3();
    const hipPos = new THREE.Vector3();
    head.getWorldPosition(headPos);
    hips.getWorldPosition(hipPos);

    const top = headPos.y + (opts.frameTopOffset ?? 0.18);
    const bottom = hipPos.y - (opts.frameBottomOffset ?? 0.02);
    const centerY = (top + bottom) / 2;
    const span = Math.max(0.35, top - bottom);

    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (span / 2) / Math.tan(fov / 2);

    camera.position.set(headPos.x, centerY, dist + 0.35);
    camera.lookAt(headPos.x, centerY, 0);
    camera.updateProjectionMatrix();
    return { top, bottom, centerY, span, dist };
  }
  const framing = frame();

  function renderFrame() {
    avatar.update();
    renderer.render(scene, camera);
  }

  // First paint immediately, so the avatar is visible even if the animation
  // loop never runs (reduced motion, background tab, automated browsers).
  renderFrame();

  function start() {
    if (raf || disposed) return;
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      renderFrame();
    };
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderFrame();
  }

  function dispose() {
    disposed = true;
    stop();
    if (avatar) avatar.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  const api = {
    scene, camera, renderer, avatar, framing,
    renderFrame, start, stop, resize, dispose,
    setExpression: (n, w) => avatar.expressionManager.setValue(n, w),
    setLookTarget: avatar.setLookTarget,
  };

  /* Verification hook, required by rendering.md §Verifying: "screenshot
     gestures by POLLING bone state (expose window.__AVATAR_DEBUG__ -> the rig),
     never by timers". Automated browsers run page clocks fast or, as here, do
     not run rAF at all — driving `renderFrame()` by hand and reading bone
     state back is the only way to verify a pose deterministically. */
  window.__AVATAR_DEBUG__ = {
    stage: api,
    avatar,
    bones: avatar.bones,
    proxies: avatar.proxies,
    expressions: avatar.availableExpressions,
    step: renderFrame,
    boneWorldY: (name) => {
      const b = avatar.bones[name];
      if (!b) return null;
      const v = new THREE.Vector3();
      b.getWorldPosition(v);
      return v.y;
    },
    project: (name) => {
      const b = avatar.bones[name];
      if (!b) return null;
      const v = new THREE.Vector3();
      b.getWorldPosition(v);
      v.project(camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };  // 0..1 within the canvas
    },
  };

  return api;
}
