// src/components/contracts/settings/ClauseFormDialog.tsx
// Dialog for creating or editing a Contract Clause.
// Requirements: 2.1, 2.2

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

import {
  contractClauseSchema,
  type ContractClauseInput,
} from "@/lib/contracts/schemas";
import { useContractClauses } from "@/hooks/useContractClauses";
import type { ContractClause, ServiceCatalogItem } from "@/types/contracts";
import { ClauseEditor, isClauseContentEmpty } from "./ClauseEditor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClauseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided → edit mode; when undefined → create mode */
  clause?: ContractClause;
  organizationId: string;
  availableServices?: ServiceCatalogItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_TYPE_OPTIONS = [
  { value: "always", label: "Sempre exibir" },
  { value: "has_setup", label: "Contrato possui setup/implantação" },
  { value: "has_min_duration", label: "Contrato possui prazo mínimo" },
  { value: "has_service", label: "Serviço específico incluído" },
  {
    value: "has_setup_installments",
    label: "Setup parcelado (mais de 1x)",
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClauseFormDialog({
  open,
  onOpenChange,
  clause,
  organizationId,
  availableServices = [],
}: ClauseFormDialogProps) {
  const isEditing = !!clause;
  const { createClause, updateClause } = useContractClauses(organizationId);

  // Track editor emptiness separately (content is z.any(), not tracked by RHF)
  const [isContentEmpty, setIsContentEmpty] = useState(true);

  const form = useForm<ContractClauseInput>({
    resolver: zodResolver(contractClauseSchema),
    defaultValues: {
      title: "",
      content: undefined,
      condition_type: "always",
      condition_value: null,
      is_editable: false,
      service_id: null,
    },
  });

  // Reset form when dialog opens or the clause changes
  useEffect(() => {
    if (open) {
      if (clause) {
        form.reset({
          title: clause.title,
          content: clause.content,
          condition_type: clause.condition_type,
          condition_value: clause.condition_value,
          is_editable: clause.is_editable,
          service_id: clause.service_id,
        });
        // When editing, the content starts non-empty
        setIsContentEmpty(isClauseContentEmpty(clause.content));
      } else {
        form.reset({
          title: "",
          content: undefined,
          condition_type: "always",
          condition_value: null,
          is_editable: false,
          service_id: null,
        });
        setIsContentEmpty(true);
      }
    }
  }, [open, clause, form]);

  // Watch condition_type to show/hide the service_id field
  const conditionType = form.watch("condition_type");
  const showServiceSelector = conditionType === "has_service";

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onSubmit = async (values: ContractClauseInput) => {
    // Manual empty content guard (content is z.any() so zod won't catch this)
    if (isContentEmpty) return;

    try {
      if (isEditing && clause) {
        await updateClause.mutateAsync({
          id: clause.id,
          title: values.title,
          content: values.content,
          condition_type: values.condition_type,
          condition_value: values.condition_value,
          is_editable: values.is_editable,
          service_id: values.service_id ?? null,
        });
        toast.success("Cláusula atualizada com sucesso.");
      } else {
        await createClause.mutateAsync({
          title: values.title,
          content: values.content,
          condition_type: values.condition_type,
          condition_value: values.condition_value,
          is_editable: values.is_editable,
          service_id: values.service_id ?? null,
        });
        toast.success("Cláusula criada com sucesso.");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar cláusula.";
      toast.error(message);
    }
  };

  const isBusy = createClause.isPending || updateClause.isPending;
  const isSaveDisabled = isBusy || isContentEmpty;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isBusy) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Cláusula" : "Nova Cláusula"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* ── Título ── */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Título <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: Cláusula de Confidencialidade"
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Conteúdo ── */}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Conteúdo <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <ClauseEditor
                      value={field.value}
                      onChange={(json) => {
                        field.onChange(json);
                      }}
                      onEmptyChange={setIsContentEmpty}
                      disabled={isBusy}
                    />
                  </FormControl>
                  {isContentEmpty && form.formState.isSubmitted && (
                    <p className="text-sm font-medium text-destructive">
                      O conteúdo da cláusula é obrigatório.
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* ── Tipo de condição ── */}
            <FormField
              control={form.control}
              name="condition_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de condição</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      // Clear service_id when switching away from has_service
                      if (val !== "has_service") {
                        form.setValue("service_id", null, {
                          shouldValidate: true,
                        });
                      }
                    }}
                    disabled={isBusy}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo de condição" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDITION_TYPE_OPTIONS.map((opt) => (
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

            {/* ── Serviço vinculado (only when condition_type === 'has_service') ── */}
            {showServiceSelector && (
              <FormField
                control={form.control}
                name="service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Serviço vinculado{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(val) =>
                        field.onChange(val === "" ? null : val)
                      }
                      disabled={isBusy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o serviço" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableServices.length === 0 ? (
                          <SelectItem value="_empty" disabled>
                            Nenhum serviço disponível
                          </SelectItem>
                        ) : (
                          availableServices.map((svc) => (
                            <SelectItem key={svc.id} value={svc.id}>
                              {svc.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ── Editável pelo consultor ── */}
            <Controller
              control={form.control}
              name="is_editable"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_editable"
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                    disabled={isBusy}
                  />
                  <Label
                    htmlFor="is_editable"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Editável pelo consultor
                  </Label>
                </div>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaveDisabled}
                title={
                  isContentEmpty
                    ? "Adicione conteúdo à cláusula antes de salvar."
                    : undefined
                }
              >
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
