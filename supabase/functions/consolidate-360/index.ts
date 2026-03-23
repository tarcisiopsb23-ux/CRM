import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function avg(notas: number[]): number | null {
  if (notas.length === 0) return null;
  return notas.reduce((a, b) => a + b, 0) / notas.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ciclo_id } = await req.json();
    if (!ciclo_id) {
      return new Response(JSON.stringify({ error: "ciclo_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar ciclo
    const { data: ciclo, error: cicloErr } = await supabase
      .from("ciclos_avaliacao")
      .select("*")
      .eq("id", ciclo_id)
      .single();

    if (cicloErr || !ciclo) {
      return new Response(JSON.stringify({ error: "Ciclo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar todos os avaliados distintos do ciclo
    const { data: avaliacoes, error: avalErr } = await supabase
      .from("avaliacoes_360")
      .select("id, avaliado_id, avaliador_id, tipo, status")
      .eq("ciclo_id", ciclo_id);

    if (avalErr) throw avalErr;

    const avaliadosSet = new Set<string>((avaliacoes ?? []).map((a: any) => a.avaliado_id));
    const avaliados = Array.from(avaliadosSet);

    for (const avaliado_id of avaliados) {
      const avaliacoesDoAvaliado = (avaliacoes ?? []).filter(
        (a: any) => a.avaliado_id === avaliado_id && a.status === "concluido"
      );

      if (avaliacoesDoAvaliado.length === 0) {
        // Sem avaliações concluídas — registrar resultado nulo
        await supabase.from("resultado_final_360").upsert({
          ciclo_id,
          organization_id: ciclo.organization_id,
          avaliado_id,
          media_geral: null,
          media_autoavaliacao: null,
          media_pares: null,
          media_gestor: null,
          media_liderado: null,
          score_final: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "ciclo_id,avaliado_id" });
        continue;
      }

      // Buscar respostas de todas as avaliações concluídas do avaliado
      const avaliacaoIds = avaliacoesDoAvaliado.map((a: any) => a.id);
      const { data: respostas, error: respErr } = await supabase
        .from("respostas_avaliacao_360")
        .select("avaliacao_id, nota")
        .in("avaliacao_id", avaliacaoIds);

      if (respErr) throw respErr;

      // Calcular médias por tipo
      const notasPorTipo: Record<string, number[]> = {
        autoavaliacao: [],
        gestor: [],
        pares: [],
        liderado: [],
      };

      for (const avaliacao of avaliacoesDoAvaliado) {
        const notasAvaliacao = (respostas ?? [])
          .filter((r: any) => r.avaliacao_id === avaliacao.id)
          .map((r: any) => r.nota);
        const mediaAvaliacao = avg(notasAvaliacao);
        if (mediaAvaliacao !== null) {
          notasPorTipo[avaliacao.tipo]?.push(mediaAvaliacao);
        }
      }

      const mediaAutoavaliacao = avg(notasPorTipo.autoavaliacao);
      const mediaPares = avg(notasPorTipo.pares);
      const mediaGestor = avg(notasPorTipo.gestor);
      const mediaLiderado = avg(notasPorTipo.liderado);

      // media_geral = média de todas as notas de todas as avaliações concluídas
      const todasNotas = (respostas ?? []).map((r: any) => r.nota);
      const mediaGeral = avg(todasNotas);

      // score_final: usa media_geral como proxy de media_360
      // metas e produtividade não disponíveis via Edge Function — usar null quando ausentes
      let scoreFinal: number | null = null;
      if (mediaGeral !== null) {
        scoreFinal = Math.round(
          (mediaGeral * ciclo.peso_360) * 100
        ) / 100;
        // Nota: peso_metas e peso_prod serão incorporados quando integração de metas estiver disponível
      }

      // Upsert resultado_final_360
      await supabase.from("resultado_final_360").upsert({
        ciclo_id,
        organization_id: ciclo.organization_id,
        avaliado_id,
        media_geral: mediaGeral !== null ? Math.round(mediaGeral * 100) / 100 : null,
        media_autoavaliacao: mediaAutoavaliacao !== null ? Math.round(mediaAutoavaliacao * 100) / 100 : null,
        media_pares: mediaPares !== null ? Math.round(mediaPares * 100) / 100 : null,
        media_gestor: mediaGestor !== null ? Math.round(mediaGestor * 100) / 100 : null,
        media_liderado: mediaLiderado !== null ? Math.round(mediaLiderado * 100) / 100 : null,
        score_final: scoreFinal,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ciclo_id,avaliado_id" });

      // Notificar colaborador que resultado está disponível (Req 9.4)
      await supabase.from("notifications").insert({
        organization_id: ciclo.organization_id,
        user_id: avaliado_id,
        title: "Resultado de avaliação disponível",
        message: `Seu resultado do ciclo "${ciclo.nome}" está disponível.`,
        type: "info",
      }).select();
    }

    // Audit log do encerramento (Req 2.3 da task)
    await supabase.from("audit_log_360").insert({
      organization_id: ciclo.organization_id,
      user_id: null,
      action: "consolidate_ciclo",
      entity_type: "ciclo_avaliacao",
      entity_id: ciclo_id,
      new_data: { avaliados_processados: avaliados.length, consolidated_at: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ success: true, avaliados_processados: avaliados.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("consolidate-360 error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
