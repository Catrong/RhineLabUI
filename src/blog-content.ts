export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  date: string;
  author: string;
  featured?: boolean;
}
export interface Post extends PostMeta {
  markdown: string;
  minutes: number;
}

/** Shared by the build check and the browser. Reject broken links before publishing. */
export function collectPosts(
  metadata: PostMeta[],
  files: Record<string, string>,
): Post[] {
  const slugs = new Set<string>();
  return metadata
    .map((meta) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug) || slugs.has(meta.slug))
        throw Error(`Invalid or duplicate post slug: ${meta.slug}`);
      slugs.add(meta.slug);
      for (const key of ["title", "description", "category", "author"] as const)
        if (typeof meta[key] !== "string" || !meta[key].trim())
          throw Error(`Missing ${key}: ${meta.slug}`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(meta.date) ||
        !Number.isFinite(Date.parse(meta.date)) ||
        new Date(meta.date).toISOString().slice(0, 10) !== meta.date
      )
        throw Error(`Invalid date: ${meta.slug}`);
      if (
        !Array.isArray(meta.tags) ||
        meta.tags.some((tag) => typeof tag !== "string" || !tag.trim()) ||
        new Set(meta.tags).size !== meta.tags.length
      )
        throw Error(`Invalid tags: ${meta.slug}`);
      const markdown = files[meta.slug];
      if (!markdown?.trim()) throw Error(`Missing Markdown: ${meta.slug}`);
      const chinese = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length;
      const words = (markdown.match(/[a-zA-Z0-9]+/g) ?? []).length;
      return {
        ...meta,
        markdown,
        minutes: Math.max(1, Math.ceil(chinese / 350 + words / 220)),
      };
    })
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
    );
}

export function queryPosts(
  posts: Post[],
  query: string,
  category: string,
  tag: string,
  order: string,
  saved?: Set<string>,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return posts
    .filter(
      (post) =>
        (!category || post.category === category) &&
        (!tag || post.tags.includes(tag)) &&
        (!saved || saved.has(post.slug)) &&
        terms.every((term) =>
          `${post.title} ${post.description} ${post.category} ${post.tags.join(" ")} ${post.author} ${post.markdown}`
            .toLocaleLowerCase()
            .includes(term),
        ),
    )
    .sort((a, b) =>
      order === "oldest"
        ? a.date.localeCompare(b.date)
        : order === "title"
          ? a.title.localeCompare(b.title, "zh-CN")
          : b.date.localeCompare(a.date),
    );
}
