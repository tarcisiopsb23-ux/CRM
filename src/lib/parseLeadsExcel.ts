import * as XLSX from "xlsx";
import type { CreateLeadInput } from "@/hooks/useLeadsKanban";

/** Normaliza nome da coluna para comparação (lowercase, trim, remove acentos) */
function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Mapeamento: nomes normalizados de coluna -> campo do lead */
const COLUMN_ALIASES: [string[], keyof CreateLeadInput][] = [
  [["empresa", "company", "nome empresa", "nome_empresa", "razao_social", "razao social"], "empresa"],
  [["nicho", "segmento"], "nicho"],
  [["cidade", "city", "municipio"], "cidade"],
  [["email", "e-mail", "e_mail", "mail"], "email"],
  [["telefone", "phone", "celular", "fone", "contato"], "telefone"],
  [["origem", "source"], "origem"],
  [["faturamento", "value", "valor", "receita"], "faturamento"],
  [["prioridade", "priority"], "prioridade"],
  [["responsavel", "responsavel_nome", "assigned_to"], "responsavel"],
];

function findColumnMapping(headers: string[]): Partial<Record<keyof CreateLeadInput, number>> {
  const mapping: Partial<Record<keyof CreateLeadInput, number>> = {};
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (!norm) continue;
    for (const [aliases, field] of COLUMN_ALIASES) {
      if (mapping[field] !== undefined) continue;
      const match = aliases.some(
        (a) => norm === a || norm.includes(a) || a.includes(norm)
      );
      if (match) {
        mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = toStr(v).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

const VALID_PRIORIDADES = ["baixa", "media", "alta", "urgente"] as const;

function toPrioridade(v: unknown): (typeof VALID_PRIORIDADES)[number] {
  const s = normalizeHeader(toStr(v));
  const found = VALID_PRIORIDADES.find((p) => s.includes(p) || p.includes(s));
  return found ?? "media";
}

/**
 * Parse arquivo Excel (.xlsx) e retorna array de CreateLeadInput.
 * Usa a primeira planilha. A primeira linha deve conter os cabeçalhos.
 */
export function parseLeadsFromExcel(file: File): Promise<CreateLeadInput[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error("Arquivo não pôde ser lido"));
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error("Planilha vazia"));
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        }) as unknown[][];

        if (raw.length < 2) {
          resolve([]);
          return;
        }

        const headerRow = raw[0] as string[];
        const headers = headerRow.map((h) => toStr(h));
        const mapping = findColumnMapping(headers);

        const results: CreateLeadInput[] = [];
        for (let r = 1; r < raw.length; r++) {
          const row = raw[r] as unknown[];
          const get = (field: keyof CreateLeadInput): unknown => {
            const idx = mapping[field];
            return idx !== undefined ? row[idx] : undefined;
          };

          const empresa = toStr(get("empresa"));
          if (!empresa) continue;

          const lead: CreateLeadInput = {
            empresa,
            nicho: toStr(get("nicho")) || undefined,
            cidade: toStr(get("cidade")) || undefined,
            email: toStr(get("email")) || undefined,
            telefone: toStr(get("telefone")) || undefined,
            origem: toStr(get("origem")) || undefined,
            faturamento: toNum(get("faturamento")),
            prioridade: toPrioridade(get("prioridade")),
            responsavel: toStr(get("responsavel")) || undefined,
          };
          results.push(lead);
        }
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
    reader.readAsArrayBuffer(file);
  });
}
