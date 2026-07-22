export type SearchOptionLike = {
  label: string;
  searchText?: string;
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function tokenScore(queryToken: string, candidateTokens: string[]) {
  let best = Number.NEGATIVE_INFINITY;
  for (const candidate of candidateTokens) {
    if (candidate === queryToken) best = Math.max(best, 120);
    else if (candidate.startsWith(queryToken)) best = Math.max(best, 105 - (candidate.length - queryToken.length));
    else if (candidate.includes(queryToken)) best = Math.max(best, 90 - candidate.indexOf(queryToken));
    else if (queryToken.length >= 4) {
      const tolerance = queryToken.length >= 8 ? 2 : 1;
      const distance = editDistance(queryToken, candidate, tolerance);
      if (distance <= tolerance) best = Math.max(best, 70 - distance * 10);
    }
  }
  return best;
}

export function searchOptionScore(option: SearchOptionLike, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 1;

  const candidate = normalizeSearchText(`${option.label} ${option.searchText ?? ""}`);
  if (!candidate) return Number.NEGATIVE_INFINITY;
  if (candidate === query) return 1_000;
  if (candidate.startsWith(query)) return 900 - candidate.length;
  const fullMatchIndex = candidate.indexOf(query);
  if (fullMatchIndex >= 0) return 800 - fullMatchIndex;

  const candidateTokens = candidate.split(" ");
  const queryTokens = query.split(" ");
  let score = 0;
  for (const token of queryTokens) {
    const match = tokenScore(token, candidateTokens);
    if (!Number.isFinite(match)) return Number.NEGATIVE_INFINITY;
    score += match;
  }
  return score;
}

export function rankSearchOptions<T extends SearchOptionLike>(options: T[], query: string, limit = 40) {
  return options
    .map((option, index) => ({ option, index, score: searchOptionScore(option, query) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.option);
}
