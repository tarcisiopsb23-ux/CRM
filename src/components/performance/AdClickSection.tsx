import {
  BarChart, Bar, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { MousePointerClick, TrendingUp, Target, Megaphone, ExternalLink } from "lucide-react";
import type { AdClickStats } from "@/hooks/useAdClickSessions";

const SOURCE_COLORS: Record<string, string> = {
  google: "#4285F4",
  facebook: "#1877F2",
  instagram: "#E1306C",
  direto: "#7C3AED",
};

function getSourceColor(source: string) {
  return SOURCE_COLORS[source.toLowerCase()] ?? "#64748b";
}

function StatCard({ icon: Icon, label, value, sub, color = "text-white" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-white/50" />
        <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">{label}</p>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-[10px] mt-1 text-white/40">{sub}</p>}
    </div>
  );
}

interface Props {
  stats: AdClickStats;
  isLoading: boolean;
  hasGtm: boolean;
  hasPixel: boolean;
}

export function AdClickSection({ stats, isLoading, hasGtm, hasPixel }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 animate-pulse h-48" />
    );
  }

  const noTracking = !hasGtm && !hasPixel;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase font-black tracking-widest text-white/50 mb-1">
            Cliques de Anúncios
          </p>
          <p className="text-white/60 text-xs">
            Cliques capturados via link intermediário (/wa) com atribuição de campanha
          </p>
        </div>
        <div className="flex gap-2">
          {hasGtm && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <TrendingUp className="h-3 w-3" /> GTM ativo
            </span>
          )}
          {hasPixel && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Target className="h-3 w-3" /> Pixel ativo
            </span>
          )}
        </div>
      </div>

      {/* Aviso se não tem tracking configurado */}
      {noTracking && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
          <Megaphone className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-300 font-bold text-sm">GTM e Meta Pixel não configurados</p>
            <p className="text-amber-400/70 text-xs mt-1">
              Configure o GTM ID e/ou Meta Pixel ID em Perfil → Integrações para ativar o rastreamento de conversões nas plataformas de anúncios.
              Os cliques via link intermediário já estão sendo capturados independentemente.
            </p>
          </div>
        </div>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={MousePointerClick} label="Total de Cliques" value={stats.totalClicks} color="text-emerald-400" />
        <StatCard icon={Megaphone} label="Campanhas" value={stats.uniqueCampaigns} />
        <StatCard
          icon={Target}
          label="Taxa de Conversão"
          value={`${stats.conversionRate.toFixed(1)}%`}
          sub="cliques com lead associado"
          color={stats.conversionRate > 10 ? "text-emerald-400" : "text-amber-400"}
        />
        <StatCard
          icon={TrendingUp}
          label="Fontes"
          value={stats.bySource.length}
          sub={stats.bySource[0]?.source ?? "—"}
        />
      </div>

      {stats.totalClicks === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
          <MousePointerClick className="h-10 w-10 mx-auto mb-3 text-white/20" />
          <p className="text-white/50 font-bold">Nenhum clique registrado no período</p>
          <p className="text-white/30 text-xs mt-1">
            Use o Gerador de Link em Perfil → Integrações para criar links rastreados para seus anúncios
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cliques por dia */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Cliques por Dia</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={stats.byDay}>
                <defs>
                  <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "#ffffff50", fontSize: 10 }}
                  tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fill: "#ffffff50", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  labelStyle={{ color: "#fff" }} itemStyle={{ color: "#a78bfa" }}
                />
                <Area type="monotone" dataKey="clicks" stroke="#7C3AED" fill="url(#clickGrad)" strokeWidth={2} name="Cliques" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Cliques por fonte */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Cliques por Fonte</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.bySource} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#ffffff50", fontSize: 10 }} />
                <YAxis type="category" dataKey="source" tick={{ fill: "#ffffff80", fontSize: 11 }} width={70} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  labelStyle={{ color: "#fff" }} itemStyle={{ color: "#10b981" }}
                />
                <Bar dataKey="clicks" name="Cliques" radius={[0, 4, 4, 0]}
                  fill="#7C3AED" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela de campanhas */}
          {stats.byCampaign.length > 0 && (
            <div className="md:col-span-2 rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Top Campanhas</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-[10px] uppercase font-black tracking-widest text-white/40 pb-3">Campanha</th>
                      <th className="text-left text-[10px] uppercase font-black tracking-widest text-white/40 pb-3">Fonte</th>
                      <th className="text-right text-[10px] uppercase font-black tracking-widest text-white/40 pb-3">Cliques</th>
                      <th className="text-right text-[10px] uppercase font-black tracking-widest text-white/40 pb-3">% do Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stats.byCampaign.slice(0, 8).map(c => (
                      <tr key={c.campaign} className="hover:bg-white/5 transition-colors">
                        <td className="py-2.5 text-white font-medium">{c.campaign}</td>
                        <td className="py-2.5">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: getSourceColor(c.source) + "20", color: getSourceColor(c.source) }}>
                            {c.source}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-white font-black">{c.clicks}</td>
                        <td className="py-2.5 text-right text-white/60 text-xs">
                          {stats.totalClicks > 0 ? ((c.clicks / stats.totalClicks) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info sobre GTM/Pixel */}
      {(hasGtm || hasPixel) && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/50 space-y-1">
          <p className="font-bold text-white/70">Rastreamento ativo nas plataformas:</p>
          {hasGtm && <p>• GTM: eventos <code className="text-blue-400">whatsapp_click</code> e <code className="text-blue-400">conversion</code> enviados ao Google Analytics</p>}
          {hasPixel && <p>• Meta Pixel: eventos <code className="text-indigo-400">Lead</code> e <code className="text-indigo-400">Purchase</code> enviados ao Gerenciador de Anúncios</p>}
          <p className="mt-2 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Veja os resultados completos no Google Analytics e Meta Ads Manager
          </p>
        </div>
      )}
    </div>
  );
}
