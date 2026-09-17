/** Stable category identity: editing article order does not change its color. */
export function categoryColor(category: string) {
  const known: Record<string, string> = {
    技术: "#739dbb",
    设计: "#c49a61",
    随笔: "#81a28b",
  };
  if (Object.hasOwn(known, category)) return known[category];
  let hash = 2166136261;
  for (const char of category)
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  return `hsl(${hash % 360}, 42%, 62%)`;
}
