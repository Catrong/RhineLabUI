import * as THREE from "three";

/** A sharp annotation pass after postprocessing, with real scene occlusion. */
export class SharpTitleRenderer {
  private depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  constructor() { this.depth.colorWrite = false; }
  dispose() { this.depth.dispose(); }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const background = scene.background, override = scene.overrideMaterial;
    const mask = camera.layers.mask, autoClear = renderer.autoClear;
    const target = renderer.getRenderTarget();
    const shadowUpdate = renderer.shadowMap.needsUpdate;
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.shadowMap.needsUpdate = false;
      scene.background = null;
      // Rebuild only screen depth; preserve the composited (already blurred)
      // scene color. Layer 31 is absent from all scene/postprocessing passes.
      renderer.clearDepth();
      camera.layers.disable(31);
      scene.overrideMaterial = this.depth;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      camera.layers.set(31);
      renderer.render(scene, camera);
    } finally {
      scene.background = background;
      scene.overrideMaterial = override;
      camera.layers.mask = mask;
      renderer.autoClear = autoClear;
      renderer.shadowMap.needsUpdate = shadowUpdate;
      renderer.setRenderTarget(target);
    }
  }
}
