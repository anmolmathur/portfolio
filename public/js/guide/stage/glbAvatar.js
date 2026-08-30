/* GLB avatar adapter — normalises a Mixamo-rigged GLB to the VRM convention.
 *
 * references/rendering.md §GLB path. The point of the adapter is that every
 * animation layer above it is written ONCE, against three-vrm's normalised
 * humanoid convention (rest = T-pose, bone frames world-aligned, model facing
 * +Z), and runs unchanged on either model family.
 *
 * The mechanism is a proxy rig: one identity-rotation Object3D per humanoid
 * bone, positioned at the calibrated joints and parented like the skeleton.
 * Animation poses the PROXIES; each frame the real bone's local rotation is
 * recovered by conjugation:
 *
 *     rawBoneLocal = inverse(restWorld_parent) * proxyWorldQuat * restWorld_bone
 *
 * which is the same conjugation three-vrm performs internally.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BONE_MAP, REQUIRED_BONES, EXPRESSION_TARGETS, REQUIRED_EXPRESSIONS, findNode,
} from './rig-names.js';

export class UnusableModelError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'unusable-model';
    this.detail = detail;
  }
}

export async function loadGlbAvatar(url, { onProgress } = {}) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(url, resolve, onProgress, reject);
  });

  const scene = gltf.scene;
  scene.updateWorldMatrix(true, true);

  // ---- 1. bone map -------------------------------------------------------
  const bones = {};
  for (const [vrmName, mixamoName] of Object.entries(BONE_MAP)) {
    const node = findNode(scene, mixamoName);
    if (node) bones[vrmName] = node;
  }
  const missing = REQUIRED_BONES.filter((b) => !bones[b]);
  if (missing.length) {
    // A permanent failure, distinct from a network error — the style-strike
    // logic in rendering.md only strikes on this, never on a transient fetch.
    throw new UnusableModelError('model is missing required bones', { missing });
  }

  // ---- 2. morph fan-out --------------------------------------------------
  // Mesh-name agnostic on purpose: this export splits morphs across six
  // meshes (Head/Teeth/Tongue/EyeAO/Eyelash/Eye), and other exports use
  // Wolf3D_* naming. Iterate everything with a morphTargetDictionary.
  const morphMeshes = [];
  scene.traverse((o) => {
    if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) morphMeshes.push(o);
  });

  const expressionIndex = {};   // vrmName -> [{mesh, index, weight}]
  for (const [vrmName, candidates] of Object.entries(EXPRESSION_TARGETS)) {
    const hits = [];
    for (const [morphName, weight] of candidates) {
      for (const mesh of morphMeshes) {
        const idx = mesh.morphTargetDictionary[morphName];
        if (idx !== undefined) hits.push({ mesh, index: idx, weight });
      }
    }
    if (hits.length) expressionIndex[vrmName] = hits;
  }
  const missingExpr = REQUIRED_EXPRESSIONS.filter((e) => !expressionIndex[e]);
  if (missingExpr.length) {
    throw new UnusableModelError('model is missing required visemes', { missingExpr });
  }

  // ---- 3. rest capture + proxy rig ---------------------------------------
  // This export is already T-posed (recorded in the model README), so explicit
  // arm-aiming calibration is a no-op here. Capturing the rest world rotation
  // is what the conjugation needs either way, and keeping it means an A-posed
  // export would still be driven correctly relative to its own rest.
  const restWorldQuat = new Map();
  const restWorldPos = new Map();
  for (const [name, node] of Object.entries(bones)) {
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    node.getWorldQuaternion(q);
    node.getWorldPosition(p);
    restWorldQuat.set(name, q);
    restWorldPos.set(name, p);
  }

  // Parent chain among mapped bones only, so proxies mirror the humanoid
  // hierarchy rather than every intermediate node in the export.
  const parentOf = {};
  for (const [name, node] of Object.entries(bones)) {
    let p = node.parent;
    while (p) {
      const hit = Object.keys(bones).find((k) => bones[k] === p);
      if (hit) { parentOf[name] = hit; break; }
      p = p.parent;
    }
  }

  const proxies = {};
  const proxyRoot = new THREE.Object3D();
  proxyRoot.name = 'guide-proxy-rig';
  for (const name of Object.keys(bones)) {
    const o = new THREE.Object3D();
    o.name = `proxy:${name}`;
    proxies[name] = o;
  }
  for (const [name, o] of Object.entries(proxies)) {
    const parentName = parentOf[name];
    const parent = parentName ? proxies[parentName] : proxyRoot;
    parent.add(o);
    // Identity rotation at rest — that IS the normalised convention.
    const worldPos = restWorldPos.get(name);
    const parentPos = parentName ? restWorldPos.get(parentName) : new THREE.Vector3();
    o.position.copy(worldPos).sub(parentPos);
    o.quaternion.identity();
  }

  const _pq = new THREE.Quaternion();
  const _inv = new THREE.Quaternion();

  function writeBack() {
    proxyRoot.updateWorldMatrix(true, true);
    for (const [name, node] of Object.entries(bones)) {
      const proxy = proxies[name];
      proxy.getWorldQuaternion(_pq);
      const parentName = parentOf[name];
      const parentRest = parentName ? restWorldQuat.get(parentName) : null;
      _inv.copy(parentRest || new THREE.Quaternion()).invert();
      // inverse(restWorld_parent) * proxyWorld * restWorld_bone
      node.quaternion.copy(_inv).multiply(_pq).multiply(restWorldQuat.get(name));
    }
  }

  // ---- 4. expressions ----------------------------------------------------
  const expressionValues = {};
  function setExpression(name, weight) {
    const hits = expressionIndex[name];
    if (!hits) return false;
    const w = Math.max(0, Math.min(1, Number(weight) || 0));
    expressionValues[name] = w;
    for (const h of hits) h.mesh.morphTargetInfluences[h.index] = w * h.weight;
    return true;
  }

  // ---- 5. eyes -----------------------------------------------------------
  // Human eyes barely travel. Unclamped look-at reads as possessed.
  const YAW = 0.45;
  const PITCH = 0.28;
  function setLookTarget(x, y) {
    for (const side of ['leftEye', 'rightEye']) {
      const p = proxies[side];
      if (!p) continue;
      p.rotation.y = Math.max(-YAW, Math.min(YAW, x));
      p.rotation.x = Math.max(-PITCH, Math.min(PITCH, y));
    }
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    });
  }

  return {
    scene,
    rigRoot: scene,
    bones,
    proxies,
    proxyRoot,
    humanoid: { getNormalizedBoneNode: (n) => proxies[n] || null },
    expressionManager: { setValue: setExpression, getValue: (n) => expressionValues[n] ?? 0 },
    availableExpressions: Object.keys(expressionIndex),
    morphMeshCount: morphMeshes.length,
    boneCount: Object.keys(bones).length,
    setLookTarget,
    update: writeBack,
    dispose,
  };
}
