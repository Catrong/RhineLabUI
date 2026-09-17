import { readFile, readdir, mkdir, writeFile, unlink } from "node:fs/promises";
import { collectPosts } from "../src/blog-content.ts";
const root = new URL("../", import.meta.url);
const metadata = JSON.parse(
  await readFile(new URL("content/posts.json", root), "utf8"),
);
const sources = Object.fromEntries(
  await Promise.all(
    (await readdir(new URL("content/posts/", root)))
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => [
        name.slice(0, -3),
        await readFile(new URL(`content/posts/${name}`, root), "utf8"),
      ]),
  ),
);
const posts = collectPosts(metadata, sources);
const output = new URL("public/archives/", root);
await mkdir(output, { recursive: true });
const filenames = new Set(posts.map((post) => `${post.slug}.md`));
for (const name of await readdir(output))
  if (name.endsWith(".md") && !filenames.has(name))
    await unlink(new URL(name, output));
for (const post of posts)
  await writeFile(
    new URL(`${post.slug}.md`, output),
    `# ${post.title}\n\n${post.author} · ${post.date} · ${post.category}\n\n${post.markdown}`,
    "utf8",
  );
console.log(`Prepared ${posts.length} downloadable blog articles.`);
