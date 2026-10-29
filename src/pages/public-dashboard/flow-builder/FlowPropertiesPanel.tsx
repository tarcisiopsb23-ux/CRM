// ── FlowPropertiesPanel.tsx — painel direito: edita o nó selecionado ──────────
// Formulário dinâmico por node.type. Atualiza node.data via setNodes (callback).

import { KeyboardEvent, useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Node } from "@xyflow/react";

import type { NodeData, NodeType, MatchType } from "./flowTypes";

// ─── Helpers de UI ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Caixa de dica com os placeholders de variável disponíveis. */
function VariableHints() {
  return (
    <div className="rounded-md border border-border/50 bg-secondary/20 p-2.5 text-[11px] text-muted-foreground">
      <p className="font-medium text-foreground/80">Variáveis disponíveis</p>
      <p className="mt-1 leading-relaxed">
        Use <code className="rounded bg-secondary px-1">{"{{contact.name}}"}</code>,{" "}
        <code className="rounded bg-secondary px-1">{"{{contact.phone}}"}</code> ou{" "}
        <code className="rounded bg-secondary px-1">{"{{var.NOME}}"}</code> nas mensagens.
      </p>
    </div>
  );
}

// ─── Editor de lista de palavras-chave ────────────────────────────────────────

function KeywordEditor({
  keywords, onChange,
}: {
  keywords: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add(raw: string) {
    const w = raw.trim().replace(/,$/, "").trim();
    if (!w) return;
    if (!keywords.includes(w)) onChange([...keywords, w]);
    setInput("");
  }
  function remove(kw: string) {
    onChange(keywords.filter((k) => k !== kw));
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 min-h-[40px]">
      {keywords.map((kw) => (
        <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {kw}
          <button type="button" onClick={() => remove(kw)} className="rounded-full hover:bg-primary/20 p-0.5" aria-label={`Remover ${kw}`}>
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(input)}
        placeholder={keywords.length === 0 ? "Enter para adicionar" : ""}
        className="h-6 flex-1 min-w-[100px] border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

// ─── Editor de botões ──────────────────────────────────────────────────────────

function ButtonsEditor({
  buttons, onChange,
}: {
  buttons: Array<{ id: string; title: string }>;
  onChange: (v: Array<{ id: string; title: string }>) => void;
}) {
  function updateTitle(id: string, title: string) {
    onChange(buttons.map((b) => (b.id === id ? { ...b, title } : b)));
  }
  function remove(id: string) {
    onChange(buttons.filter((b) => b.id !== id));
  }
  function add() {
    const nextIdx = buttons.length;
    onChange([...buttons, { id: `btn_${nextIdx}`, title: "" }]);
  }

  return (
    <div className="space-y-2">
      {buttons.map((b, i) => (
        <div key={b.id} className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/70 w-12 shrink-0">btn_{i}</span>
          <Input
            value={b.title}
            onChange={(e) => updateTitle(b.id, e.target.value)}
            placeholder={`Botão ${i + 1}`}
            className="h-8 text-xs"
          />
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => remove(b.id)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {buttons.length < 3 && (
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5 h-7 text-xs">
          <Plus className="h-3 w-3" /> Adicionar botão
        </Button>
      )}
    </div>
  );
}

// ─── Formulário por tipo ───────────────────────────────────────────────────────

interface PropertiesPanelProps {
  node: Node | null;
  onUpdate: (patch: Partial<NodeData>) => void;
}

export function FlowPropertiesPanel({ node, onUpdate }: PropertiesPanelProps) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">Nenhum nó selecionado</p>
        <p className="text-xs text-muted-foreground/70">
          Clique em um nó do canvas para editar suas propriedades.
        </p>
      </div>
    );
  }

  const data = node.data as NodeData;
  const type = node.type as NodeType;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Editando nó</p>
          <p className="text-sm font-semibold capitalize">{type.replace(/_/g, " ")}</p>
        </div>

        {type === "trigger_keyword" && (
          <>
            <Field label="Palavras-chave">
              <KeywordEditor keywords={data.keywords ?? []} onChange={(v) => onUpdate({ keywords: v })} />
            </Field>
            <Field label="Tipo de correspondência">
              <Select value={data.match_type ?? "contains"} onValueChange={(v) => onUpdate({ match_type: v as MatchType })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="exact">Exata</SelectItem>
                  <SelectItem value="starts_with">Começa com</SelectItem>
                  <SelectItem value="regex">Expressão regular</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Escopo do gatilho">
              <Select value={data.scope ?? "general"} onValueChange={(v) => onUpdate({ scope: v as "general" | "channel" })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Geral</SelectItem>
                  <SelectItem value="channel">Canal específico</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {type === "send_message" && (
          <>
            <Field label="Mensagem">
              <Textarea value={data.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} rows={5} className="resize-none text-sm" placeholder="Digite a mensagem..." />
            </Field>
            <VariableHints />
          </>
        )}

        {type === "send_buttons" && (
          <>
            <Field label="Texto da mensagem">
              <Textarea value={data.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} rows={4} className="resize-none text-sm" placeholder="Texto acima dos botões..." />
            </Field>
            <Field label="Botões (máx. 3)">
              <ButtonsEditor buttons={data.buttons ?? []} onChange={(v) => onUpdate({ buttons: v })} />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">Aguardar resposta</p>
                <p className="text-[11px] text-muted-foreground">Pausa o flow até o usuário clicar</p>
              </div>
              <Switch checked={data.wait_for_reply ?? true} onCheckedChange={(v) => onUpdate({ wait_for_reply: v })} />
            </div>
            <VariableHints />
          </>
        )}

        {type === "question" && (
          <>
            <Field label="Pergunta">
              <Textarea value={data.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} rows={4} className="resize-none text-sm" placeholder="Digite a pergunta..." />
            </Field>
            <Field label="Salvar resposta em (variável)">
              <Input value={data.save_response_to ?? ""} onChange={(e) => onUpdate({ save_response_to: e.target.value })} placeholder="Ex: nome, email..." className="h-9 text-sm" />
            </Field>
            <Field label="Timeout (horas)">
              <Input type="number" min={1} value={data.timeout_hours ?? 24} onChange={(e) => onUpdate({ timeout_hours: Number(e.target.value) })} className="h-9 text-sm" />
            </Field>
            <VariableHints />
          </>
        )}

        {type === "condition" && (
          <>
            <Field label="Variável">
              <Input value={data.variable ?? ""} onChange={(e) => onUpdate({ variable: e.target.value })} placeholder="Ex: nome" className="h-9 text-sm" />
            </Field>
            <Field label="Operador">
              <Select value={data.operator ?? "contains"} onValueChange={(v) => onUpdate({ operator: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="eq">Igual (=)</SelectItem>
                  <SelectItem value="ne">Diferente (≠)</SelectItem>
                  <SelectItem value="starts_with">Começa com</SelectItem>
                  <SelectItem value="regex">Expressão regular</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Valor">
              <Input value={data.value ?? ""} onChange={(e) => onUpdate({ value: e.target.value })} placeholder="Valor a comparar" className="h-9 text-sm" />
            </Field>
          </>
        )}

        {type === "send_document" && (
          <>
            <Field label="URL do documento">
              <Input value={data.url ?? ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://..." className="h-9 text-sm" />
            </Field>
            <Field label="Nome do arquivo">
              <Input value={data.filename ?? ""} onChange={(e) => onUpdate({ filename: e.target.value })} placeholder="arquivo.pdf" className="h-9 text-sm" />
            </Field>
            <Field label="Legenda (opcional)">
              <Textarea value={data.caption ?? ""} onChange={(e) => onUpdate({ caption: e.target.value })} rows={2} className="resize-none text-sm" />
            </Field>
          </>
        )}

        {type === "set_variable" && (
          <>
            <Field label="Nome da variável">
              <Input value={data.variable ?? ""} onChange={(e) => onUpdate({ variable: e.target.value })} placeholder="Ex: etapa" className="h-9 text-sm" />
            </Field>
            <Field label="Valor">
              <Input value={data.value ?? ""} onChange={(e) => onUpdate({ value: e.target.value })} placeholder="Valor ou {{var.X}}" className="h-9 text-sm" />
            </Field>
          </>
        )}

        {type === "go_to_flow" && (
          <>
            <Field label="ID do flow de destino">
              <Input value={data.flow_id ?? ""} onChange={(e) => onUpdate({ flow_id: e.target.value })} placeholder="UUID do flow" className="h-9 text-sm" />
            </Field>
            <p className="text-[11px] text-muted-foreground/70">
              O contato será redirecionado para o flow indicado.
            </p>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
