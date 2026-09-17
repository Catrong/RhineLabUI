import assert from "node:assert/strict";
import { test } from "node:test";
import { createArchiveCatalog } from "../src/archive-catalog.ts";
import {
  documentExtraction,
  DOCUMENT_EXTRACTION_DURATION,
} from "../src/document-extraction.ts";
import { normalizeQuality, qualityPresets } from "../src/render-quality.ts";
import {
  fileAtCell,
  selectionCell,
  visibleCell,
  LOOP_COLUMNS,
  LOOP_ROWS,
  wrap,
} from "../src/archive-loop.ts";
import {
  records,
  archiveColumns,
  columnFiles,
  fileLocation,
} from "../src/data.ts";

test("bookcase content and categories are the blog, not forty legacy records", async () => {
  const { readFile } = await import("node:fs/promises");
  const posts = JSON.parse(
    await readFile(new URL("../content/posts.json", import.meta.url), "utf8"),
  );
  assert.equal(records.length, posts.length);
  assert.deepEqual(
    new Set(records.map((p) => p.title)),
    new Set(posts.map((p) => p.title)),
  );
  assert.deepEqual(
    new Set(archiveColumns),
    new Set(posts.map((p) => p.category)),
  );
});
test("arbitrary unequal category sizes, more than 32 articles, one and zero", () => {
  for (const counts of [[], [1], [41], [1, 2, 65, 3, 9, 17, 4, 32, 8, 12, 7]]) {
    const input = counts.flatMap((count, lane) =>
      Array.from({ length: count }, (_, row) => ({
        slug: `${lane}-${row}`,
        category: `分类${lane}`,
      })),
    );
    const catalog = createArchiveCatalog(input);
    assert.equal(catalog.columns.length, counts.length);
    assert.equal(
      new Set(input.map((_, i) => catalog.location(i).slot)).size,
      input.length,
    );
    input.forEach((_, i) => {
      const cell = catalog.location(i);
      for (const period of [-100, 0, 100])
        assert.equal(
          catalog.atCell(
            cell.lane + counts.length * period,
            cell.row + counts[cell.lane] * period,
          ),
          i,
        );
    });
    if (!input.length) {
      assert.equal(catalog.atCell(0, 0), -1);
      assert.deepEqual(catalog.files(0), []);
    }
  }
});
test("actual bookcase crosses row and category seams continuously with lane memory", () => {
  if (!records.length) return;
  for (const direction of [-1, 1]) {
    let index = 0,
      cell = fileLocation(index);
    const memory = archiveColumns.map((_, lane) => columnFiles(lane)[0]);
    for (let i = 0; i < 10000; i++) {
      const axis = i % 17 < 10 ? "row" : "lane";
      const lane = fileLocation(index).lane,
        files = columnFiles(lane);
      index =
        axis === "row"
          ? files[wrap(files.indexOf(index) + direction, files.length)]
          : memory[wrap(lane + direction, archiveColumns.length)];
      const next = selectionCell(index, cell, { axis, direction });
      assert.equal(next[axis] - cell[axis], direction);
      assert.equal(fileAtCell(next), index);
      memory[fileLocation(index).lane] = index;
      cell = { ...next, slot: index };
    }
  }
});
test("render pool remains 288 unique physical positions even at distant coordinates", () => {
  for (const center of [
    { lane: 0, row: 12 },
    { lane: -8000.4, row: 92000.7 },
    { lane: 137, row: 1041 },
  ]) {
    const cells = Array.from({ length: LOOP_COLUMNS * LOOP_ROWS }, (_, i) =>
      visibleCell(i, center),
    );
    assert.equal(cells.length, 288);
    assert.equal(new Set(cells.map((c) => `${c.lane}:${c.row}`)).size, 288);
  }
});
test("glass clears before paper moves; a single clock drives extraction and travel", () => {
  assert.equal(documentExtraction(0).clarity, 0);
  assert.ok(
    documentExtraction(0.32).clarity > 0 &&
      documentExtraction(0.32).clarity < 1,
  );
  assert.equal(documentExtraction(0.65).clarity, 1);
  assert.equal(documentExtraction(0.85).paperX, 0);
  let previous = 0;
  for (let t = 0.85; t < 3.15; t += 0.005) {
    const frame = documentExtraction(t);
    assert.ok(frame.motion >= previous);
    previous = frame.motion;
    assert.equal(frame.clarity, 1);
    assert.equal(frame.paperOpacity, 1);
    if (frame.paperX < 5.5) {
      assert.equal(frame.spread, 1);
      assert.equal(frame.handoff, 0);
    }
    if (frame.handoff > 0) assert.equal(frame.paperX, 5.5);
  }
  const overlap = documentExtraction(2.15);
  assert.equal(overlap.revealContent, true);
  assert.equal(overlap.paperOpacity, 1);
  assert.ok(overlap.handoff > 0 && overlap.handoff < 1);
  assert.equal(documentExtraction(1.6).revealContent, false);
  assert.ok(documentExtraction(3.15).handoff > 0.999);
  assert.equal(documentExtraction(3.15).spread, 0);
  const end = documentExtraction(DOCUMENT_EXTRACTION_DURATION);
  assert.equal(end.phase, "reading");
  assert.equal(end.paperOpacity, 0);
});

