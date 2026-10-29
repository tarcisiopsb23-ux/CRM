// ── FlowToolbar.tsx — barra superior do editor visual ────────────────────────
// Nome editável, badge de status, botões Salvar / Ativar / Voltar.

import { ArrowLeft, Save, Loader2, Power, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { FlowStatus } from "./flowTypes";

function StatusBadge({ status }: { status: FlowStatus }) {
  const map: Record<FlowStatus, { label: string; cls: string }> = {
    draft:    { label: "Rascunho", cls: "border-transparent bg-secondary text-secondary-foreground" },
    active:   { label: "Ativo",    cls: "border-transparent bg-emerald-500/15 text-emerald-400" },
    archived: { label: "Arquivado", cls: "border-transparent bg-destructive/15 text-destructive" },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

interface FlowToolbarProps {
  name: string;
  onNameChange: (v: string) => void;
  status: FlowStatus;
  saving: boolean;
  saved: boolean;
  onManualSave: () => void;
  onActivate: () => void;
  activating: boolean;
  onBack: () => void;
}

export function FlowToolbar({
  name, onNameChange, status, saving, saved, onManualSave, onActivate, activating, onBack,
}: FlowToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0" aria-label="Voltar">
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Nome do flow"
        className="h-9 max-w-sm flex-1 text-sm font-medium"
      />

      <StatusBadge status={status} />

      <div className="ml-auto flex items-center gap-2">
        {/* Indicador de auto-save */}
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" /> Salvo
          </span>
        ) : null}

        <Button variant="outline" size="sm" onClick={onManualSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>

        <Button
          size="sm"
          onClick={onActivate}
          disabled={activating || status === "active"}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-600/90"
        >
          {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
          {status === "active" ? "Ativo" : "Ativar Flow"}
        </Button>
      </div>
    </div>
  );
}
