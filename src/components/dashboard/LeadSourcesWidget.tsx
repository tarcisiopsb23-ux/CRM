import { useState } from "react";
import { useLeadsBySource } from "@/hooks/useLeadsBySource";
import { useOrganization } from "@/hooks/useOrganization";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Users, Megaphone, MessageCircle, FileSpreadsheet, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { label: "Últimos 7 dias",   value: "7" },
  { label: "Últimos 30 dias",  value: "30" },
  { label: "Últimos 90 dias",  value: "90" },
  { label: "Últimos 180 dias", value: "180" },
  { label: "Último ano",       value: "365" },
];

const SOURCE_ICONS: Record<string, React.ElementType> = {
  "Campanha":     Megaphone,
  "WhatsApp":     MessageCircle,
  "Manual / CSV": FileSpreadsheet,
  "Outros":       HelpCircle,
};

export function LeadSourcesWidget() {
  const organizationId = useOrganization();
  const [days, setDays] = useState("30");
  const { data, isLoading } = useLeadsBySource(organizationId, Number(days));

  const sources = data?.sources ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
            <Users className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-foreground">Origem dos Leads</h3>
            <p className="text-[10px] text-muted-foreground">por canal de captação</p>
          </div>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-[140px] text-xs border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Total badge */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black font-display text-foreground">
          {isLoading ? "—" : total}
        </span>
        <span className="text-xs text-muted-foreground font-medium">leads no período</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
          <Users className="h-8 w-8 opacity-20" />
          <p className="text-xs">Nenhum lead no período selecionado.</p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={sources} barSize={32} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="source" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number) => [`${v} leads`, ""]}
                labelStyle={{ fontWeight: "bold", color: "hsl(var(--foreground))" }}
                cursor={{ fill: "hsl(var(--accent))" }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {sources.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Source breakdown cards */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            {sources.map((s) => {
              const Icon = SOURCE_ICONS[s.source] ?? HelpCircle;
              const pct = total > 0 ? ((s.count / total) * 100).toFixed(0) : "0";
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: s.color + "20" }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">{s.source}</span>
                      <span className="text-xs font-black text-foreground">{s.count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
