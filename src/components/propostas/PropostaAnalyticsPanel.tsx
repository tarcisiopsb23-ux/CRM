import { Eye, MousePointer, Clock, Smartphone, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useProposalAnalytics } from "@/hooks/useProposalAnalytics";

interface Props { proposalId: string }

const fmtDate = (d: string) => {
  try { return format(parseISO(d), "dd/MM/yy HH:mm", { locale: ptBR }); }
  catch { return d; }
};

export function PropostaAnalyticsPanel({ proposalId }: Props) {
  const { data, isLoading } = useProposalAnalytics(proposalId);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando analytics...</div>;
  }
  if (!data) return null;

  const { totalViews, totalAccesses, avgSessionSecs, lastAccessedAt, topDevice, recentAccesses } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" /> Visualizações
            </p>
            <p className="text-xl font-bold mt-0.5">{totalViews}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MousePointer className="h-3 w-3" /> Acessos
            </p>
            <p className="text-xl font-bold mt-0.5">{totalAccesses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Tempo médio
            </p>
            <p className="text-xl font-bold mt-0.5">
              {avgSessionSecs > 0
                ? `${Math.floor(avgSessionSecs / 60)}m${avgSessionSecs % 60}s`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Último acesso</p>
            <p className="text-sm font-semibold mt-0.5">
              {lastAccessedAt ? fmtDate(lastAccessedAt) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {topDevice === "mobile" ? (
                <Smartphone className="h-3 w-3" />
              ) : (
                <Monitor className="h-3 w-3" />
              )}
              Dispositivo
            </p>
            <p className="text-sm font-semibold mt-0.5 capitalize">
              {topDevice ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {recentAccesses.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Últimos acessos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Dispositivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAccesses.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{fmtDate(a.date)}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {a.ip ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{a.city ?? "—"}</TableCell>
                    <TableCell className="text-sm capitalize">
                      {a.device ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
