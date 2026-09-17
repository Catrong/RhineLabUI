// Isolated browser fixtures: serve real app code without editing production posts.
import { createServer } from "vite";
const variant = process.env.BLOG_FIXTURE || "unequal";
const counts =
  variant === "empty"
    ? []
    : variant === "single"
      ? [1]
      : [1, 2, 65, 3, 9, 17, 4, 32, 8, 12, 7];
const posts = counts
  .flatMap((count, lane) =>
    Array.from({ length: count }, (_, row) => ({
      slug: `category-${String(lane).padStart(2, "0")}-article-${String(row).padStart(3, "0")}`,
      title: `分类 ${lane} · 文章 ${row}`,
      description:
        "用于验证任意分类、不同文章数量和有限模型循环的本地测试内容。",
      category: `分类 ${lane}`,
      tags: ["测试"],
      date: "2026-09-17",
      author: "测试",
      markdown: "## 阅读测试\n\n这是本地浏览器验证用的文章，不进入正式构建。",
      minutes: 1,
    })),
  )
  .sort((a, b) => a.slug.localeCompare(b.slug));
const server = await createServer({
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
  plugins: [
    {
      name: "blog-verification-fixture",
      enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/").endsWith("/content/posts.json"))
          return JSON.stringify(
            posts.map(({ markdown, minutes, ...meta }) => meta),
          );
      },
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/posts.ts"))
          return `export const posts = ${JSON.stringify(posts)};`;
      },
    },
  ],
});
await server.listen();
console.log(
  `Blog fixture ${variant}: ${posts.length} articles, ${counts.length} categories at http://127.0.0.1:5176`,
);
