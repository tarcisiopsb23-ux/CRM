import type { ApplicationStatus } from "@/types/recruitment";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  contratado: "Contratado",
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  novo: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  em_analise: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  aprovado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  reprovado: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  contratado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

interface Props {
  status: ApplicationStatus;
  size?: "sm" | "md";
}

export function CandidateStatusBadge({ status, size = "md" }: Props) {
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${textSize} ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
