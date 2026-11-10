export const seededOrgCatalogs = {
  schemaVersion: 1,
  godowns: {
    cement: { name: "CEMENT", active: true },
    paints: { name: "PAINTS", active: true },
    hardware: { name: "HARDWARE", active: true },
    steel: { name: "STEEL", active: true },
    "roofing-sheets": {
      name: "ROOFING SHEETS",
      active: true,
    },
    "tile-sanitary": {
      name: "TILE & SANITARY",
      active: true,
    },
    "tile2-sanitary-timber-local": {
      name: "TILE2, SANITARY & TIMBER (LOCAL)",
      active: true,
    },
    "tile2-sanitary-timber-imported": {
      name: "TILE2, SANITARY & TIMBER (IMPORTED)",
      active: true,
    },
    "timber-workshop": { name: "TIMBER WORKSHOP", active: true },
  },
  jobRoles: {
    loader: { name: "Loader", active: true },
    supervisor: { name: "Supervisor", active: true },
    clerk: { name: "Clerk", active: true },
    "it-clerk": { name: "IT Clerk", active: true },
  },
  departments: {},
};

export function catalogEntries(catalog, { includeArchived = false } = {}) {
  if (!catalog || typeof catalog !== "object") return [];
  return Object.entries(catalog)
    .map(([id, entry]) => ({ id, ...entry }))
    .filter((entry) => includeArchived || entry.active === true)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function findCatalogEntryByName(catalog, name) {
  if (typeof name !== "string") return null;
  const normalized = name.trim().toLocaleLowerCase();
  return (
    catalogEntries(catalog, { includeArchived: true }).find(
      (entry) =>
        entry.name.trim().toLocaleLowerCase() === normalized ||
        (entry.legacyAliases || []).some(
          (alias) => alias.trim().toLocaleLowerCase() === normalized,
        ),
    ) || null
  );
}

export function createCatalogId(name) {
  const prefix =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "item";
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${suffix}`;
}
