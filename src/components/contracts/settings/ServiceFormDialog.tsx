// src/components/contracts/settings/ServiceFormDialog.tsx
// Dialog for creating or editing a Service Catalog item.
// Redesign v2: entregáveis com output_format (texto/numero), unit e text_value.
// Sub-serviços removidos — toda configuração vive nos entregáveis.

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X, Package, FileText, Target, ListChecks, Hash, AlignLeft } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import { serviceCatalogSchema, type ServiceCatalogInput } from "@/lib/contracts/schemas";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { ServiceCatalogItem } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided → edit mode; when undefined → create mode */
  service?: ServiceCatalogItem;
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODALITY_OPTIONS = [
  { value: "Consultiva",                       label: "Consultiva" },
  { value: "Executiva",                        label: "Executiva" },
  { value: "Híbrida (consultiva e executiva)", label: "Híbrida (consultiva e executiva)" },
] as const;

const DELIVERY_TYPE_OPTIONS = [
  {
    value: "recorrente",
    label: "Recorrente",
    description: "Repete periodicamente durante o contrato",
  },
  {
    value: "unico",
    label: "Único",
    description: "Entregável único, acontece uma vez no contrato",
  },
  {
    value: "pontual",
    label: "Pontual",
    description: "Entregue conforme solicitação ou prazo acordado",
  },
] as const;

