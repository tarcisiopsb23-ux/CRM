import { MapPin, Briefcase, DollarSign, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { JobOpening, LocationType } from "@/types/recruitment";

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

interface Props {
  job: JobOpening;
}

export function PublicJobCard({ job }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="rounded-xl border p-6 flex flex-col gap-4 cursor-pointer transition-all hover:border-orange-500/50 hover:bg-white/5"
      style={{ borderColor: "#1f2937", backgroundColor: "#111827" }}
      onClick={() => navigate(`/${job.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{job.title}</h3>
          {job.job_title && (
            <p className="text-sm mt-0.5" style={{ color: "#9ca3af" }}>{job.job_title}</p>
          )}
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 mt-1" style={{ color: "#f97316" }} />
      </div>

      <div className="flex flex-wrap gap-3 text-sm" style={{ color: "#9ca3af" }}>
        {job.department && (
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {job.department}
          </span>
        )}
        {job.location_type && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {LOCATION_LABELS[job.location_type]}
          </span>
        )}
        {job.salary_range && (
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            {job.salary_range}
          </span>
        )}
      </div>

      <button
        type="button"
        className="mt-auto w-full py-2.5 rounded-lg font-medium text-sm transition-colors"
        style={{ backgroundColor: "#f97316", color: "#ffffff" }}
        onClick={(e) => { e.stopPropagation(); navigate(`/${job.id}`); }}
      >
        Candidatar-se
      </button>
    </div>
  );
}
