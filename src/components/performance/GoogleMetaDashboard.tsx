import {
  AreaChart, Area, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, DollarSign, MousePointerClick, Users, Target, Zap } from "lucide-react";
import type { GA4Metrics, GoogleAdsMetrics } from "@/hooks/useGoogleAnalytics";
import type { MetaAdsMetrics } from "@/hooks/useMetaAds";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

function MetricCard({ icon: Icon, label, value, sub, color = "text-white" }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
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

function SectionHeader({ logo, title, sub }: { logo: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {logo}
      <div>
        <p className="text-white font-black">{title}</p>
        <p className="text-white/50 text-xs">{sub}</p>
      </div>
    </div>
  );
}

const GoogleLogo = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const MetaLogo = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

function NotConnected({ provider, onConnect }: { provider: string; onConnect: () => void }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
      <p className="text-white/50 font-bold mb-2">{provider} não conectado</p>
      <p className="text-white/30 text-xs mb-4">Conecte sua conta em Perfil → Integrações para ver os dados aqui</p>
      <button onClick={onConnect}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors">
        Conectar agora
      </button>
    </div>
  );
}

interface Props {
  ga4: GA4Metrics | null | undefined;
  gads: GoogleAdsMetrics | null | undefined;
  meta: MetaAdsMetrics | null | undefined;
  googleConnected: boolean;
  metaConnected: boolean;
  isLoadingGoogle: boolean;
  isLoadingMeta: boolean;
  onConnectGoogle: () => void;
  onConnectMeta: () => void;
}

