// src/components/contracts/settings/TemplateStructureEditor.tsx
// Formulário para editar a estrutura HTML de um template de contrato.
// Inclui pré-visualização via assembleContract com dados fictícios.
// Requirements: 4.1, 4.7

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Eye, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

import { assembleContract } from "@/lib/contracts/assembleContract";
import type { ContractTemplateStructure, ContractTemplateV2 } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateStructureEditorProps {
  structure: ContractTemplateStructure | null;
  onSave: (structure: ContractTemplateStructure) => Promise<void>;
  isSaving?: boolean;
}

type StructureFormValues = ContractTemplateStructure;

// ---------------------------------------------------------------------------
// Mock data for preview — Requirements: 4.7
// ---------------------------------------------------------------------------

const MOCK_CONTRACT = {
  id: "preview",
  title: "Contrato Exemplo",
  value: 1500,
  min_duration_months: 0,
  metadata: {
    services: [] as import("@/types/contracts").SelectedService[],
    setup_installments: 0,
  },
};

const MOCK_CLAUSES = [
  {
    id: "clause-1",
    title: "Prestação de Serviços",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "O CONTRATANTE contrata a CONTRATADA para prestação de serviços de {{servicos}}.",
            },
          ],
        },
      ],
    },
    display_order: 0,
    condition_type: "always" as const,
    condition_value: null,
    is_editable: false,
    service_id: null,
    organization_id: "",
    created_at: "",
    updated_at: "",
  },
];

const MOCK_CLIENT = {
  name: "João Silva",
  company_name: "Empresa Exemplo Ltda",
  cnpj: "00.000.000/0001-00",
};

// ---------------------------------------------------------------------------
// TemplateStructureEditor
// ---------------------------------------------------------------------------

export function TemplateStructureEditor({
  structure,
  onSave,
  isSaving = false,
}: TemplateStructureEditorProps) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const form = useForm<StructureFormValues>({
    defaultValues: {
      header: structure?.header ?? "",
      parties_block: structure?.parties_block ?? "",
      clauses_block: structure?.clauses_block ?? "",
      signature_block: structure?.signature_block ?? "",
      footer: structure?.footer ?? "",
    },
  });

  // Sync form values when the structure prop changes (e.g. after data load)
  useEffect(() => {
    form.reset({
      header: structure?.header ?? "",
      parties_block: structure?.parties_block ?? "",
      clauses_block: structure?.clauses_block ?? "",
      signature_block: structure?.signature_block ?? "",
      footer: structure?.footer ?? "",
    });
  }, [structure, form]);

  // Watch clauses_block to show the {{CLAUSES}} warning
  const clausesBlockValue = form.watch("clauses_block");
  const missingClausesMarker =
    clausesBlockValue !== "" && !clausesBlockValue.includes("{{CLAUSES}}");

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handlePreview() {
    setPreviewError(null);
    const values = form.getValues();

    // Build a minimal ContractTemplateV2 from the current form state
    const mockTemplate: ContractTemplateV2 = {
      id: "preview",
      name: "Preview",
      organization_id: "",
      content: "",
      is_default: false,
      created_at: "",
      updated_at: "",
      structure: {
        header: values.header,
        parties_block: values.parties_block,
        clauses_block: values.clauses_block || "{{CLAUSES}}",
        signature_block: values.signature_block,
        footer: values.footer,
      },
    };

    try {
      const result = assembleContract(
        MOCK_CONTRACT,
        MOCK_CLAUSES,
        mockTemplate,
        MOCK_CLIENT
      );
      setPreviewHtml(result.html);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao gerar pré-visualização.";
      setPreviewError(message);
      setPreviewHtml(null);
    }
  }

  async function onSubmit(values: StructureFormValues) {
    await onSave(values);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* ── Cabeçalho ── */}
          <FormField
            control={form.control}
            name="header"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cabeçalho</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    placeholder="HTML do cabeçalho (logotipo, dados da empresa...)"
                    disabled={isSaving}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Bloco de Partes ── */}
          <FormField
            control={form.control}
            name="parties_block"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bloco de Partes</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={5}
                    placeholder="HTML do bloco de partes. Use {{cliente}}, {{empresa}}, {{cnpj}}..."
                    disabled={isSaving}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Bloco de Cláusulas ── */}
          <FormField
            control={form.control}
            name="clauses_block"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bloco de Cláusulas</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={5}
                    placeholder="HTML do bloco de cláusulas. Deve conter {{CLAUSES}} onde as cláusulas serão injetadas."
                    disabled={isSaving}
                  />
                </FormControl>

                {/* Inline warning when {{CLAUSES}} is absent */}
                {missingClausesMarker && (
                  <p className="text-yellow-600 text-sm">
                    ⚠ O campo deve conter o marcador {"{{CLAUSES}}"} para que as cláusulas sejam injetadas.
                  </p>
                )}

                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Bloco de Assinaturas ── */}
          <FormField
            control={form.control}
            name="signature_block"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bloco de Assinaturas</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    placeholder="HTML do bloco de assinaturas..."
                    disabled={isSaving}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Rodapé ── */}
          <FormField
            control={form.control}
            name="footer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rodapé</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="HTML do rodapé..."
                    disabled={isSaving}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Action buttons ── */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={isSaving}
            >
              <Eye className="h-4 w-4 mr-2" />
              Pré-visualizar
            </Button>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      {/* ── Preview panel ── */}
      {previewError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <strong>Erro na pré-visualização:</strong> {previewError}
        </div>
      )}

      {previewHtml && !previewError && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Pré-visualização</Label>
          <div className="rounded-lg border border-border overflow-auto max-h-[600px] bg-white p-4">
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      )}
    </div>
  );
}
