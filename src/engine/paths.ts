/**
 * paths.ts — pure helpers for splitting a Servarr series/movie path into
 * { root folder, folder name } and reassembling it. Framework-free, unit-tested.
 *
 * Paths are POSIX (forward slashes) as the *arr apps run on Linux.
 */

const trimTrailing = (p: string): string => p.replace(/\/+$/, '');

/**
 * The root folder that contains `itemPath`: the longest root that is `itemPath`
 * itself or a parent prefix of it (matched on a path boundary, so `/tv` does not
 * match `/tv2/...`). Returns null if none match.
 */
export function matchRoot(itemPath: string, roots: string[]): string | null {
  const p = trimTrailing(itemPath);
  const matches = roots
    .map(trimTrailing)
    .filter((r) => p === r || p.startsWith(r + '/'))
    // Longest (most specific) root wins.
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

/**
 * The folder-name portion of `itemPath` relative to `root` (the last segment(s)
 * under the root). Empty string if `root` isn't a prefix of `itemPath`.
 */
export function folderNameFrom(itemPath: string, root: string): string {
  const p = trimTrailing(itemPath);
  const r = trimTrailing(root);
  if (!(p === r || p.startsWith(r + '/'))) return '';
  return p.slice(r.length).replace(/^\/+/, '');
}

/**
 * Reassemble a full path from a root + folder name. A blank folder name yields
 * just the root. Leading/trailing slashes on the folder name are normalized.
 */
export function joinPath(root: string, folderName: string): string {
  const r = trimTrailing(root);
  const fn = folderName.replace(/^\/+|\/+$/g, '');
  return fn ? `${r}/${fn}` : r;
}
