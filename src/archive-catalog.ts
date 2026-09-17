import type { Post } from "./blog-content.ts";

/** Logical content coordinates are independent of the finite rendering pool. */
export function createArchiveCatalog(posts: Pick<Post, "slug" | "category">[]) {
  const columns = [...new Set(posts.map((post) => post.category))];
  const lanes = columns.map((category) =>
    posts.flatMap((post, index) => (post.category === category ? [index] : [])),
  );
  const locations = new Map<
    number,
    { lane: number; row: number; slot: number }
  >();
  lanes.forEach((files, lane) =>
    files.forEach((index, row) =>
      locations.set(index, { lane, row: 12 + row, slot: index }),
    ),
  );
  const wrap = (value: number, count: number) =>
    count ? ((value % count) + count) % count : 0;
  return {
    columns,
    files: (lane: number) => lanes[wrap(lane, lanes.length)] ?? [],
    location: (index: number) =>
      locations.get(index) ?? { lane: 0, row: 12, slot: 0 },
    atCell: (lane: number, row: number) => {
      const files = lanes[wrap(lane, lanes.length)] ?? [];
      return files[wrap(row - 12, files.length)] ?? -1;
    },
  };
}
