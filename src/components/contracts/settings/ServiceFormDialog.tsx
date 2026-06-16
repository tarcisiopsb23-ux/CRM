// src/components/contracts/settings/ServiceFormDialog.tsx
// Dialog for creating or editing a Service Catalog item.
// Requirements: 1.1, 1.3, 1.4, 1.5

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
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
// Sub-service type options
// ---------------------------------------------------------------------------

const SUB_SERVICE_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Sim/Não" },
  { value: "select", label: "Seleção" },
] as const;

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
      sub_services: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "sub_services",
  });

  // Reset form when the dialog opens or the service changes
  useEffect(() => {
    if (open) {
      form.reset(
        service
          ? {
              name: service.name,
              category: service.category,
              sub_services: service.sub_services ?? [],
            }
          : { name: "", category: "", sub_services: [] }
      );
    }
  }, [open, service, form]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddSubService = () => {
    append({
      id: crypto.randomUUID(),
      name: "",
      type: "text",
      options: undefined,
    });
  };

  const onSubmit = async (values: ServiceCatalogInput) => {
    try {
      if (isEditing && service) {
        await updateService.mutateAsync({
          id: service.id,
          name: values.name,
          category: values.category,
          sub_services: values.sub_services as import("@/types/contracts").SubService[],
        });
        toast.success("Serviço atualizado com sucesso.");
      } else {
        await createService.mutateAsync({
          name: values.name,
          category: values.category,
          sub_services: values.sub_services as import("@/types/contracts").SubService[],
        });
        toast.success("Serviço criado com sucesso.");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      // Duplicate name errors are already shown via toast in the hook.
      // For other errors, surface them inline on the name field.
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── Nome ── */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: Gestão de Redes Sociais"
                      maxLength={150}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Categoria ── */}
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

            {/* ── Sub-serviços ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Sub-serviços</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubService}
                  disabled={isBusy}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar sub-serviço
                </Button>
              </div>

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum sub-serviço adicionado.
                </p>
              )}

              <div className="space-y-3">
                {fields.map((fieldItem, index) => (
                  <SubServiceRow
                    key={fieldItem.id}
                    index={index}
                    form={form}
                    onRemove={() => remove(index)}
                    disabled={isBusy}
                  />
                ))}
              </div>

              {/* Field-level error for the sub_services array */}
              {form.formState.errors.sub_services?.root?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.sub_services.root.message}
                </p>
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
// SubServiceRow — extracted for clarity
// ---------------------------------------------------------------------------

interface SubServiceRowProps {
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<ServiceCatalogInput>>;
  onRemove: () => void;
  disabled?: boolean;
}

function SubServiceRow({ index, form, onRemove, disabled }: SubServiceRowProps) {
  const { control, watch, setValue, formState: { errors } } = form;

  const currentType = watch(`sub_services.${index}.type`);
  const subServiceErrors = errors.sub_services?.[index];

  // When the type changes away from "select", clear the options
  const handleTypeChange = (value: string) => {
    setValue(
      `sub_services.${index}.type`,
      value as "number" | "text" | "boolean" | "select",
      { shouldValidate: true }
    );
    if (value !== "select") {
      setValue(`sub_services.${index}.options`, undefined, { shouldValidate: true });
    } else {
      setValue(`sub_services.${index}.options`, [], { shouldValidate: true });
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      {/* Row: name + type + remove */}
      <div className="flex items-start gap-2">
        {/* Name */}
        <div className="flex-1 space-y-1">
          <Controller
            control={control}
            name={`sub_services.${index}.name`}
            render={({ field }) => (
              <div className="space-y-1">
                <Input
                  {...field}
                  placeholder="Nome do sub-serviço"
                  disabled={disabled}
                  aria-label={`Nome do sub-serviço ${index + 1}`}
                />
                {subServiceErrors?.name?.message && (
                  <p className="text-xs font-medium text-destructive">
                    {subServiceErrors.name.message}
                  </p>
                )}
              </div>
            )}
          />
        </div>

        {/* Type selector */}
        <div className="w-36 space-y-1">
          <Controller
            control={control}
            name={`sub_services.${index}.type`}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={handleTypeChange}
                disabled={disabled}
              >
                <SelectTrigger aria-label={`Tipo do sub-serviço ${index + 1}`}>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {SUB_SERVICE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Remove button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover sub-serviço ${index + 1}`}
          className="mt-0 shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Options textarea — visible only when type === "select" */}
      {currentType === "select" && (
        <Controller
          control={control}
          name={`sub_services.${index}.options`}
          render={({ field }) => {
            const rawValue = Array.isArray(field.value) ? field.value.join(", ") : "";

            const handleOptionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const text = e.target.value;
              // Parse comma-separated options, trimming whitespace, removing empty strings
              const parsed = text
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              field.onChange(parsed);
            };

            return (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Opções (separadas por vírgula, mín. 1, máx. 50)
                </Label>
                <Textarea
                  value={rawValue}
                  onChange={handleOptionsChange}
                  disabled={disabled}
                  placeholder="Ex: Básico, Intermediário, Avançado"
                  rows={2}
                  aria-label={`Opções do sub-serviço ${index + 1}`}
                  className="text-sm"
                />
                {subServiceErrors?.options?.message && (
                  <p className="text-xs font-medium text-destructive">
                    {subServiceErrors.options.message}
                  </p>
                )}
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
