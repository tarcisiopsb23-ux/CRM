/**
 * ContentBriefForm — formulário de criação de briefing.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import type { ContentBriefInsert } from "@/hooks/useContentBriefs";

const schema = z.object({
  client_id:       z.string().min(1, "Selecione o cliente"),
  title:           z.string().min(1, "Título obrigatório"),
  objective:       z.string().optional(),
  target_audience: z.string().optional(),
  tone_of_voice:   z.string().optional(),
  restrictions:    z.string().optional(),
  deadline:        z.string().optional(),
  notes:           z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const TONES = [
  "Formal", "Casual", "Técnico", "Divertido", "Inspirador", "Educativo",
];

interface ContentBriefFormProps {
  onSubmit: (values: Omit<ContentBriefInsert, "organization_id">) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ContentBriefForm({ onSubmit, onCancel, loading = false }: ContentBriefFormProps) {
  const organizationId = useOrganization();
  const { data: clients = [] } = useClients(organizationId);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function handleSubmit(values: FormValues) {
    await onSubmit({
      client_id:       values.client_id,
      campaign_id:     null,
      content_item_id: null,
      title:           values.title,
      objective:       values.objective       ?? null,
      target_audience: values.target_audience ?? null,
      key_messages:    [],
      tone_of_voice:   values.tone_of_voice   ?? null,
      references:      [],
      restrictions:    values.restrictions    ?? null,
      deadline:        values.deadline        ?? null,
      notes:           values.notes           ?? null,
      status:          "rascunho",
      client_tasks:    [],
      created_by:      null,
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField control={form.control} name="client_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Cliente *</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger></FormControl>
              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>Título *</FormLabel>
            <FormControl><Input placeholder="Ex: Briefing — Campanha de Inverno" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="objective" render={({ field }) => (
          <FormItem>
            <FormLabel>Objetivo</FormLabel>
            <FormControl>
              <Input placeholder="O que queremos alcançar com este conteúdo?" {...field} value={field.value ?? ""} />
            </FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="target_audience" render={({ field }) => (
          <FormItem>
            <FormLabel>Público-alvo</FormLabel>
            <FormControl>
              <Input placeholder="Para quem é este conteúdo?" {...field} value={field.value ?? ""} />
            </FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="tone_of_voice" render={({ field }) => (
          <FormItem>
            <FormLabel>Tom de Voz</FormLabel>
            <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
              <FormControl><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="">Não especificado</SelectItem>
                {TONES.map(t => <SelectItem key={t} value={t.toLowerCase()}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="deadline" render={({ field }) => (
            <FormItem>
              <FormLabel>Prazo</FormLabel>
              <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="restrictions" render={({ field }) => (
          <FormItem>
            <FormLabel>Restrições</FormLabel>
            <FormControl>
              <Textarea placeholder="O que NÃO pode aparecer no conteúdo..." className="min-h-[70px] resize-none" {...field} value={field.value ?? ""} />
            </FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Observações</FormLabel>
            <FormControl>
              <Textarea placeholder="Informações adicionais para a equipe..." className="min-h-[80px] resize-none" {...field} value={field.value ?? ""} />
            </FormControl>
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar Briefing
          </Button>
        </div>
      </form>
    </Form>
  );
}
