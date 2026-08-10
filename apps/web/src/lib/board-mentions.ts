// Pure @mention parsing for the pizarrón. No DB or "@/" imports (unit-testable).
// A mention is an "@token" at the start of the text or after whitespace, so
// emails like mail@host don't count. Returns canonical usernames (dedup,
// case-insensitive match against the company's coworkers).

export function parseMentions(text: string, validUsernames: string[]): string[] {
  // Los usernames pueden tener espacios ("Augusto Finocchietti"), así que después
  // de cada "@" buscamos el nombre válido más largo que coincida.
  const sorted = [...validUsernames].filter(Boolean).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "@") continue;
    const prev = index === 0 ? " " : text[index - 1];
    if (!/\s/.test(prev)) continue; // el "@" debe abrir palabra (evita emails)
    const after = lower.slice(index + 1);
    for (const name of sorted) {
      const candidate = name.toLowerCase();
      if (!after.startsWith(candidate)) continue;
      const boundary = after[candidate.length];
      if (boundary === undefined || /[^a-z0-9]/i.test(boundary)) {
        found.add(name);
        break; // el más largo gana
      }
    }
  }
  return Array.from(found);
}
