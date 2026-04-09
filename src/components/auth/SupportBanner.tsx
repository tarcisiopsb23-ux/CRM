interface Props {
  tenantName?: string;
  onChangeTenant?: () => void;
}

export function SupportBanner({ tenantName, onChangeTenant }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-orange-300">
      <div className="flex items-center gap-3">
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
      {onChangeTenant && (
        <button
          onClick={onChangeTenant}
          className="shrink-0 text-xs font-bold text-orange-400 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 rounded-lg px-3 py-1.5 transition-colors"
        >
          Trocar cliente
        </button>
      )}
    </div>
  );
}
