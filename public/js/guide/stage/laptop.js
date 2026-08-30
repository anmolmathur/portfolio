/* A laptop for the avatar to work at while idle.
 *
 * Deliberately simple geometry. The risk with a prop next to a photoreal
 * Avaturn figure is that it reads as unfinished, so the mitigation is material
 * rather than polygons: near-black brushed surfaces that sit back visually,
 * a screen that emits its own faint light, and no texture to be inspected.
 * A grey untextured box is what looks broken; a dark object with a glowing
 * screen reads as a laptop at a glance, which is all it has to do.
 *
 * Sized and placed from the rig at build time, so it lands under the hands
 * rather than at hardcoded coordinates that would drift with a new export.
 */
import * as THREE from 'three';

export function createLaptop(opts = {}) {
  const width = opts.width ?? 0.34;
  const depth = opts.depth ?? 0.24;
  const group = new THREE.Group();
  group.name = 'guide-laptop';

  const body = new THREE.MeshStandardMaterial({
    color: 0x1b1f27, roughness: 0.42, metalness: 0.55,
  });
  const screenBack = new THREE.MeshStandardMaterial({
    color: 0x161a21, roughness: 0.38, metalness: 0.6,
  });
  // Emissive so the screen carries its own light. Without this the lid is just
  // a dark slab and the whole thing reads as a closed box.
  const screenFace = new THREE.MeshStandardMaterial({
    color: 0x0d1117, emissive: 0x4a7fd4, emissiveIntensity: 0.55, roughness: 0.25,
  });

  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, depth), body);
  base.position.y = 0.006;
  group.add(base);

  // A slightly inset keyboard plate catches the key light and gives the base
  // an edge, so it does not read as one flat slab.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.86, 0.002, depth * 0.72),
    new THREE.MeshStandardMaterial({ color: 0x272c36, roughness: 0.7, metalness: 0.2 }),
  );
  plate.position.set(0, 0.013, depth * 0.06);
  group.add(plate);

  // Lid, hinged at the back and tilted towards the avatar's face.
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -depth / 2);
  lid.rotation.x = THREE.MathUtils.degToRad(-100);   // open, leaning away
  const lidShell = new THREE.Mesh(new THREE.BoxGeometry(width, depth * 0.92, 0.01), screenBack);
  lidShell.position.y = (depth * 0.92) / 2;
  lid.add(lidShell);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.9, depth * 0.82),
    screenFace,
  );
  face.position.set(0, (depth * 0.92) / 2, 0.006);
  lid.add(face);
  group.add(lid);

  /** Place under the hands, from the rig rather than fixed numbers. */
  function placeUnder(leftHand, rightHand) {
    const l = new THREE.Vector3();
    const r = new THREE.Vector3();
    leftHand.getWorldPosition(l);
    rightHand.getWorldPosition(r);
    const midX = (l.x + r.x) / 2;
    const midY = (l.y + r.y) / 2;
    const midZ = (l.z + r.z) / 2;
    // Just below the hands so fingers rest on the keys, and slightly forward
    // so the body is not intersecting the torso.
    group.position.set(midX, midY - 0.055, midZ + 0.02);
  }

  function dispose() {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    [body, screenBack, screenFace].forEach((m) => m.dispose());
  }

  return { group, placeUnder, dispose, screenMaterial: screenFace };
}
