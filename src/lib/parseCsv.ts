export function parseCsvText(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const first = lines[0] ?? "";
  const commaCount = (first.match(/,/g) ?? []).length;
  const semiCount = (first.match(/;/g) ?? []).length;
  const delimiter = semiCount > commaCount ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === delimiter) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const rawHeaders = parseLine(first);
  const headers = rawHeaders.map((h, i) => (h ? h : `col_${i + 1}`));

  const rows: Array<Record<string, string>> = [];
  for (let r = 1; r < lines.length; r++) {
    const values = parseLine(lines[r] ?? "");
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = values[i] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

