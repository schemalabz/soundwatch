// The comparison set: up to four places, held side by side on the summary.
// Four is the most lines a reader separates on one chart without a key in
// hand, and the most small grids that fit one row.

export const MAX_COMPARE = 4;

// One colour per slot, assigned in the order places are added. Ink and the
// sound accent come first because one or two places is the common case; the
// other two are picked to stay apart from both and from each other for the
// common colour-vision deficiencies (blue and violet against orange).
export const COMPARE_COLORS = ["#0e0e1c", "#f68b24", "#2a78d6", "#8a4fd0"] as const;

/** Add the id, or remove it if present. A full set ignores additions. */
export function toggleCompare(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= MAX_COMPARE) return [...ids];
  return [...ids, id];
}
