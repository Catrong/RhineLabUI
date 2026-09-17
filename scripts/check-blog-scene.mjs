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
test("extraction opens first, clears the cover, then closes before reader handoff", () => {
  assert.equal(documentExtraction(0).spread, 0);
  assert.equal(documentExtraction(0.65).spread, 1);
  assert.equal(documentExtraction(0.65).paperX, 0);
  for (let t = 0.65; t < 1.75; t += 0.01)
    assert.equal(documentExtraction(t).spread, 1);
  for (let t = 1.75; t < 2.4; t += 0.01) {
    const f = documentExtraction(t);
    assert.equal(f.paperX, 5.5);
    assert.equal(f.paperOpacity, 1);
  }
  assert.ok(Math.abs(documentExtraction(2.4).spread) < 1e-12);
  assert.ok(documentExtraction(3.05).handoff > 0.999);
  assert.equal(
    documentExtraction(DOCUMENT_EXTRACTION_DURATION - 0.001).paperOpacity,
    1,
  );
  const end = documentExtraction(DOCUMENT_EXTRACTION_DURATION);
  assert.equal(end.spread, 0);
  assert.equal(end.paperOpacity, 0);
  assert.equal(end.phase, "reading");
});
test("fresh settings default to performance without overriding saved custom settings", () => {
  assert.deepEqual(normalizeQuality(undefined), qualityPresets.performance);
  assert.deepEqual(normalizeQuality(qualityPresets.high), qualityPresets.high);
});
