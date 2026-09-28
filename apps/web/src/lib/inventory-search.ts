import { normalizeSearchText, rankSearchOptions } from "@/lib/search-options";

export type InventorySearchCandidate = {
  id: string;
  name: string;
  sku: string | null;
  categoryCode: string | null;
  category: string | null;
  supplier: string | null;
};

export function rankInventoryProductMatches<T extends InventorySearchCandidate>(
  candidates: T[],
  query: string,
  limit: number,
) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const nameMatches = candidates.filter((candidate) => {
    const normalizedName = normalizeSearchText(candidate.name);
    return tokens.length > 0 && tokens.every((token) => normalizedName.includes(token));
  });
  const candidatesToRank = nameMatches.length ? nameMatches : candidates;
  const searchableCandidates = candidatesToRank.map((candidate) => ({
    candidate,
    label: candidate.name,
    searchText: [candidate.sku, candidate.categoryCode, candidate.category, candidate.supplier]
      .filter(Boolean)
      .join(" "),
  }));
  const directMatches = rankSearchOptions(searchableCandidates, query, limit);
  if (directMatches.length) return directMatches.map((match) => match.candidate);

  const typoMatches = new Map<string, T>();
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    for (let index = 0; index < token.length - 1; index++) {
      if (token[index] === token[index + 1]) continue;
      const correctedToken = `${token.slice(0, index)}${token[index + 1]}${token[index]}${token.slice(index + 2)}`;
      const correctedQuery = tokens.map((value, currentIndex) => currentIndex === tokenIndex ? correctedToken : value).join(" ");
      for (const match of rankSearchOptions(searchableCandidates, correctedQuery, limit)) {
        typoMatches.set(match.candidate.id, match.candidate);
        if (typoMatches.size >= limit) return Array.from(typoMatches.values());
      }
    }
  }
  return Array.from(typoMatches.values());
}
