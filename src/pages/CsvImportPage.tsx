import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { parseCsvFile } from "@/lib/csvParser";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type AuthSession = {
  client_id: string;
  email: string;
};

// Fields available for mapping (req 11.4)
const CRM_FIELDS = [
  { value: "name", label: "Nome (name)" },
  { value: "phone", label: "Telefone (phone)" },
  { value: "email", label: "E-mail (email)" },
  { value: "address", label: "Endereço (address)" },
  { value: "company", label: "Empresa (company)" },
  { value: "origin", label: "Origem (origin)" },
  { value: "notes", label: "Observações (notes)" },
  { value: "proposal_value", label: "Valor Proposta (proposal_value)" },
  { value: "potential_value", label: "Valor Potencial (potential_value)" },
  { value: "temperature", label: "Temperatura (temperature)" },
  { value: "status", label: "Status (status)" },
];

const IGNORE_VALUE = "__ignore__";

type ImportReport = {
  total: number;
  success: number;
  skipped: { row: number; reason: string }[];
};

type Step = "upload" | "mapping" | "importing" | "done";

export function CsvImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const getSession = (): AuthSession | null => {
    const raw = localStorage.getItem("client_auth");
    if (!raw) return null;
    return JSON.parse(raw);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    const result = await parseCsvFile(file);

    if (result.error) {
      setFileError(result.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (result.headers.length === 0) {
      setFileError("O arquivo CSV está vazio ou não contém cabeçalhos.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setHeaders(result.headers);
    setPreviewRows(result.rows.slice(0, 5));
    setAllRows(result.rows);

    // Auto-map columns that match CRM field names (case-insensitive)
    const autoMap: Record<string, string> = {};
    result.headers.forEach((h) => {
      const match = CRM_FIELDS.find(
        (f) => f.value.toLowerCase() === h.toLowerCase()
      );
      autoMap[h] = match ? match.value : IGNORE_VALUE;
    });
    setColumnMapping(autoMap);
    setStep("mapping");
  };

  const handleImport = async () => {
    const session = getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    setStep("importing");

    const skipped: { row: number; reason: string }[] = [];
    let successCount = 0;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const record: Record<string, string | number | null> = {
        client_id: session.client_id,
      };

      // Build record from mapping
      Object.entries(columnMapping).forEach(([csvCol, crmField]) => {
        if (crmField === IGNORE_VALUE) return;
        const val = row[csvCol]?.trim() ?? "";
        if (val === "") return;

        if (crmField === "proposal_value" || crmField === "potential_value") {
          const num = parseFloat(val.replace(",", "."));
          record[crmField] = isNaN(num) ? null : num;
        } else {
          record[crmField] = val;
        }
      });

      // Req 11.6: skip rows with empty name
      const nameVal = record["name"];
      if (!nameVal || String(nameVal).trim() === "") {
        skipped.push({ row: i + 2, reason: "Campo 'name' vazio ou ausente" });
        continue;
      }

      const { error } = await supabase.from("crm_leads").insert(record);
      if (error) {
        skipped.push({ row: i + 2, reason: `Erro ao inserir: ${error.message}` });
      } else {
        successCount++;
      }
    }

    setReport({
      total: allRows.length,
      success: successCount,
      skipped,
    });
    setStep("done");
    toast.success(`Importação concluída: ${successCount} leads importados.`);
  };

  const handleReset = () => {
    setStep("upload");
    setHeaders([]);
    setPreviewRows([]);
    setAllRows([]);
    setColumnMapping({});
    setReport(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              Importar Leads via CSV
            </h1>
            <p className="text-slate-400 text-sm">
              Importe uma lista de leads a partir de um arquivo CSV
            </p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-[#7C3AED]">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Upload className="h-5 w-5 text-[#7C3AED]" />
                Selecionar Arquivo CSV
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Suporta separadores vírgula (,) e ponto-e-vírgula (;). Tamanho máximo: 5 MB.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-[#7C3AED] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-bold">Clique para selecionar o arquivo CSV</p>
                <p className="text-slate-500 text-xs mt-1">ou arraste e solte aqui</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
              {fileError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{fileError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Mapping */}
        {step === "mapping" && (
          <div className="space-y-6">
            {/* Preview */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#7C3AED]" />
                  Prévia do Arquivo (primeiras {previewRows.length} linhas)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-3 text-slate-400 font-black uppercase tracking-wider whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {previewRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          {headers.map((h) => (
                            <td key={h} className="py-2 px-3 text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                              {row[h] || <span className="text-slate-600 italic">vazio</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-500 text-xs mt-3">
                  Total de linhas no arquivo: <span className="text-slate-300 font-bold">{allRows.length}</span>
                </p>
              </CardContent>
            </Card>

            {/* Column Mapping */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-violet-500">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  Mapeamento de Colunas
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Associe cada coluna do CSV ao campo correspondente em crm_leads. Colunas não mapeadas serão ignoradas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {headers.map((header) => (
                    <div key={header} className="space-y-1.5">
                      <Label className="text-slate-300 text-xs font-bold uppercase tracking-wide">
                        {header}
                      </Label>
                      <Select
                        value={columnMapping[header] ?? IGNORE_VALUE}
                        onValueChange={(val) =>
                          setColumnMapping((prev) => ({ ...prev, [header]: val }))
                        }
                      >
                        <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200 h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                          <SelectItem value={IGNORE_VALUE} className="text-slate-500 focus:bg-slate-800">
                            — Ignorar coluna —
                          </SelectItem>
                          {CRM_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value} className="focus:bg-slate-800">
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    onClick={handleReset}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1"
                    onClick={handleImport}
                  >
                    Confirmar Mapeamento e Importar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-[#7C3AED]" />
              <p className="text-white font-bold text-lg">Importando leads...</p>
              <p className="text-slate-400 text-sm">Aguarde enquanto os registros são inseridos.</p>
            </CardContent>
          </Card>
        )}

        {/* Step: Done — Report */}
        {step === "done" && report && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#1E293B] border-slate-800">
                <CardContent className="pt-6 text-center">
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest mb-1">Total Processado</p>
                  <p className="text-4xl font-black text-white">{report.total}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#1E293B] border-emerald-500/30 border">
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1" />
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest mb-1">Importados</p>
                  <p className="text-4xl font-black text-emerald-400">{report.success}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#1E293B] border-orange-500/30 border">
                <CardContent className="pt-6 text-center">
                  <XCircle className="h-6 w-6 text-orange-400 mx-auto mb-1" />
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest mb-1">Ignorados</p>
                  <p className="text-4xl font-black text-orange-400">{report.skipped.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Skipped rows detail */}
            {report.skipped.length > 0 && (
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
                <CardHeader>
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                    Linhas Ignoradas ({report.skipped.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {report.skipped.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 text-xs py-2 border-b border-slate-800 last:border-0"
                      >
                        <span className="text-slate-500 font-mono shrink-0">Linha {s.row}</span>
                        <span className="text-orange-300">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={handleReset}
              >
                Nova Importação
              </Button>
              <Button
                className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Back button (upload step) */}
        {step === "upload" && (
          <Button
            variant="outline"
            className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white h-11"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}
