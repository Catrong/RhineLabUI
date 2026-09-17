import metadata from "../content/posts.json" with { type: "json" };
const posts = [...metadata].sort(
  (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
);
import { createArchiveCatalog } from "./archive-catalog.ts";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
}

// The legacy record shape is a presentation adapter, never a second content store.
export const records: ArchiveRecord[] = posts.map((post, index) => ({
  id: `X-${String(index + 1).padStart(3, "0")}`,
  title: post.title,
  en: post.slug.toUpperCase(),
  department: post.category,
  category: post.category,
  date: post.date,
  lead: post.author,
  clearance: "BLOG ARTICLE",
  abstract: post.description,
  findings: [post.description],
  source: `#/post/${post.slug}`,
}));
const catalog = createArchiveCatalog(posts);
export const archiveColumns = catalog.columns;
export const categories = ["全部文章", ...archiveColumns];
export const columnFiles = catalog.files;
export const fileLocation = catalog.location;
export const fileAtSlot = (index: number) =>
  records.length
    ? ((index % records.length) + records.length) % records.length
    : -1;
export const fileAtCoordinates = catalog.atCell;
