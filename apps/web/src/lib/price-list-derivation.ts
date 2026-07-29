// Pure derivation engine for price lists. No DB or "@/" imports (unit-testable).
// Turns per-list rules (over cost or over a parent list + %) into the effective
// multiplier per (list, category) that the existing pricing reads from
// `margenes_listas`.

export type ListRule = {
  id: number;
  derivationType: "costo" | "lista";
  parentId: number | null;
  percentage: number;
};

function roundMultiplier(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

export function computeListMultipliers(
  lists: ListRule[],
  baseMargins: Map<string, number>,
): Map<number, Map<string, number>> {
  const rulesById = new Map(lists.map((list) => [list.id, list]));
  const result = new Map<number, Map<string, number>>();
  const visiting = new Set<number>();

  function resolve(id: number): Map<string, number> {
    const cached = result.get(id);
    if (cached) return cached;
    const rule = rulesById.get(id);
    if (!rule) throw new Error(`Lista ${id} inexistente en la derivación`);
    if (visiting.has(id)) throw new Error(`Derivación con ciclo en la lista ${id}`);
    visiting.add(id);

    const factor = 1 + rule.percentage / 100;
    const multipliers = new Map<string, number>();

    if (rule.derivationType === "lista") {
      if (rule.parentId == null) throw new Error(`La lista ${id} deriva de otra pero no tiene lista padre`);
      const parent = resolve(rule.parentId);
      for (const [category, value] of parent) {
        multipliers.set(category, roundMultiplier(value * factor));
      }
    } else {
      for (const [category, base] of baseMargins) {
        multipliers.set(category, roundMultiplier(base * factor));
      }
    }

    visiting.delete(id);
    result.set(id, multipliers);
    return multipliers;
  }

  for (const list of lists) resolve(list.id);
  return result;
}
