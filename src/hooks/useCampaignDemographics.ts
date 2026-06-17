import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DemographicRow {
  period_date: string;
  platform: string;
  age_range: string | null;
  gender: string | null;
  device: string | null;
  state: string | null;
  city: string | null;
  hour_of_day: number | null;
  day_of_week: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface DemographicsAggregated {
  byAge:        { label: string; impressions: number; clicks: number; conversions: number }[];
  byGender:     { label: string; value: number }[];
  byDevice:     { label: string; value: number }[];
  byPlatform:   { label: string; impressions: number; clicks: number; spend: number }[];
  byLocation:   { city: string; state: string; conversions: number; clicks: number }[];
  heatmap:      { day: number; hour: number; value: number }[]; // day 0=seg(1)...6=dom(0)
  hasHourData:  boolean; // true quando os dados têm granularidade real de hora
}

const GENDER_LABELS: Record<string, string> = {
  male: "Masculino", female: "Feminino", unknown: "Não informado",
};
const DEVICE_LABELS: Record<string, string> = {
  mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", unknown: "Outro",
};
const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok", other: "Outro",
};

export function useCampaignDemographics(
  organizationId: string | undefined,
  clientId: string | undefined,
  range?: { from: string; to: string }
) {
  const { data: rows = [], isLoading } = useQuery<DemographicRow[]>({
    queryKey: ["campaign_demographics", organizationId, clientId, range?.from, range?.to],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      let q = supabase
        .from("campaign_demographics")
        .select(
          "period_date,platform,age_range,gender,device,state,city," +
          "hour_of_day,day_of_week,impressions,clicks,spend,conversions"
        )
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("period_date", { ascending: false });
      if (range?.from) q = q.gte("period_date", range.from);
      if (range?.to)   q = q.lte("period_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DemographicRow[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 5 * 60_000,
  });

  const aggregated = useMemo<DemographicsAggregated>(() => {
    const ageMap:      Record<string, { impressions: number; clicks: number; conversions: number }> = {};
    const genderMap:   Record<string, number> = {};
    const deviceMap:   Record<string, number> = {};
    const platformMap: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    const locationMap: Record<string, { city: string; state: string; conversions: number; clicks: number }> = {};
    const heatmapMap:  Record<string, number> = {};

    // Flag: os dados têm granularidade real de hora?
    const hasHourData = rows.some(r => r.hour_of_day !== null);

    for (const r of rows) {
      // ── Faixa etária ────────────────────────────────────────────────────────
      const age = r.age_range ?? "Não informado";
      if (!ageMap[age]) ageMap[age] = { impressions: 0, clicks: 0, conversions: 0 };
      ageMap[age].impressions  += r.impressions;
      ageMap[age].clicks       += r.clicks;
      ageMap[age].conversions  += r.conversions;

      // ── Gênero ──────────────────────────────────────────────────────────────
      const g = GENDER_LABELS[r.gender ?? "unknown"] ?? r.gender ?? "Não informado";
      genderMap[g] = (genderMap[g] ?? 0) + r.impressions;

      // ── Dispositivo ─────────────────────────────────────────────────────────
      const d = DEVICE_LABELS[r.device ?? "unknown"] ?? r.device ?? "Outro";
      deviceMap[d] = (deviceMap[d] ?? 0) + r.impressions;

      // ── Plataforma ──────────────────────────────────────────────────────────
      const p = PLATFORM_LABELS[r.platform] ?? r.platform;
      if (!platformMap[p]) platformMap[p] = { impressions: 0, clicks: 0, spend: 0 };
      platformMap[p].impressions += r.impressions;
      platformMap[p].clicks      += r.clicks;
      platformMap[p].spend       += r.spend;

      // ── Localidade ──────────────────────────────────────────────────────────
      if (r.city || r.state) {
        const loc = `${r.city ?? ""}|${r.state ?? ""}`;
        if (!locationMap[loc]) locationMap[loc] = { city: r.city ?? "", state: r.state ?? "", conversions: 0, clicks: 0 };
        locationMap[loc].conversions += r.conversions;
        locationMap[loc].clicks      += r.clicks;
      }

      // ── Heatmap dia × hora ──────────────────────────────────────────────────
      if (hasHourData) {
        // Usa dados reais de hora quando disponíveis
        if (r.hour_of_day !== null && r.day_of_week !== null) {
          // Converte day_of_week: BD usa 0=Dom,1=Seg,...6=Sab → queremos 0=Seg,...6=Dom
          const day  = r.day_of_week === 0 ? 6 : r.day_of_week - 1;
          const hour = r.hour_of_day;
          const key  = `${day}_${hour}`;
          heatmapMap[key] = (heatmapMap[key] ?? 0) + r.clicks;
        }
      } else {
        // Fallback: distribui por dia da semana sem granularidade de hora
        const date = new Date(r.period_date + "T00:00:00");
        // getDay(): 0=Dom,1=Seg,...6=Sab → 0=Seg,...6=Dom
        const day = (date.getDay() + 6) % 7;
        // Distribui cliques proporcionalmente nas horas comerciais (8-20)
        const businessHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        const clicksPerHour = r.clicks / businessHours.length;
        for (const hour of businessHours) {
          const key = `${day}_${hour}`;
          heatmapMap[key] = (heatmapMap[key] ?? 0) + clicksPerHour;
        }
      }
    }

    const heatmap = Object.entries(heatmapMap).map(([key, value]) => {
      const [day, hour] = key.split("_").map(Number);
      return { day, hour, value: Math.round(value) };
    });

    return {
      byAge: Object.entries(ageMap)
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .map(([label, v]) => ({ label, ...v })),
      byGender:   Object.entries(genderMap).map(([label, value]) => ({ label, value })),
      byDevice:   Object.entries(deviceMap).map(([label, value]) => ({ label, value })),
      byPlatform: Object.entries(platformMap).map(([label, v]) => ({ label, ...v })),
      byLocation: Object.values(locationMap)
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 20),
      heatmap,
      hasHourData,
    };
  }, [rows]);

  return { rows, aggregated, isLoading, hasData: rows.length > 0 };
}
