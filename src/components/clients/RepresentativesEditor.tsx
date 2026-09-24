/**
 * RepresentativesEditor
 *
 * Gerencia representantes legais e procuradores de um cliente.
 * Suporta:
 *   - Representante legal direto (tipo_representacao = 'legal')
 *   - Procurador(a) (qualificacao = 'procurador') com campos de procuração
 *   - Badge de procuração vencida
 *   - Assinatura individual ou conjunta
 *
 * O tipo_representacao é derivado automaticamente da qualificação selecionada:
 *   - qualificacao = 'procurador' → tipo_representacao = 'procurador'
 *   - demais qualificações        → tipo_representacao = 'legal'
 */
import { useState } from "react";
import { format, parseISO, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ShieldCheck, Loader2, Users, Phone, Mail,
  AlertCircle, FileText, AlertTriangle,
} from "lucide-react";
import {
  useClientRepresentatives,
  QUALIFICACAO_LABELS,
  type ClientRepresentative,
  type ClientRepresentativeWithFlag,
  type RepresentativeQualificacao,
  type TipoRepresentacao,
  type ProcuracaoTipo,
} from "@/hooks/useClientRepresentatives";

// ── Constantes ────────────────────────────────────────────────────────────────

const QUALIFICACAO_OPTIONS = Object.entries(QUALIFICACAO_LABELS) as [RepresentativeQualificacao, string][];

const PROCURACAO_TIPO_LABELS: Record<ProcuracaoTipo, string> = {
  publica:    "Pública (lavrada em cartório)",
  particular: "Particular (instrumento particular)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskCpf(v: string) {
  return v.replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .slice(0, 14);
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim().replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim().replace(/-$/, "");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
}

function isVencida(validade: string | null, indeterminada: boolean): boolean {
  if (indeterminada || !validade) return false;
  try { return isBefore(parseISO(validade), new Date()); }
  catch { return false; }
}

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface RepForm {
  id?: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  qualificacao: RepresentativeQualificacao | "";
  cargo: string;
  is_legal_representative: boolean;
  tipo_representacao: TipoRepresentacao;
  procuracao_tipo: ProcuracaoTipo | "";
  procuracao_data: string;
  procuracao_validade: string;
  procuracao_indeterminada: boolean;
  procuracao_notas: string;
  representa_ids: string[];
  estado_civil: string;
  nacionalidade: string;
}