test("fresh settings default to performance without overriding saved custom settings", () => {
  assert.deepEqual(normalizeQuality(undefined), qualityPresets.performance);
  assert.deepEqual(normalizeQuality(qualityPresets.high), qualityPresets.high);
});

test("category color is stable and applied to individual and instanced label shaders", async () => {
  const { categoryColor } = await import("../src/category-color.ts");
  const { themeMaterial, setCategoryTint } =
    await import("../src/theme-material.ts");
  const THREE = await import("three");
  assert.equal(new Set(["技术", "设计", "随笔"].map(categoryColor)).size, 3);
  assert.equal(typeof categoryColor("constructor"), "string");
  assert.equal(typeof categoryColor("__proto__"), "string");
  assert.equal(
    categoryColor("长分类 / 自定义"),
    categoryColor("长分类 / 自定义"),
  );
  for (const instanced of [false, true]) {
    const material = new THREE.MeshPhysicalMaterial();
    themeMaterial(material, "Index_Inlay", instanced);
    const shader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(shader, {});
    assert.ok(shader.uniforms.rhineCategoryTint);
    assert.ok(
      shader.fragmentShader.includes(
        instanced ? "vArchiveCategory" : "rhineCategoryTint",
      ),
    );
    if (instanced)
      assert.ok(
        shader.vertexShader.includes("attribute vec3 archiveCategory;"),
      );
    const group = new THREE.Group(),
      geometry = new THREE.BoxGeometry();
    group.add(new THREE.Mesh(geometry, material));
    const color = new THREE.Color(categoryColor("技术"));
    setCategoryTint(group, color);
    assert.ok(shader.uniforms.rhineCategoryTint.value.equals(color));
    geometry.dispose();
    material.dispose();
  }
});


