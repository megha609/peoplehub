export function normalizeDisplayName(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeComparisonName(value) {
  return normalizeDisplayName(value).toLowerCase();
}
