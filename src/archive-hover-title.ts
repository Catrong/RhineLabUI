import * as THREE from "three";

/** Runtime text annotation on the cover plane, rendered with scene depth. */
export class ArchiveHoverTitle {
  private canvas = document.createElement("canvas");
  private texture = new THREE.CanvasTexture(this.canvas);
  readonly mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).translate(.5, .5, 0),
    new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthTest: true, depthWrite: true,
      alphaTest: .01, side: THREE.DoubleSide, toneMapped: false,
    }),
  );
  private title = "";
  private progress = 0;
  private height = 0;
  private paintKey = "";
  private fontRevision = 0;
  private local = new THREE.Matrix4();
  private fontLoaded = () => { this.fontRevision++; };

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh.name = "archive-hover-title";
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    document.fonts.addEventListener("loadingdone", this.fontLoaded);
  }

  dispose() {
    document.fonts.removeEventListener("loadingdone", this.fontLoaded);
    // Mesh geometry, material and map belong to the scene disposal traversal.
  }

  update(matrix: THREE.Matrix4 | null, title: string, dt: number, colors: { paper: string; ink: string; line: string }, reduced: boolean, hovered = Boolean(matrix)) {
    if (!matrix) { this.mesh.visible = false; this.progress = 0; return; }
    this.title = title;
    const target = Number(hovered);
    this.progress = reduced ? target : THREE.MathUtils.clamp(this.progress + (hovered ? 1 : -1) * dt / .3, 0, 1);
    this.mesh.visible = this.progress > 0;
    if (!this.mesh.visible) return;
    const { paper, ink, line } = colors;
    const key = [this.title, paper, ink, line, this.fontRevision].join("|");
    if (key !== this.paintKey) {
      this.paintKey = key;
      const c = this.canvas.getContext("2d")!;
      // Double-resolution texture and slightly stronger strokes retain detail
      // along the oblique cover plane; movement never repaints the glyphs.
      c.font = "500 78px MiSans, sans-serif";
      const rows: string[] = []; let row = "";
      for (const char of title) {
        if (row && c.measureText(row + char).width > 2016) { rows.push(row); row = ""; }
        row += char;
      }
      if (row) rows.push(row);
      const height = 96 + Math.max(1, rows.length) * 124;
      this.canvas.width = 2160; this.canvas.height = height;
      c.fillStyle = paper; c.fillRect(0, 0, 2160, height);
      c.fillStyle = line; c.fillRect(0, height - 6, 2160, 6);
      c.font = "500 78px MiSans, sans-serif"; c.textBaseline = "top"; c.fillStyle = ink;
      rows.forEach((text, i) => c.fillText(text, 72, 48 + i * 124));
      this.texture.needsUpdate = true;
      this.height = 5 * height / 2160;
    }
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    const edge = 3.76;
    const bottom = 3.92 - (this.height + 3.92 - edge) * (1 - eased);
    const visibleBottom = Math.max(edge, bottom);
    const visibleHeight = Math.max(0, bottom + this.height - visibleBottom);
    // Crop below the slot edge instead of fading or showing through the glass.
    // UV cropping preserves the full-size glyphs as the title rises/falls.
    const uv = this.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const lowerUV = (visibleBottom - bottom) / this.height;
    if (Math.abs(uv.getY(2) - lowerUV) > 1e-7) {
      uv.setY(2, lowerUV); uv.setY(3, lowerUV); uv.needsUpdate = true;
    }
    this.local.makeScale(5, visibleHeight, 1);
    this.local.setPosition(-2.5, visibleBottom, .255);
    this.mesh.matrix.multiplyMatrices(matrix, this.local);
    this.mesh.matrixWorldNeedsUpdate = true;
  }
}
