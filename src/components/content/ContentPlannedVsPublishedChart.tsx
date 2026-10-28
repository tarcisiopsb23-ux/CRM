/**
 * ContentPlannedVsPublishedChart
 * Gráfico de barras agrupadas: Planejado vs. Publicado por tipo de conteúdo.
 * Usa Recharts (já instalado no projeto).
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContentItem } from "@/hooks/useContentItems";

interface Props {
  items:   ContentItem[];
  loading: boolean;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  post:      "Post",
  reels:     "Reels",
  story:     "Story",
  carousel:  "Carrossel",
  email:     "E-mail",
  roteiro:   "Roteiro",
  banner:    "Banner",
  video:     "Vídeo",
  outro:     "Outro",
};

export function ContentPlannedVsPublishedChart({ items, loading }: Props) {
  if (loading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (items.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  // Agrupa por content_type: planejados (não arquivados) vs publicados
  const map: Record<string, { type: string; planejado: number; publicado: number }> = {};
  for (const item of items) {
    const t = item.content_type ?? "outro";
    if (!map[t]) map[t] = { type: CONTENT_TYPE_LABELS[t] ?? t, planejado: 0, publicado: 0 };
    map[t].planejado++;
    if (item.status === "publicado") map[t].publicado++;
  }

  const data = Object.values(map)
    .sort((a, b) => b.planejado - a.planejado)
    .slice(0, 7); // máximo 7 tipos para não poluir

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={2} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
        <XAxis
          dataKey="type"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={24}
        />
        <Tooltip
          contentStyle={{
            background:   "var(--card)",
            border:       "1px solid var(--border)",
            borderRadius: "8px",
            fontSize:     "12px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="planejado" name="Planejado" fill="#6366f1" radius={[3, 3, 0, 0]} />
        <Bar dataKey="publicado" name="Publicado"  fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
