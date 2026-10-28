/**
 * ContentStatusDistributionTable
 * Tabela compacta: contagem de itens por status e por plataforma (distribuição).
 * Duas colunas: Status dos conteúdos | Distribuição por plataforma (donut).
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentStatus } from "@/hooks/useContentItems";

const STATUS_ROWS: { status: ContentStatus; label: string; dotClass: string }[] = [
  { status: "briefing",             label: "Briefing",             dotClass: "bg-slate-400" },
  { status: "producao",             label: "Produção",             dotClass: "bg-blue-500" },
  { status: "revisao_interna",      label: "Revisão interna",      dotClass: "bg-amber-500" },
  { status: "aguardando_aprovacao", label: "Aguardando cliente",   dotClass: "bg-violet-500" },
  { status: "aprovado",             label: "Aprovado",             dotClass: "bg-emerald-500" },
  { status: "reprovado",            label: "Reprovado",            dotClass: "bg-red-500" },
  { status: "publicado",            label: "Publicado",            dotClass: "bg-green-500" },
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#e1306c",
  facebook:  "#1877f2",
  linkedin:  "#0077b5",
  tiktok:    "#000000",
  youtube:   "#ff0000",
  google:    "#fbbc05",
  email:     "#64748b",
  outro:     "#94a3b8",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook:  "Facebook",
  linkedin:  "LinkedIn",
  tiktok:    "TikTok",
  youtube:   "YouTube",
  google:    "Google",
  email:     "E-mail",
  outro:     "Outro",
};

interface Props {
  items:   ContentItem[];
  loading: boolean;
}

export function ContentStatusDistributionTable({ items, loading }: Props) {
  if (loading) return <Skeleton className="h-52 w-full rounded-xl" />;

  // Contagem por status
  const statusCounts = STATUS_ROWS.map(row => ({
    ...row,
    count: items.filter(i => i.status === row.status).length,
  }));

  // Contagem por plataforma
  const platformMap: Record<string, number> = {};
  for (const item of items) {
    const p = item.platform ?? "outro";
    platformMap[p] = (platformMap[p] ?? 0) + 1;
  }
  const platformData = Object.entries(platformMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name: PLATFORM_LABELS[name] ?? name, value, color: PLATFORM_COLORS[name] ?? "#94a3b8" }));

  const total = items.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Status dos conteúdos */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
          Status dos conteúdos
        </p>
        {statusCounts.map(row => (
          <div key={row.status} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
            <span className={cn("h-2 w-2 rounded-full shrink-0", row.dotClass)} />
            <span className="text-sm flex-1 text-foreground/80">{row.label}</span>
            <Badge variant="secondary" className="text-xs min-w-[24px] justify-center tabular-nums">
              {row.count}
            </Badge>
          </div>
        ))}
      </div>

      {/* Distribuição por plataforma — donut */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
          Distribuição por plataforma
        </p>
        {platformData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {platformData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background:   "var(--card)",
                    border:       "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize:     "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Legenda lateral */}
            <div className="flex-1 space-y-1 min-w-0">
              {platformData.map(p => (
                <div key={p.name} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className="flex-1 truncate text-foreground/70">{p.name}</span>
                  <span className="font-medium tabular-nums">
                    {total > 0 ? Math.round((p.value / total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
