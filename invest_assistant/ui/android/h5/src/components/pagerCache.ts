const MAX_PAGER_CACHE_SIZE = 3;

export function touchPagerCache<T>(
  keys: readonly T[],
  key: T,
  protectedKeys: readonly T[] = []
) {
  const next = [...new Set(keys.filter((candidate) => candidate !== key)), key];
  const protectedSet = new Set([...protectedKeys, key]);
  while (next.length > MAX_PAGER_CACHE_SIZE) {
    const evictionIndex = next.findIndex((candidate) => !protectedSet.has(candidate));
    next.splice(evictionIndex >= 0 ? evictionIndex : 0, 1);
  }
  return next;
}
