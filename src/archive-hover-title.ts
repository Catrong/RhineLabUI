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
  private previous = "";
  private elapsed = 1;
  private fade = 1;
  private paintKey = "";
  private fontRevision = 0;
  private local = new THREE.Matrix4();
  private fontLoaded = () => { this.fontRevision++; };

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace;
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

  update(matrix: THREE.Matrix4 | null, title: string, dt: number, colors: { paper: string; ink: string; line: string }, reduced: boolean) {
    if (!matrix) { this.mesh.visible = false; return; }
    if (title !== this.title || !this.mesh.visible) {
      this.previous = this.mesh.visible ? this.title : "";
      this.title = title;
      this.elapsed = this.previous ? 0 : 1;
      if (!this.mesh.visible) this.fade = 0;
    }
    this.mesh.visible = true;
    this.elapsed = reduced ? 1 : Math.min(1, this.elapsed + dt / .46);
    this.fade = reduced ? 1 : Math.min(1, this.fade + dt / .22);
    const progress = 1 - Math.pow(1 - this.elapsed, 3);
    const { paper, ink, line } = colors;
    const key = [title, this.previous, progress, paper, ink, line, this.fontRevision].join("|");
    if (key !== this.paintKey) {
      this.paintKey = key;
      const c = this.canvas.getContext("2d")!;
      const wrap = (text: string) => {
        c.font = "39px MiSans, sans-serif";
        const rows: string[] = []; let row = "";
        for (const char of text) {
          if (row && c.measureText(row + char).width > 1008) { rows.push(row); row = ""; }
          row += char;
        }
        if (row) rows.push(row);
        return rows;
      };
      const rows = wrap(title), oldRows = progress < 1 ? wrap(this.previous) : [];
      const height = 48 + Math.max(1, rows.length, oldRows.length) * 62;
      this.canvas.width = 1080; this.canvas.height = height;
      c.fillStyle = paper; c.fillRect(0, 0, 1080, height);
      c.fillStyle = line; c.fillRect(0, height - 3, 1080, 3);
      c.save(); c.beginPath(); c.rect(36, 24, 1008, height - 48); c.clip();
      c.font = "39px MiSans, sans-serif"; c.textBaseline = "top"; c.fillStyle = ink;
      if (progress < 1) oldRows.forEach((row, i) => c.fillText(row, 36, 24 + i * 62 - progress * height));
      rows.forEach((row, i) => c.fillText(row, 36, 24 + i * 62 + (1 - progress) * height));
      c.restore();
      this.texture.needsUpdate = true;
    }
    this.mesh.material.opacity = this.fade;
    this.local.makeScale(5, 5 * this.canvas.height / 1080, 1);
    this.local.setPosition(-2.5, 3.92, .255);
    this.mesh.matrix.multiplyMatrices(matrix, this.local);
    this.mesh.matrixWorldNeedsUpdate = true;
  }
}