export function GoogleMetaDashboard({
  ga4, gads, meta,
  googleConnected, metaConnected,
  isLoadingGoogle, isLoadingMeta,
  onConnectGoogle, onConnectMeta,
}: Props) {
  return (
    <div className="space-y-8">

      {/* ── GOOGLE ── */}
      <div className="space-y-4">
        <SectionHeader
          logo={<GoogleLogo />}
          title="Google Analytics 4 + Google Ads"
          sub="Dados de sessões, conversões e gastos do Google"
        />

        {!googleConnected ? (
          <NotConnected provider="Google" onConnect={onConnectGoogle} />
        ) : isLoadingGoogle ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 animate-pulse h-32" />
        ) : !ga4 && !gads ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center text-white/40 text-sm">
            Nenhum dado disponível. Verifique se o GA4 Property ID e o Google Ads Customer ID estão configurados.
          </div>
        ) : (
          <div className="space-y-4">
            {/* GA4 Cards */}
            {ga4 && (
              <>
                <p className="text-[10px] uppercase font-black tracking-widest text-white/40">Google Analytics 4</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard icon={Users} label="Sessões" value={fmtNum(ga4.sessions)} />
                  <MetricCard icon={Users} label="Usuários" value={fmtNum(ga4.users)} sub={`${fmtNum(ga4.newUsers)} novos`} />
                  <MetricCard icon={Target} label="Conversões" value={fmtNum(ga4.conversions)} color="text-emerald-400" />
                  <MetricCard icon={TrendingUp} label="Taxa de Rejeição" value={fmtPct(ga4.bounceRate)} color={ga4.bounceRate > 60 ? "text-red-400" : "text-emerald-400"} />
                </div>

                {ga4.byDay.length > 0 && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Sessões e Conversões por Dia</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={ga4.byDay}>
                        <defs>
                          <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4285F4" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4285F4" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: "#ffffff50", fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fill: "#ffffff50", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#fff" }} />
                        <Area type="monotone" dataKey="sessions" stroke="#4285F4" fill="url(#sessGrad)" strokeWidth={2} name="Sessões" />
                        <Area type="monotone" dataKey="conversions" stroke="#34A853" fill="none" strokeWidth={2} name="Conversões" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* Google Ads Cards */}
            {gads && (
              <>
                <p className="text-[10px] uppercase font-black tracking-widest text-white/40 mt-4">Google Ads</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard icon={DollarSign} label="Investimento" value={fmtBRL(gads.spend)} color="text-violet-400" />
                  <MetricCard icon={MousePointerClick} label="Cliques" value={fmtNum(gads.clicks)} sub={`CTR ${fmtPct(gads.ctr)}`} />
                  <MetricCard icon={Target} label="Conversões" value={fmtNum(gads.conversions)} sub={`CPA ${fmtBRL(gads.cpa)}`} color="text-emerald-400" />
                  <MetricCard icon={Zap} label="ROAS" value={`${gads.roas.toFixed(2)}x`} color={gads.roas >= 3 ? "text-emerald-400" : "text-amber-400"} />
                </div>

                {gads.byCampaign.length > 0 && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Campanhas Google Ads</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            {["Campanha", "Investimento", "Cliques", "Conversões", "ROAS"].map(h => (
                              <th key={h} className="text-left text-[10px] uppercase font-black tracking-widest text-white/40 pb-3 pr-4">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {gads.byCampaign.slice(0, 8).map(c => (
                            <tr key={c.campaign} className="hover:bg-white/5 transition-colors">
                              <td className="py-2.5 text-white font-medium pr-4 max-w-[200px] truncate">{c.campaign}</td>
                              <td className="py-2.5 text-violet-400 font-bold pr-4">{fmtBRL(c.spend)}</td>
                              <td className="py-2.5 text-white/70 pr-4">{fmtNum(c.clicks)}</td>
                              <td className="py-2.5 text-emerald-400 font-bold pr-4">{fmtNum(c.conversions)}</td>
                              <td className="py-2.5 font-black" style={{ color: c.roas >= 3 ? "#34d399" : c.roas >= 1 ? "#fbbf24" : "#f87171" }}>
                                {c.roas.toFixed(2)}x
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── META ── */}
      <div className="space-y-4">
        <SectionHeader
          logo={<MetaLogo />}
          title="Meta Ads (Facebook + Instagram)"
          sub="Dados de campanhas, leads e gastos do Meta"
        />

        {!metaConnected ? (
          <NotConnected provider="Meta" onConnect={onConnectMeta} />
        ) : isLoadingMeta ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 animate-pulse h-32" />
        ) : !meta ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center text-white/40 text-sm">
            Nenhum dado disponível. Verifique se o Meta Ad Account ID está configurado.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={DollarSign} label="Investimento" value={fmtBRL(meta.spend)} color="text-blue-400" />
              <MetricCard icon={Users} label="Alcance" value={fmtNum(meta.reach)} sub={`${fmtNum(meta.impressions)} impressões`} />
              <MetricCard icon={Target} label="Leads" value={fmtNum(meta.leads)} sub={`CPL ${fmtBRL(meta.cpl)}`} color="text-emerald-400" />
              <MetricCard icon={Zap} label="ROAS" value={`${meta.roas.toFixed(2)}x`} color={meta.roas >= 3 ? "text-emerald-400" : "text-amber-400"} />
            </div>

            {meta.byDay.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Investimento e Leads por Dia</p>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={meta.byDay}>
                    <defs>
                      <linearGradient id="metaSpendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1877F2" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1877F2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "#ffffff50", fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fill: "#ffffff50", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#fff" }} />
                    <Area type="monotone" dataKey="spend" stroke="#1877F2" fill="url(#metaSpendGrad)" strokeWidth={2} name="Investimento (R$)" />
                    <Area type="monotone" dataKey="leads" stroke="#34d399" fill="none" strokeWidth={2} name="Leads" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {meta.byCampaign.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Campanhas Meta</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {["Campanha", "Investimento", "Impressões", "Leads", "ROAS"].map(h => (
                          <th key={h} className="text-left text-[10px] uppercase font-black tracking-widest text-white/40 pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {meta.byCampaign.slice(0, 8).map(c => (
                        <tr key={c.campaign_id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 text-white font-medium pr-4 max-w-[200px] truncate">{c.campaign_name}</td>
                          <td className="py-2.5 text-blue-400 font-bold pr-4">{fmtBRL(c.spend)}</td>
                          <td className="py-2.5 text-white/70 pr-4">{fmtNum(c.impressions)}</td>
                          <td className="py-2.5 text-emerald-400 font-bold pr-4">{fmtNum(c.leads)}</td>
                          <td className="py-2.5 font-black" style={{ color: c.roas >= 3 ? "#34d399" : c.roas >= 1 ? "#fbbf24" : "#f87171" }}>
                            {c.roas.toFixed(2)}x
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
      </div>
    </div>
  );
}
