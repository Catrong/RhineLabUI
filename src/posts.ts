import metadata from "../content/posts.json" with { type: "json" };
import { collectPosts } from "./blog-content";

const sources = import.meta.glob("../content/posts/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
export const posts = collectPosts(
  metadata,
  Object.fromEntries(
    Object.entries(sources).map(([path, text]) => [
      path.split("/").at(-1)!.slice(0, -3),
      text,
    ]),
  ),
);
