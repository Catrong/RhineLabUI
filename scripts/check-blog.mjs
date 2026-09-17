import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { collectPosts, queryPosts } from "../src/blog-content.ts";

const meta = JSON.parse(
  await readFile(new URL("../content/posts.json", import.meta.url), "utf8"),
);
const dir = new URL("../content/posts/", import.meta.url);
const files = Object.fromEntries(
  await Promise.all(
    (await readdir(dir))
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => [
        file.slice(0, -3),
        await readFile(new URL(file, dir), "utf8"),
      ]),
  ),
);
const posts = collectPosts(meta, files);

test("published articles have unique stable URLs and corresponding Markdown", () => {
  assert.equal(posts.length, meta.length);
  assert.deepEqual(
    new Set(Object.keys(files)),
    new Set(meta.map((post) => post.slug)),
    "Remove orphan Markdown or add its metadata",
  );
  for (const post of posts) {
    for (const match of post.markdown.matchAll(/\]\(#\/post\/([a-z0-9-]+)\)/g))
      assert.ok(
        posts.some((item) => item.slug === match[1]),
        `Broken article link: ${match[1]}`,
      );
  }
});
test("invalid content is rejected before publishing", () => {
  const base = {
    slug: "test",
    title: "标题",
    description: "摘要",
    category: "技术",
    tags: ["指南"],
    date: "2026-09-17",
    author: "作者",
  };
  for (const bad of [
    { slug: "../escape" },
    { date: "2026-02-30" },
    { title: " " },
    { tags: ["重复", "重复"] },
    { author: undefined },
  ]) {
    assert.throws(() => collectPosts([{ ...base, ...bad }], { test: "正文" }));
  }
  assert.throws(() => collectPosts([base, base], { test: "正文" }));
  assert.throws(() => collectPosts([base], {}));
});
test("content count and category count are independent of the 3D array", () => {
  const sample = Array.from({ length: 53 }, (_, i) => ({
    slug: `note-${i}`,
    title: `笔记 ${i}`,
    description: "摘要",
    category: `分类 ${i % 7}`,
    tags: [],
    date: "2026-09-17",
    author: "作者",
  }));
  const result = collectPosts(
    sample,
    Object.fromEntries(sample.map((post) => [post.slug, "文章正文"])),
  );
  assert.equal(result.length, 53);
  assert.equal(new Set(result.map((post) => post.category)).size, 7);
  assert.equal(collectPosts([], {}).length, 0);
});
test("search matches body and intersects category, tag and saved filters", () => {
  const sample = collectPosts(
    [
      {
        slug: "one",
        title: "First",
        description: "摘要",
        category: "技术",
        tags: ["指南"],
        date: "2026-09-17",
        author: "作者",
      },
      {
        slug: "two",
        title: "Second",
        description: "摘要",
        category: "设计",
        tags: ["指南"],
        date: "2026-09-16",
        author: "作者",
      },
    ],
    { one: "正文 contains NEEDLE", two: "正文 contains needle" },
  );
  assert.deepEqual(
    queryPosts(sample, "needle 正文", "技术", "指南", "newest").map(
      (p) => p.slug,
    ),
    ["one"],
  );
  assert.equal(
    queryPosts(sample, "needle", "技术", "不存在", "newest").length,
    0,
  );
  assert.deepEqual(
    queryPosts(sample, "needle", "", "", "oldest", new Set(["two"])).map(
      (p) => p.slug,
    ),
    ["two"],
  );
  assert.deepEqual(
    queryPosts(sample, "", "", "", "oldest").map((p) => p.slug),
    ["two", "one"],
  );
  assert.equal(queryPosts(sample, "不存在", "", "", "newest").length, 0);
});
