import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { PublicJobCard } from "@/components/recruitment/PublicJobCard";
import { supabase } from "@/lib/supabase";
import type { JobOpening } from "@/types/recruitment";

// Lê o org ID do env (embutido no build)
const ENV_ORG_ID = (import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined)?.trim() || null;

export default function VagasPage() {
  const { data: jobs = [], isLoading, error } = useQuery<JobOpening[]>({
    queryKey: ["vagas_publicas"],
    queryFn: async () => {
      // Estratégia 1: RPC SECURITY DEFINER (bypassa RLS, não precisa de org_id)
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc("get_public_job_openings");

      if (!rpcErr && Array.isArray(rpcData)) {
        console.log("[VagasPage] RPC ok, vagas:", rpcData.length);
        return rpcData as JobOpening[];
      }

      console.warn("[VagasPage] RPC falhou:", rpcErr?.message, "— tentando query direta");

      // Estratégia 2: query direta com org_id do env
      if (ENV_ORG_ID) {
        const { data, error: qErr } = await supabase
          .from("job_openings")
          .select("*")
          .eq("organization_id", ENV_ORG_ID)
          .eq("status", "aberta")
          .order("created_at", { ascending: false });

        if (!qErr) {
          console.log("[VagasPage] Query direta ok, vagas:", data?.length);
          return (data ?? []) as JobOpening[];
        }
        console.error("[VagasPage] Query direta falhou:", qErr.message);
      }

      // Estratégia 3: busca sem filtro de org (retorna todas as vagas abertas)
      const { data: allData, error: allErr } = await supabase
        .from("job_openings")
        .select("*")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });

      if (!allErr) {
        console.log("[VagasPage] Query sem org ok, vagas:", allData?.length);
        return (allData ?? []) as JobOpening[];
      }

      console.error("[VagasPage] Todas as estratégias falharam:", allErr.message);
      return [];
    },
    staleTime: 30_000,
    retry: 2,
    retryDelay: 1000,
  });

  // Agrupa por departamento
  const grouped = useMemo(() => {
    const map = new Map<string, JobOpening[]>();
    for (const job of jobs) {
      const dept = job.department || "Geral";
      const list = map.get(dept) ?? [];
      list.push(job);
      map.set(dept, list);
    }
    return map;
  }, [jobs]);

  return (
    <PublicLayout>
      {/* Hero */}
      <section
        className="py-20 px-6 text-center"
        style={{ background: "linear-gradient(180deg, #111827 0%, #0a0a0a 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1 rounded-full"
            style={{ backgroundColor: "#f97316", color: "#ffffff" }}
          >
            Trabalhe conosco
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
            Faça parte do time C8
          </h1>
          <p className="text-lg mb-8" style={{ color: "#9ca3af" }}>
            Buscamos pessoas comprometidas, criativas e com vontade real de crescer.
            Se você quer fazer parte de uma equipe que trabalha com método e resultado, este é o lugar.
          </p>
          <a
            href="#vagas"
            className="inline-block px-8 py-3 rounded-lg font-semibold text-white transition-colors"
            style={{ backgroundColor: "#f97316" }}
          >
            Ver vagas abertas
          </a>
        </div>
      </section>

      {/* Listagem de vagas */}
      <section id="vagas" className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#f97316" }} />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-xl font-medium text-white mb-2">Erro ao carregar vagas</p>
              <p style={{ color: "#6b7280" }} className="text-sm font-mono">
                {(error as Error).message}
              </p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-xl font-medium text-white mb-2">Nenhuma vaga aberta no momento</p>
              <p style={{ color: "#6b7280" }}>
                Acompanhe nossas redes sociais para ficar por dentro das próximas oportunidades.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {Array.from(grouped.entries()).map(([dept, deptJobs]) => (
                <div key={dept}>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "#f97316" }}>
                    {dept}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {deptJobs.map((job) => (
                      <PublicJobCard key={job.id} job={job} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
