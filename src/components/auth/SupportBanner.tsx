interface Props {
  tenantName?: string;
}

export function SupportBanner({ tenantName }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-orange-300">
      <span className="text-lg">🛠️</span>
      <div>
        <p className="text-sm font-black uppercase tracking-wide text-orange-400">
          Sessão de Suporte Técnico
        </p>
        <p className="text-xs text-orange-300/80">
          {tenantName
            ? `Visualizando: ${tenantName}`
            : "Selecione um cliente para visualizar o dashboard."}{" "}
          Este acesso é monitorado.
        </p>
      </div>
    </div>
  );
}
