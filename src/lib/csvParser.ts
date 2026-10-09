export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function detectSeparator(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      resolve({
        headers: [],
        rows: [],
        error: `O arquivo excede o limite máximo de 5 MB. Tamanho atual: ${(file.size / 1024 / 1024).toFixed(2)} MB.`,
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      let text = event.target?.result as string;

      // Remove UTF-8 BOM if present (req 11.9)
      if (text.startsWith("\uFEFF")) {
        text = text.slice(1);
      }

      const lines = text.split(/\r?\n/);
      const nonEmptyLines = lines.filter((line) => line.trim() !== "");

      if (nonEmptyLines.length === 0) {
        resolve({ headers: [], rows: [] });
        return;
      }

      const separator = detectSeparator(nonEmptyLines[0]);
      const headers = nonEmptyLines[0].split(separator).map((h) => h.trim());

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < nonEmptyLines.length; i++) {
        const values = nonEmptyLines[i].split(separator).map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ?? "";
        });
        rows.push(row);
      }

      resolve({ headers, rows });
    };

    reader.onerror = () => {
      resolve({
        headers: [],
        rows: [],
        error: "Erro ao ler o arquivo. Verifique se o arquivo é válido.",
      });
    };

    reader.readAsText(file, "UTF-8");
  });
}
