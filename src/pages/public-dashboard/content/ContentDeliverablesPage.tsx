/**
 * ContentDeliverablesPage — entregáveis do cliente no C8 Control.
 * Visualização de relatórios e possibilidade de gerar PDF (window.print).
 */

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, BarChart2, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useClientContentDeliverables } from "@/hooks/useClientContent";

export function ContentDeliverablesPage() {
  const { auth }  = useClientAuth();
  const clientId  = auth?.id ?? "";
  const printRef  = useRef<HTMLDivElement>(null);

  const { data: deliverables, isLoading } = useClientContentDeliverables(clientId);

  function handlePrint(deliverableId: string) {
    const deliverable = deliverables?.find(d => d.id === deliverableId);
    if (!deliverable) return;

    toast.info("No diálogo, selecione 'Salvar como PDF' como destino.", { duration: 5000 });

    // Monta HTML do relatório
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { font-family: Calibri, sans-serif; font-size: 12pt; color: #000; }
          @page { margin: 20mm; }
          h1 { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 8pt; }
          h2 { font-size: 13pt; font-weight: bold; margin: 14pt 0 6pt; border-bottom: 1px solid #888; padding-bottom: 3pt; }
          p  { margin: 3pt 0; }
          .meta { color: #555; font-size: 10pt; text-align: center; margin-bottom: 20pt; }
          table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
          th, td { border: 1px solid #ccc; padding: 5pt 8pt; text-align: left; font-size: 11pt; }
          th { background: #f0f0f0; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>${deliverable.title}</h1>
        <p class="meta">
          ${deliverable.period_start && deliverable.period_end
            ? `Período: ${format(parseISO(deliverable.period_start), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(deliverable.period_end), "dd/MM/yyyy", { locale: ptBR })}`
            : ""}
          &nbsp;|&nbsp; Gerado em ${format(new Date(), "dd/MM/yyyy", { locale: ptBR })}
        </p>

        ${deliverable.description ? `<h2>Resumo</h2><p>${deliverable.description}</p>` : ""}

        <h2>Resultados</h2>
        <table>
          <tr><th>Indicador</th><th>Resultado</th></tr>
          <tr><td>Itens Publicados</td><td>${deliverable.items_count}</td></tr>
          ${deliverable.reach_total > 0 ? `<tr><td>Alcance Total</td><td>${deliverable.reach_total.toLocaleString("pt-BR")}</td></tr>` : ""}
          ${deliverable.engagement_total > 0 ? `<tr><td>Engajamento Total</td><td>${deliverable.engagement_total.toLocaleString("pt-BR")}</td></tr>` : ""}
        </table>

        ${deliverable.summary_notes ? `<h2>Observações</h2><p>${deliverable.summary_notes}</p>` : ""}
      </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Permita pop-ups para gerar o PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-black text-white tracking-tight">Entregáveis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Relatórios de desempenho do conteúdo produzido para sua marca.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !deliverables?.length ? (
        <div className="rounded-xl border border-[#1E293B] bg-[#0F172A]/50 p-10 text-center">
          <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nenhum entregável disponível ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {deliverables.map(d => (
            <Card key={d.id} className="border border-[#1E293B] bg-[#0F172A]">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold text-white leading-snug">
                    {d.title}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs border-[#334155] text-slate-300 hover:bg-[#1E293B] shrink-0"
                    onClick={() => handlePrint(d.id)}
                  >
                    <Download className="h-3 w-3 mr-1" />PDF
                  </Button>
                </div>
                {(d.period_start || d.period_end) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {d.period_start && format(parseISO(d.period_start), "dd/MM/yy", { locale: ptBR })}
                    {d.period_start && d.period_end && " – "}
                    {d.period_end && format(parseISO(d.period_end), "dd/MM/yy", { locale: ptBR })}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2">
                  <MetricBox label="Publicados" value={d.items_count} />
                  {d.reach_total > 0 && (
                    <MetricBox label="Alcance" value={d.reach_total.toLocaleString("pt-BR")} />
                  )}
                  {d.engagement_total > 0 && (
                    <MetricBox label="Engajamento" value={d.engagement_total.toLocaleString("pt-BR")} />
                  )}
                </div>

                {d.summary_notes && (
                  <p className="text-xs text-slate-400 line-clamp-2">{d.summary_notes}</p>
                )}

                {d.campaign_title && (
                  <Badge variant="outline" className="border-[#334155] text-slate-400 text-[10px]">
                    {d.campaign_title}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#1E293B] rounded-lg p-2.5 text-center">
      <p className="text-sm font-black text-white">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
