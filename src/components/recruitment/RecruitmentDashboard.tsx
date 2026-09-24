import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Briefcase, Users, Clock, CheckCircle2 } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScoreBadge } from "./ScoreBadge";
import { CandidateStatusBadge } from "./CandidateStatusBadge";
import type { JobOpening, Application } from "@/types/recruitment";

interface Props {
  openings: (JobOpening & { candidate_count?: number; new_candidate_count?: number })[];
  applications: Application[];
  isLoadingOpenings: boolean;
  isLoadingApplications: boolean;
}

export function RecruitmentDashboard({ openings, applications, isLoadingOpenings, isLoadingApplications }: Props) {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  const stats = useMemo(() => {
    const openCount = openings.filter((o) => o.status === "aberta").length;
    const recent = applications.filter((a) => {
      try { return parseISO(a.applied_at) >= thirtyDaysAgo; }
      catch { return false; }
    }).length;
    const inAnalysis = applications.filter((a) => a.status === "em_analise").length;
    const approved = applications.filter((a) => a.status === "aprovado").length;
    return { openCount, recent, inAnalysis, approved };
  }, [openings, applications]);

  // Bar chart data: candidaturas por vaga
  const chartData = useMemo(() => {
    return openings
      .filter((o) => o.status === "aberta")
      .map((o) => ({
        name: o.title.length > 20 ? o.title.slice(0, 18) + "…" : o.title,
        candidatos: o.candidate_count ?? 0,
      }))
      .sort((a, b) => b.candidatos - a.candidatos)
      .slice(0, 10);
  }, [openings]);

  // Top 5 candidates by score
  const top5 = useMemo(() => {
    return [...applications]
      .sort((a, b) => (b.score_percent ?? 0) - (a.score_percent ?? 0))
      .slice(0, 5);
  }, [applications]);

  // Open vacancies summary
  const openVacancies = useMemo(() => {
    return openings.filter((o) => o.status === "aberta");
  }, [openings]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
    catch { return "—"; }
  };

  return (
    <div className="space-y-6">
      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Vagas abertas"
          value={isLoadingOpenings ? "…" : stats.openCount}
          icon={Briefcase}
          color="text-blue-600"
        />
        <StatCard
          label="Candidaturas (30 dias)"
          value={isLoadingApplications ? "…" : stats.recent}
          icon={Users}
          color="text-emerald-600"
        />
        <StatCard
          label="Em análise"
          value={isLoadingApplications ? "…" : stats.inAnalysis}
          icon={Clock}
          color="text-yellow-600"
        />
        <StatCard
          label="Aprovados"
          value={isLoadingApplications ? "…" : stats.approved}
          icon={CheckCircle2}
          color="text-emerald-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabela de vagas abertas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vagas abertas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {openVacancies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma vaga aberta.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vaga</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Novos</TableHead>
                    <TableHead>Encerra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openVacancies.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[140px]">{o.title}</p>
                        {o.department && <p className="text-xs text-muted-foreground">{o.department}</p>}
                      </TableCell>
                      <TableCell className="text-center text-sm">{o.candidate_count ?? 0}</TableCell>
                      <TableCell className="text-center">
                        {(o.new_candidate_count ?? 0) > 0 ? (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                            {o.new_candidate_count}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(o.closes_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top 5 candidatos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top 5 candidatos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum candidato ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top5.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[120px]">{a.candidate?.full_name ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {a.job_opening?.title ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ScoreBadge percent={a.score_percent ?? 0} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidaturas por vaga</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="candidatos" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Briefcase;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/60">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
