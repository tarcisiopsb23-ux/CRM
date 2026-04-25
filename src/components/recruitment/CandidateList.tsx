import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScoreBadge } from "./ScoreBadge";
import { CandidateStatusBadge } from "./CandidateStatusBadge";
import type { Application, ApplicationStatus } from "@/types/recruitment";

const STATUS_OPTIONS: { value: ApplicationStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "em_analise", label: "Em análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "contratado", label: "Contratado" },
];

interface Props {
  applications: Application[];
  isLoading: boolean;
  onSelect: (application: Application) => void;
}

export function CandidateList({ applications, isLoading, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  const filtered = applications.filter((a) => {
    const name = a.candidate?.full_name ?? "";
    const email = a.candidate?.email ?? "";
    const matchSearch =
      !search ||
      name.toLowerCase().includes(search.toLowerCase()) ||
      email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const pct = a.score_percent ?? 0;
    const matchMin = !minScore || pct >= Number(minScore);
    const matchMax = !maxScore || pct <= Number(maxScore);
    return matchSearch && matchStatus && matchMin && matchMax;
  });

  const fmtDate = (iso: string) => {
    try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
    catch { return "—"; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Buscar candidato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder="Score mín %"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-28"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="number"
            placeholder="Score máx %"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            className="w-28"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Carregando candidatos...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {applications.length === 0 ? "Nenhum candidato ainda." : "Nenhum candidato encontrado com os filtros aplicados."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidato</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Currículo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(a)}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{a.candidate?.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{a.candidate?.email ?? "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(a.applied_at)}</TableCell>
                  <TableCell>
                    <ScoreBadge
                      percent={a.score_percent ?? 0}
                      total={a.score_total ?? 0}
                      max={a.score_max ?? 0}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <CandidateStatusBadge status={a.status} size="sm" />
                  </TableCell>
                  <TableCell>
                    {a.candidate?.resume_drive_url ? (
                      <a
                        href={a.candidate.resume_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver currículo
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
