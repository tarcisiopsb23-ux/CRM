import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { PublicJobCard } from "@/components/recruitment/PublicJobCard";
import { usePublicJobOpenings } from "@/hooks/useJobOpenings";
import type { JobOpening } from "@/types/recruitment";

// A organização pública é configurada via variável de ambiente
const PUBLIC_ORG_ID = import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined;

export default function VagasPage() {
  const { data: jobs = [], isLoading } = usePublicJobOpenings(PUBLIC_ORG_ID);

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