test("hover title uses scene depth, follows the cover plane, and stops repainting at rest", async () => {
  const { ArchiveHoverTitle } = await import("../src/archive-hover-title.ts");
  const THREE = await import("three");
  const original = globalThis.document;
  let paints = 0;
  const listeners = new Set();
  const context = {
    measureText: text => ({ width: text.length * 39 }),
    fillRect() { paints++; }, fillText() {}, save() {}, restore() {},
    beginPath() {}, rect() {}, clip() {},
  };
  globalThis.document = {
    createElement: () => ({ width: 300, height: 150, getContext: () => context }),
    fonts: { addEventListener: (_, cb) => listeners.add(cb), removeEventListener: (_, cb) => listeners.delete(cb) },
  };
  try {
    const title = new ArchiveHoverTitle();
    const matrix = new THREE.Matrix4().makeRotationY(.4).setPosition(2, 3, -4);
    const colors = { paper: "#eae5e1", ink: "#080a08", line: "#aaa59a" };
    title.update(matrix, "文章标题", 1, colors, true);
    assert.equal(title.mesh.material.depthTest, true);
    assert.equal(title.mesh.material.depthWrite, true);
    assert.equal(title.mesh.layers.mask, 2 ** 31);
    assert.equal(title.mesh.visible, true);
    const anchor = new THREE.Vector3().applyMatrix4(title.mesh.matrix);
    const expected = new THREE.Vector3(-2.5, 3.92, .255).applyMatrix4(matrix);
    assert.ok(anchor.distanceTo(expected) < 1e-8);
    const corner = new THREE.Vector3(1, 0, 0).applyMatrix4(title.mesh.matrix);
    assert.ok(corner.distanceTo(new THREE.Vector3(2.5, 3.92, .255).applyMatrix4(matrix)) < 1e-8);
    const count = paints;
    title.update(matrix, "文章标题", .016, colors, false);
    assert.equal(paints, count);
    title.update(matrix, "文章标题", .1, colors, false, false);
    assert.equal(title.mesh.visible, true);
    assert.equal(title.mesh.material.opacity, 1);
    assert.equal(paints, count, "retraction does not redraw or animate letters");
    const retreatHeight = title.mesh.matrix.elements[5];
    title.update(matrix, "文章标题", .05, colors, false, true);
    assert.ok(title.mesh.matrix.elements[5] > retreatHeight, "re-hover reverses from the current height");
    title.update(matrix, "文章标题", 1, colors, false, false);
    assert.equal(title.mesh.visible, false);
    title.update(matrix, "下一篇", .016, colors, false);
    assert.equal(title.mesh.visible, true);
    assert.equal(title.mesh.material.map.image.width, 2160);
    title.update(null, "", .016, colors, false);
    assert.equal(title.mesh.visible, false);
    title.dispose();
    assert.equal(listeners.size, 0);
    title.mesh.geometry.dispose(); title.mesh.material.map.dispose(); title.mesh.material.dispose();
  } finally { globalThis.document = original; }
});


test("sharp title pass preserves scene color and restores renderer state", async () => {
  const { SharpTitleRenderer } = await import("../src/sharp-title-renderer.ts");
  const THREE = await import("three");
  const pass = new SharpTitleRenderer(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const background = new THREE.Color("white"); scene.background = background;
  const target = {}; let currentTarget = target; const calls = [];
  const renderer = {
    autoClear: true, shadowMap: { needsUpdate: true },
    getRenderTarget: () => currentTarget,
    setRenderTarget: value => { currentTarget = value; },
    clearDepth: () => calls.push("depth-only-clear"),
    render: () => {
      assert.equal(renderer.autoClear, false);
      assert.equal(scene.background, null);
      assert.equal(currentTarget, null);
      calls.push({ mask: camera.layers.mask, colorWrite: scene.overrideMaterial?.colorWrite });
    },
  };
  pass.render(renderer, scene, camera);
  assert.deepEqual(calls, ["depth-only-clear", { mask: 1, colorWrite: false }, { mask: 2 ** 31, colorWrite: undefined }]);
  assert.equal(scene.background, background);
  assert.equal(scene.overrideMaterial, null);
  assert.equal(camera.layers.mask, 1);
  assert.equal(renderer.autoClear, true);
  assert.equal(currentTarget, target);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  renderer.render = () => { throw Error("test render failure"); };
  assert.throws(() => pass.render(renderer, scene, camera), /test render failure/);
  assert.equal(scene.background, background);
  assert.equal(camera.layers.mask, 1);
  assert.equal(renderer.autoClear, true);
  assert.equal(currentTarget, target);
  pass.dispose();
});
