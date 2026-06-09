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
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface DemographicsAggregated {
  byAge:      { label: string; impressions: number; clicks: number; conversions: number }[];
  byGender:   { label: string; value: number }[];
  byDevice:   { label: string; value: number }[];
  byPlatform: { label: string; impressions: number; clicks: number; spend: number }[];
  byLocation: { city: string; state: string; conversions: number; clicks: number }[];
  heatmap:    { day: number; hour: number; value: number }[]; // day 0=seg, hour 0-23
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
        .select("period_date,platform,age_range,gender,device,state,city,impressions,clicks,spend,conversions")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("period_date", { ascending: false });
      if (range?.from) q = q.gte("period_date", range.from);
      if (range?.to)   q = q.lte("period_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DemographicRow[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 5 * 60_000,
  });

  const aggregated = useMemo<DemographicsAggregated>(() => {
    // Por faixa etária
    const ageMap: Record<string, { impressions: number; clicks: number; conversions: number }> = {};
    const genderMap: Record<string, number> = {};
    const deviceMap: Record<string, number> = {};
    const platformMap: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    const locationMap: Record<string, { city: string; state: string; conversions: number; clicks: number }> = {};

    for (const r of rows) {
      // Faixa etária
      const age = r.age_range ?? "Não informado";
      if (!ageMap[age]) ageMap[age] = { impressions: 0, clicks: 0, conversions: 0 };
      ageMap[age].impressions  += r.impressions;
      ageMap[age].clicks       += r.clicks;
      ageMap[age].conversions  += r.conversions;

      // Gênero
      const g = GENDER_LABELS[r.gender ?? "unknown"] ?? r.gender ?? "Não informado";
      genderMap[g] = (genderMap[g] ?? 0) + r.impressions;

      // Dispositivo
      const d = DEVICE_LABELS[r.device ?? "unknown"] ?? r.device ?? "Outro";
      deviceMap[d] = (deviceMap[d] ?? 0) + r.impressions;

      // Plataforma
      const p = PLATFORM_LABELS[r.platform] ?? r.platform;
      if (!platformMap[p]) platformMap[p] = { impressions: 0, clicks: 0, spend: 0 };
      platformMap[p].impressions += r.impressions;
      platformMap[p].clicks      += r.clicks;
      platformMap[p].spend       += r.spend;

      // Localidade
      const loc = `${r.city ?? ""}|${r.state ?? ""}`;
      if (r.city || r.state) {
        if (!locationMap[loc]) locationMap[loc] = { city: r.city ?? "", state: r.state ?? "", conversions: 0, clicks: 0 };
        locationMap[loc].conversions += r.conversions;
        locationMap[loc].clicks      += r.clicks;
      }
    }

    // Heatmap: usa os dias da semana a partir de period_date
    // (sem dados reais de hora — mapeado como dia da semana × plataforma)
    const heatmap: { day: number; hour: number; value: number }[] = [];
    const heatmapMap: Record<string, number> = {};
    for (const r of rows) {
      const date = new Date(r.period_date + "T00:00:00");
      const day = (date.getDay() + 6) % 7; // 0=seg
      const hour = 12; // sem dado de hora — placeholder central
      const key = `${day}_${hour}`;
      heatmapMap[key] = (heatmapMap[key] ?? 0) + r.clicks;
    }
    for (const [key, value] of Object.entries(heatmapMap)) {
      const [day, hour] = key.split("_").map(Number);
      heatmap.push({ day, hour, value });
    }

    return {
      byAge: Object.entries(ageMap)
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .map(([label, v]) => ({ label, ...v })),
      byGender: Object.entries(genderMap).map(([label, value]) => ({ label, value })),
      byDevice: Object.entries(deviceMap).map(([label, value]) => ({ label, value })),
      byPlatform: Object.entries(platformMap).map(([label, v]) => ({ label, ...v })),
      byLocation: Object.values(locationMap)
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 20),
      heatmap,
    };
  }, [rows]);

  return { rows, aggregated, isLoading, hasData: rows.length > 0 };
}