const emptyForm = (): RepForm => ({
  nome: "", cpf: "", telefone: "", email: "",
  qualificacao: "", cargo: "",
  is_legal_representative: true,
  tipo_representacao: "legal",
  procuracao_tipo: "", procuracao_data: "",
  procuracao_validade: "", procuracao_indeterminada: false,
  procuracao_notas: "", representa_ids: [],
  estado_civil: "", nacionalidade: "",
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  signingType: "individual" | "joint";
  onSigningTypeChange: (type: "individual" | "joint") => void;
  /** Quando true (CNPJ), ao menos 1 representante legal é obrigatório */
  required?: boolean;
  /** Quando true (CPF), o cliente é pessoa física */
  isPf?: boolean;
}

// ── Sub-componente: card de representante ─────────────────────────────────────

function RepCard({
  rep,
  allReps,
  onEdit,
  onDelete,
}: {
  rep: ClientRepresentativeWithFlag;
  allReps: ClientRepresentativeWithFlag[];
  onEdit: (rep: ClientRepresentative) => void;
  onDelete: (rep: ClientRepresentative) => void;
}) {
  const isProcurador = rep.tipo_representacao === "procurador";
  const vencida = rep.procuracao_vencida
    || isVencida(rep.procuracao_validade, rep.procuracao_indeterminada);

  // Nome dos representados (para procuradores)
  const representados = (rep.representa_ids ?? [])
    .map(rid => allReps.find(r => r.id === rid)?.nome)
    .filter(Boolean);

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      vencida
        ? "bg-red-50 border-red-200"
        : isProcurador
          ? "bg-amber-50 border-amber-200"
          : rep.is_legal_representative
            ? "bg-violet-50 border-violet-200"
            : "bg-muted/20"
    }`}>
      <div className="flex-1 min-w-0">
        {/* Nome e badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{rep.nome}</span>
          {rep.is_legal_representative && !isProcurador && (
            <Badge variant="outline" className="text-[10px] text-violet-700 border-violet-300 gap-0.5">
              <ShieldCheck className="h-2.5 w-2.5" /> Resp. Legal
            </Badge>
          )}
          {isProcurador && (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 gap-0.5">
              <FileText className="h-2.5 w-2.5" /> Procurador
            </Badge>
          )}
          {vencida && (
            <Badge variant="destructive" className="text-[10px] gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> Procuração vencida
            </Badge>
          )}
          {isProcurador && !vencida && rep.procuracao_indeterminada && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Prazo indeterminado
            </Badge>
          )}
          {rep.qualificacao && (
            <Badge variant="outline" className="text-[10px]">
              {QUALIFICACAO_LABELS[rep.qualificacao]}
            </Badge>
          )}
        </div>

        {/* Detalhes */}
        <div className="flex flex-wrap gap-x-3 mt-1">
          <p className="text-[11px] text-muted-foreground">CPF: {rep.cpf}</p>
          {rep.cargo && <p className="text-[11px] text-muted-foreground">{rep.cargo}</p>}
          {rep.estado_civil && (
            <p className="text-[11px] text-muted-foreground capitalize">
              {rep.estado_civil.replace(/_/g, " ")}
            </p>
          )}
          {rep.nacionalidade && (
            <p className="text-[11px] text-muted-foreground capitalize">{rep.nacionalidade}</p>
          )}
          {rep.telefone && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Phone className="h-2.5 w-2.5" /> {rep.telefone}
            </p>
          )}
          {rep.email && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Mail className="h-2.5 w-2.5" /> {rep.email}
            </p>
          )}
        </div>

        {/* Detalhes da procuração */}
        {isProcurador && (
          <div className="mt-1.5 space-y-0.5">
            {rep.procuracao_tipo && (
              <p className="text-[11px] text-muted-foreground">
                Procuração {rep.procuracao_tipo === "publica" ? "pública" : "particular"}
                {rep.procuracao_data ? ` — lavrada em ${fmtDate(rep.procuracao_data)}` : ""}
              </p>
            )}
            {rep.procuracao_validade && !rep.procuracao_indeterminada && (
              <p className={`text-[11px] ${vencida ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                Válida até {fmtDate(rep.procuracao_validade)}
                {vencida ? " — VENCIDA" : ""}
              </p>
            )}
            {representados.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Representa: {representados.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(rep)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={() => onDelete(rep)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function RepresentativesEditor({ clientId, signingType, onSigningTypeChange, required = false, isPf = false }: Props) {
  const {
    data: reps = [],
    isLoading,
    hasProcuradorVencido,
    saveRepresentative,
    removeRepresentative,
  } = useClientRepresentatives(clientId);

  // Representantes legais já cadastrados (exclui procuradores)
  const legalReps = reps.filter(r => r.tipo_representacao === "legal");

  const [editing,      setEditing]      = useState<RepForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRepresentativeWithFlag | null>(null);
  const [saving,       setSaving]       = useState(false);

  // PF: procurador só pode ser cadastrado se já houver ao menos 1 rep legal
  // PJ: idem — procurador sem rep legal não faz sentido
  const canAddProcurador = legalReps.filter(r => r.id !== editing?.id).length > 0;

  // Filtra opções de qualificação disponíveis conforme contexto
  const qualificacaoOptions = (QUALIFICACAO_OPTIONS as [RepresentativeQualificacao, string][]).filter(
    ([val]) => val !== "procurador" || canAddProcurador
  );

  const validationMsg = (() => {
    if (required && legalReps.length === 0)
      return "Para contratos com CNPJ, ao menos 1 representante legal é obrigatório.";
    if (signingType === "joint" && legalReps.length < 2)
      return "Assinatura conjunta requer ao menos 2 representantes legais.";
    if (signingType === "individual" && legalReps.length > 1)
      return "Assinatura individual: apenas 1 responsável legal. Mude para conjunta ou desmarque os demais.";
    return null;
  })();

  const openEdit = (rep: ClientRepresentative) =>
    setEditing({
      id:                      rep.id,
      nome:                    rep.nome,
      cpf:                     rep.cpf,
      telefone:                rep.telefone ?? "",
      email:                   rep.email ?? "",
      qualificacao:            rep.qualificacao ?? "",
      cargo:                   rep.cargo ?? "",
      is_legal_representative: rep.is_legal_representative,
      tipo_representacao:      rep.tipo_representacao ?? "legal",
      procuracao_tipo:         rep.procuracao_tipo ?? "",
      procuracao_data:         rep.procuracao_data ?? "",
      procuracao_validade:     rep.procuracao_validade ?? "",
      procuracao_indeterminada: rep.procuracao_indeterminada ?? false,
      procuracao_notas:        rep.procuracao_notas ?? "",
      representa_ids:          rep.representa_ids ?? [],
      estado_civil:            rep.estado_civil ?? "",
      nacionalidade:           rep.nacionalidade ?? "",
    });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    if (!editing.cpf.trim())  { toast.error("CPF é obrigatório.");  return; }
    if (editing.tipo_representacao === "procurador" && !editing.procuracao_tipo) {
      toast.error("Informe o tipo da procuração (pública ou particular)."); return;
    }
    const legalRepsAvailable = reps.filter(r => r.tipo_representacao === "legal" && r.id !== editing.id);
    if (editing.tipo_representacao === "procurador" && legalRepsAvailable.length > 0 && editing.representa_ids.length === 0) {
      toast.error("Selecione ao menos um representante legal que este procurador representa."); return;
    }
    setSaving(true);
    try {
      await saveRepresentative.mutateAsync({
        id:                      editing.id,
        nome:                    editing.nome.trim(),
        cpf:                     editing.cpf.trim(),
        telefone:                editing.telefone.trim() || null,
        email:                   editing.email.trim() || null,
        qualificacao:            (editing.qualificacao || null) as RepresentativeQualificacao | null,
        cargo:                   editing.cargo.trim() || null,
        is_legal_representative: editing.tipo_representacao === "legal" ? editing.is_legal_representative : false,
        is_signing_responsible:  editing.tipo_representacao === "legal" ? editing.is_legal_representative : true,
        display_order:           reps.length,
        tipo_representacao:      editing.tipo_representacao,
        procuracao_tipo:         (editing.procuracao_tipo || null) as ProcuracaoTipo | null,
        procuracao_data:         editing.procuracao_data || null,
        procuracao_validade:     editing.procuracao_indeterminada ? null : (editing.procuracao_validade || null),
        procuracao_indeterminada: editing.procuracao_indeterminada,
        procuracao_notas:        editing.procuracao_notas.trim() || null,
        representa_ids:          editing.representa_ids.length > 0 ? editing.representa_ids : null,
        estado_civil:            editing.estado_civil || null,
        nacionalidade:           editing.nacionalidade.trim() || null,
      });
      toast.success(editing.id ? "Representante atualizado." : "Representante adicionado.");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rep: ClientRepresentativeWithFlag) => {
    try {
      await removeRepresentative.mutateAsync(rep.id);
      toast.success("Representante removido.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao remover.");
    }
  };

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando representantes…
    </div>
  );

  const isProcuradorMode = editing?.qualificacao === "procurador";

  return (
    <div className="space-y-4">

      {/* Alerta de procuração vencida */}
      {hasProcuradorVencido && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Este cliente possui procuração(ões) vencida(s). Verifique e atualize antes de gerar novos contratos.</span>
        </div>
      )}

      {/* Tipo de assinatura */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-violet-500" /> Tipo de assinatura
        </Label>
        <Select value={signingType} onValueChange={v => onSigningTypeChange(v as "individual" | "joint")}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">Individual — assina 1 responsável</SelectItem>
            <SelectItem value="joint">Conjunta — todos os responsáveis assinam</SelectItem>
          </SelectContent>
        </Select>
        {validationMsg && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{validationMsg}
          </div>
        )}
      </div>

      <Separator />

      {/* Lista de representantes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">
              Representantes e Procuradores{required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cadastre representantes legais diretos e procuradores.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setEditing(emptyForm())}>
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>

        {reps.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center border rounded-md">
            Nenhum representante cadastrado.
          </p>
        )}

        <div className="space-y-2">
          {reps.map(rep => (
            <RepCard
              key={rep.id}
              rep={rep}
              allReps={reps}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      </div>

      {/* Dialog — criar/editar */}
      {editing && (
        <Dialog open onOpenChange={o => { if (!o) setEditing(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                {editing.id ? "Editar representante" : "Novo representante"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">

              {/* Dados pessoais */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Nome completo <span className="text-red-500">*</span></Label>
                  <Input value={editing.nome} placeholder="Ex: João da Silva" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, nome: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF <span className="text-red-500">*</span></Label>
                  <Input value={editing.cpf} placeholder="000.000.000-00" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, cpf: maskCpf(e.target.value) } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qualificação</Label>
                  <Select value={editing.qualificacao}
                    onValueChange={v => setEditing(p => {
                      if (!p) return p;
                      const qual = v as RepresentativeQualificacao;
                      const isProcurador = qual === "procurador";
                      return {
                        ...p,
                        qualificacao: qual,
                        tipo_representacao: isProcurador ? "procurador" : "legal",
                        is_legal_representative: isProcurador ? false : p.is_legal_representative,
                      };
                    })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {qualificacaoOptions.map(([val, lbl]) => (
                        <SelectItem key={val} value={val}>{lbl}</SelectItem>
                      ))}
                      {!canAddProcurador && (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-t mt-1">
                          {isPf
                            ? "Cadastre o titular como representante legal antes de adicionar um procurador."
                            : "Cadastre ao menos 1 representante legal antes de adicionar um procurador."}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={editing.telefone} placeholder="(00) 00000-0000" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, telefone: maskPhone(e.target.value) } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input type="email" value={editing.email} placeholder="nome@empresa.com" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, email: e.target.value } : p)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Cargo / Função</Label>
                  <Input value={editing.cargo} placeholder="Ex: Diretor Executivo" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, cargo: e.target.value } : p)} />
                </div>

                {/* Estado civil e nacionalidade do representante */}
                <div className="space-y-1.5">
                  <Label>Estado Civil</Label>
                  <Input value={editing.estado_civil} placeholder="Ex: Casado(a)" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, estado_civil: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nacionalidade</Label>
                  <Input value={editing.nacionalidade} placeholder="Ex: Brasileiro(a)" className="h-8"
                    onChange={e => setEditing(p => p ? { ...p, nacionalidade: e.target.value } : p)} />
                </div>
              </div>

              {/* Responsável legal (só para tipo 'legal') */}
              {!isProcuradorMode && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  <Switch id="is-legal" checked={editing.is_legal_representative}
                    onCheckedChange={v => setEditing(p => p ? { ...p, is_legal_representative: v } : p)} />
                  <div>
                    <label htmlFor="is-legal" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-violet-500" /> Responsável Legal
                    </label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Tem poder legal de assinar contratos por esta empresa.
                    </p>
                  </div>
                </div>
              )}

              {/* Campos de procuração (só para tipo 'procurador') */}
              {isProcuradorMode && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Dados da Procuração
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Tipo */}
                    <div className="col-span-2 space-y-1.5">
                      <Label>Tipo da procuração <span className="text-red-500">*</span></Label>
                      <Select value={editing.procuracao_tipo}
                        onValueChange={v => setEditing(p => p ? { ...p, procuracao_tipo: v as ProcuracaoTipo } : p)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PROCURACAO_TIPO_LABELS) as [ProcuracaoTipo, string][]).map(([val, lbl]) => (
                            <SelectItem key={val} value={val}>{lbl}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Data de lavratura */}
                    <div className="space-y-1.5">
                      <Label>Data de lavratura</Label>
                      <Input type="date" value={editing.procuracao_data} className="h-8"
                        onChange={e => setEditing(p => p ? { ...p, procuracao_data: e.target.value } : p)} />
                    </div>

                    {/* Validade */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        Validade
                        <span className="text-[10px] text-muted-foreground">(controle interno)</span>
                      </Label>
                      <Input type="date" value={editing.procuracao_validade}
                        disabled={editing.procuracao_indeterminada} className="h-8"
                        onChange={e => setEditing(p => p ? { ...p, procuracao_validade: e.target.value } : p)} />
                    </div>

                    {/* Prazo indeterminado */}
                    <div className="col-span-2 flex items-center gap-2">
                      <Switch id="prazo-ind" checked={editing.procuracao_indeterminada}
                        onCheckedChange={v => setEditing(p => p
                          ? { ...p, procuracao_indeterminada: v, procuracao_validade: v ? "" : p.procuracao_validade }
                          : p)} />
                      <label htmlFor="prazo-ind" className="text-sm cursor-pointer">Prazo indeterminado</label>
                    </div>

                    {/* Representa quais representantes legais */}
                    {reps.filter(r => r.tipo_representacao === "legal").length > 0 && (
                      <div className="col-span-2 space-y-1.5">
                        <Label>Representa <span className="text-red-500">*</span></Label>
                        <div className="space-y-1">
                          {reps
                            .filter(r => r.tipo_representacao === "legal" && r.id !== editing.id)
                            .map(r => (
                              <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox"
                                  checked={editing.representa_ids.includes(r.id)}
                                  onChange={e => setEditing(p => {
                                    if (!p) return p;
                                    const ids = e.target.checked
                                      ? [...p.representa_ids, r.id]
                                      : p.representa_ids.filter(id => id !== r.id);
                                    return { ...p, representa_ids: ids };
                                  })}
                                />
                                {r.nome} — {r.cpf}
                              </label>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Notas */}
                    <div className="col-span-2 space-y-1.5">
                      <Label>Notas <span className="text-[10px] text-muted-foreground">(cartório, livro, folha…)</span></Label>
                      <Textarea value={editing.procuracao_notas} rows={2}
                        placeholder="Ex: Cartório do 1º Tabelionato, Livro 10, Folha 123"
                        className="text-sm resize-none"
                        onChange={e => setEditing(p => p ? { ...p, procuracao_notas: e.target.value } : p)} />
                    </div>
                  </div>
                </div>
              )}

            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog — confirmar exclusão */}
      {deleteTarget && (
        <Dialog open onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Remover representante
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Remover <strong>{deleteTarget.nome}</strong>? Esta ação não pode ser desfeita.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>Remover</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