const OUTPUT_FORMAT_OPTIONS = [
  {
    value: "texto",
    label: "Texto",
    description: "Texto fixo definido aqui, exibido no contrato",
  },
  {
    value: "numero",
    label: "Quantidade",
    description: "Valor numérico preenchido ao cadastrar o contrato",
  },
] as const;

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-2 pb-1">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm font-semibold leading-none">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  organizationId,
}: ServiceFormDialogProps) {
  const isEditing = !!service;
  const { createService, updateService } = useServiceCatalog(organizationId);

  const form = useForm<ServiceCatalogInput>({
    resolver: zodResolver(serviceCatalogSchema),
    defaultValues: {
      name: "",
      category: "",
      modality: null,
      description_text: null,
      scope: "",
      deliverables: [],
    },
  });

  const {
    fields: deliverableFields,
    append: appendDeliverable,
    remove: removeDeliverable,
  } = useFieldArray({ control: form.control, name: "deliverables" });

  // Reset form when the dialog opens or the service changes.
  // Também reseta ao fechar (open=false) para garantir que o useFieldArray
  // não carregue entregáveis de uma edição anterior ao abrir para criar novo.
  useEffect(() => {
    if (open) {
      form.reset(
        service
          ? {
              name: service.name,
              category: service.category,
              modality: service.modality ?? null,
              description_text: service.description_text ?? null,
              scope: service.scope ?? "",
              deliverables: (service.deliverables ?? []).map((d) => ({
                id: d.id,
                name: d.name,
                delivery_type: d.delivery_type,
                output_format: d.output_format ?? "numero",
                text_value: d.text_value ?? null,
                unit: d.unit ?? null,
                unit_plural: d.unit_plural ?? null,
              })),
            }
          : {
              name: "",
              category: "",
              modality: null,
              description_text: null,
              scope: "",
              deliverables: [],
            },
        { keepDefaultValues: false }
      );
    } else {
      // Limpa ao fechar para não vazar estado no próximo open
      form.reset(
        {
          name: "",
          category: "",
          modality: null,
          description_text: null,
          scope: "",
          deliverables: [],
        },
        { keepDefaultValues: false }
      );
    }
  }, [open, service, form]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddDeliverable = () => {
    appendDeliverable({
      id: crypto.randomUUID(),
      name: "",
      delivery_type: "recorrente",
      output_format: "numero",
      text_value: null,
      unit: null,
      unit_plural: null,
    });
  };

  const onSubmit = async (values: ServiceCatalogInput) => {
    const sanitized = {
      ...values,
      modality: values.modality?.trim() ? values.modality : null,
      description_text: values.description_text?.trim() || null,
      scope: values.scope?.trim() || null,
      deliverables: (values.deliverables ?? []).map((d) => ({
        ...d,
        text_value: d.output_format === "texto" ? (d.text_value?.trim() || null) : null,
        unit: d.output_format === "numero" ? (d.unit?.trim() || null) : null,
        unit_plural: d.output_format === "numero" ? (d.unit_plural?.trim() || null) : null,
      })),
    };

    try {
      if (isEditing && service) {
        await updateService.mutateAsync({
          id: service.id,
          name: sanitized.name,
          category: sanitized.category,
          modality: sanitized.modality,
          description_text: sanitized.description_text,
          scope: sanitized.scope,
          deliverables: sanitized.deliverables as import("@/types/contracts").ServiceDeliverable[],
        });
        toast.success("Serviço atualizado com sucesso.");
      } else {
        await createService.mutateAsync({
          name: sanitized.name,
          category: sanitized.category,
          modality: sanitized.modality,
          description_text: sanitized.description_text,
          scope: sanitized.scope,
          deliverables: sanitized.deliverables as import("@/types/contracts").ServiceDeliverable[],
        });
        toast.success("Serviço criado com sucesso.");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar serviço.";
      const isDuplicate =
        message.toLowerCase().includes("unique") ||
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("duplicado") ||
        message.toLowerCase().includes("23505");
      if (isDuplicate) {
        form.setError("name", {
          type: "server",
          message: "Já existe um serviço com esse nome nesta organização.",
        });
      } else {
        form.setError("name", { type: "server", message });
      }
    }
  };

  const isBusy = createService.isPending || updateService.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isBusy) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Serviço" : "Novo Serviço"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            {/* ══════════════════════════════════════════════════════════════
                SEÇÃO 1 — IDENTIFICAÇÃO
            ══════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">
              <SectionHeader
                icon={<Package className="h-4 w-4" />}
                title="Identificação"
                description="Nome, categoria e modalidade do serviço."
              />

              {/* Nome */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Assessoria de Marketing Digital e Vendas"
                        maxLength={150}
                        disabled={isBusy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Categoria */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Marketing Digital"
                        maxLength={100}
                        disabled={isBusy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Modalidade */}
              <FormField
                control={form.control}
                name="modality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalidade</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(val) => field.onChange(val || null)}
                      disabled={isBusy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a modalidade..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MODALITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* ══════════════════════════════════════════════════════════════
                SEÇÃO 2 — ESCOPO
            ══════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">
              <SectionHeader
                icon={<Target className="h-4 w-4" />}
                title="Escopo"
                description="Contextualize o escopo de atuação para uso em propostas e contratos."
              />

              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Escopo</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Planejamento estratégico, gestão de campanhas, acompanhamento de indicadores e otimizações contínuas."
                        maxLength={1000}
                        rows={3}
                        disabled={isBusy}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* ══════════════════════════════════════════════════════════════
                SEÇÃO 3 — ENTREGÁVEIS
            ══════════════════════════════════════════════════════════════ */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <SectionHeader
                  icon={<ListChecks className="h-4 w-4" />}
                  title="Entregáveis"
                  description="Defina o que será entregue e como a informação aparece no contrato."
                />
                {/* Botão no topo somente quando a lista está vazia */}
                {deliverableFields.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddDeliverable}
                    disabled={isBusy}
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar entregável
                  </Button>
                )}
              </div>

              {deliverableFields.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum entregável adicionado. Clique em "Adicionar entregável" para começar.
                </p>
              )}

              <div className="space-y-3">
                {deliverableFields.map((fieldItem, index) => (
                  <DeliverableRow
                    key={fieldItem.id}
                    index={index}
                    form={form}
                    onRemove={() => removeDeliverable(index)}
                    disabled={isBusy}
                  />
                ))}
              </div>

              {/* Botão no final, largura total, somente quando há ao menos um entregável */}
              {deliverableFields.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddDeliverable}
                  disabled={isBusy}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar entregável
                </Button>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DeliverableRow
// ---------------------------------------------------------------------------

interface DeliverableRowProps {
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<ServiceCatalogInput>>;
  onRemove: () => void;
  disabled?: boolean;
}

function DeliverableRow({ index, form, onRemove, disabled }: DeliverableRowProps) {
  const { control, watch, formState: { errors } } = form;

  const deliveryType  = watch(`deliverables.${index}.delivery_type`);
  const outputFormat  = watch(`deliverables.${index}.output_format`);
  const deliverableErrors = errors.deliverables?.[index];

  // "numero" + "recorrente" → solicita período no contrato (info para o usuário)
  const isRecurrenteNumero = deliveryType === "recorrente" && outputFormat === "numero";

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">

      {/* ── Linha 1: nome + tipo de entrega + remover ── */}
      <div className="flex items-start gap-2">
        {/* Nome */}
        <div className="flex-1 min-w-0 space-y-1">
          <Controller
            control={control}
            name={`deliverables.${index}.name`}
            render={({ field }) => (
              <div className="space-y-1">
                <Input
                  {...field}
                  placeholder="Nome do entregável"
                  disabled={disabled}
                  aria-label={`Nome do entregável ${index + 1}`}
                />
                {deliverableErrors?.name?.message && (
                  <p className="text-xs font-medium text-destructive">
                    {deliverableErrors.name.message}
                  </p>
                )}
              </div>
            )}
          />
        </div>

        {/* Tipo de entrega */}
        <div className="w-36 shrink-0">
          <Controller
            control={control}
            name={`deliverables.${index}.delivery_type`}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger aria-label={`Tipo do entregável ${index + 1}`}>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Remover */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover entregável ${index + 1}`}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Linha 2: formato de saída ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Formato do entregável</Label>
          <Controller
            control={control}
            name={`deliverables.${index}.output_format`}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val);
                  // Limpa campos do formato anterior ao trocar
                  if (val === "texto") {
                    form.setValue(`deliverables.${index}.unit`, null);
                    form.setValue(`deliverables.${index}.unit_plural`, null);
                  } else {
                    form.setValue(`deliverables.${index}.text_value`, null);
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger aria-label={`Formato do entregável ${index + 1}`}>
                  <SelectValue placeholder="Formato" />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        {opt.value === "texto"
                          ? <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                          : <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Singular (quando numero) */}
        {outputFormat === "numero" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Singular <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <Controller
              control={control}
              name={`deliverables.${index}.unit`}
              render={({ field }) => (
                <div className="space-y-1">
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Ex: hora, post, revisão"
                    disabled={disabled}
                    maxLength={50}
                    aria-label={`Unidade singular do entregável ${index + 1}`}
                    className="h-9 text-sm"
                  />
                  {deliverableErrors?.unit?.message && (
                    <p className="text-xs font-medium text-destructive">
                      {deliverableErrors.unit.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>
        )}

        {/* Plural (quando numero) */}
        {outputFormat === "numero" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Plural <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <Controller
              control={control}
              name={`deliverables.${index}.unit_plural`}
              render={({ field }) => (
                <div className="space-y-1">
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Ex: horas, posts, revisões"
                    disabled={disabled}
                    maxLength={50}
                    aria-label={`Unidade plural do entregável ${index + 1}`}
                    className="h-9 text-sm"
                  />
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Campo condicional: texto fixo (quando texto) */}
      {outputFormat === "texto" && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Texto descritivo <span className="text-destructive">*</span>
          </Label>
          <Controller
            control={control}
            name={`deliverables.${index}.text_value`}
            render={({ field }) => (
              <div className="space-y-1">
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Ex: Licença ativa durante toda a vigência do contrato."
                  disabled={disabled}
                  maxLength={500}
                  rows={2}
                  className="resize-none text-sm"
                  aria-label={`Texto do entregável ${index + 1}`}
                />
                {deliverableErrors?.text_value?.message && (
                  <p className="text-xs font-medium text-destructive">
                    {deliverableErrors.text_value.message}
                  </p>
                )}
              </div>
            )}
          />
        </div>
      )}

      {/* Aviso informativo: recorrente + numero solicita período no contrato */}
      {isRecurrenteNumero && (
        <div className="flex items-start gap-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2.5 py-2">
          <span className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
            Por ser <strong>recorrente</strong> com formato <strong>quantidade</strong>, o usuário poderá
            definir o período (por dia, semana, mês, vigência ou sem período) ao cadastrar o contrato.
          </span>
        </div>
      )}

      {/* Badge de resumo */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 capitalize">
          {DELIVERY_TYPE_OPTIONS.find(o => o.value === deliveryType)?.label ?? deliveryType}
        </Badge>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
          {outputFormat === "texto" ? "Texto fixo" : "Quantidade"}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          · Prazo configurável no contrato
        </span>
      </div>
    </div>
  );
}
