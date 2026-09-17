import * as THREE from "three";
import { visibleCell, LOOP_COLUMNS, LOOP_ROWS, type ArchiveCell } from "./archive-loop.ts";

/** Cache topology between physical pool boundaries, never spring/selection boundaries. */
export class ArchiveWindow {
  private key = "";
  rows: ArchiveCell[][] = [];
  cells: ArchiveCell[] = [];
  update(center: ArchiveCell) {
    const key = `${Math.floor(center.lane + .5)}:${Math.floor(center.row)}`;
    if (key === this.key) return this.rows;
    this.key = key;
    const rows = new Map<number, ArchiveCell[]>();
    for (let i = 0; i < LOOP_COLUMNS * LOOP_ROWS; i++) {
      const cell = visibleCell(i, center);
      if (!rows.has(cell.row)) rows.set(cell.row, []);
      rows.get(cell.row)!.push(cell);
    }
    this.rows = [...rows.values()].sort((a, b) => a[0].row - b[0].row);
    this.cells = this.rows.flat();
    return this.rows;
  }
}

/** Members arriving together share one clock; retained cards never restart. */
export class ArchiveArrival {
  private births = new Map<string, number>();
  private seen = new Set<string>();
  private initialized = false;
  begin() { this.seen.clear(); }
  sample(cell: ArchiveCell, time: number, immediate: boolean, origin: ArchiveCell) {
    const key = `${cell.lane + origin.lane}:${cell.row + origin.row}`;
    this.seen.add(key);
    if (!this.births.has(key)) this.births.set(key, immediate || !this.initialized ? time - .22 : time);
    if (immediate) this.births.set(key, time - .22);
    const t = Math.min(1, Math.max(0, (time - this.births.get(key)!) / .22));
    return t * t * (3 - 2 * t);
  }
  end() {
    for (const key of this.births.keys()) if (!this.seen.has(key)) this.births.delete(key);
    this.initialized = true;
  }
}

/** Coverage fade retains opaque/transmission ordering and depth in every pass. */
export function archiveArrivalMaterial(material: THREE.Material) {
  const before = material.onBeforeCompile, cache = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.vertexShader = "#ifdef USE_INSTANCING\nattribute float archivePresence;\n#endif\nvarying float vArchivePresence;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvArchivePresence = 1.0;\n#ifdef USE_INSTANCING\nvArchivePresence = archivePresence;\n#endif");
    shader.fragmentShader = "varying float vArchivePresence;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", "void main() {\nfloat archiveCoverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));\nif (vArchivePresence <= archiveCoverage) discard;");
  };
  material.customProgramCacheKey = () => `${cache()}-archive-arrival-v1`;
}
