/**
 * ContentCampanhasPage — listagem e gestão de campanhas de conteúdo.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Plus, Search, Calendar, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { useContentCampaigns, type ContentCampaign } from "@/hooks/useContentCampaigns";

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  client_id:   z.string().min(1, "Selecione o cliente"),
  title:       z.string().min(1, "Título obrigatório"),
  description: z.string().optional(),
  objective:   z.string().optional(),
  status:      z.string().default("rascunho"),
  start_date:  z.string().optional(),
  end_date:    z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const OBJECTIVES = [
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "lead_gen",        label: "Geração de Leads" },
  { value: "engagement",      label: "Engajamento" },
  { value: "retention",       label: "Retenção" },
  { value: "lancamento",      label: "Lançamento" },
  { value: "outro",           label: "Outro" },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  rascunho:  { label: "Rascunho",  className: "bg-gray-100 text-gray-600" },
  ativa:     { label: "Ativa",     className: "bg-green-100 text-green-700" },
  concluida: { label: "Concluída", className: "bg-blue-100 text-blue-700" },
  arquivada: { label: "Arquivada", className: "bg-gray-100 text-gray-400" },
};

// ── Componente ────────────────────────────────────────────────────────────────

export function ContentCampanhasPage() {
  const organizationId = useOrganization();
  const [search,     setSearch]     = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [clientFilter, setClientFilter] = useState("all");

  const { data: clients = [] }                  = useClients(organizationId);
  const { campaigns, loading, create, isCreating } = useContentCampaigns(
    organizationId,
    clientFilter !== "all" ? clientFilter : undefined,
  );

  const filtered = search.trim()
    ? campaigns.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : campaigns;

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function handleCreate(values: FormValues) {
    try {
      await create({
        client_id:   values.client_id,
        title:       values.title,
        description: values.description ?? null,
        objective:   (values.objective as ContentCampaign["objective"]) ?? null,
        status:      (values.status as ContentCampaign["status"]) ?? "rascunho",
        start_date:  values.start_date ?? null,
        end_date:    values.end_date   ?? null,
        metadata:    {},
        created_by:  null,
      });
      setShowForm(false);
      form.reset();
      toast.success("Campanha criada com sucesso");
    } catch {
      toast.error("Falha ao criar campanha");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Campanhas de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} campanha{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova Campanha
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar campanhas..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid de campanhas */}
      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-10">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>Nenhuma campanha encontrada.</p>
          <Button variant="link" onClick={() => setShowForm(true)}>Criar a primeira campanha</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(camp => {
            const statusCfg = STATUS_LABELS[camp.status] ?? STATUS_LABELS.rascunho;
            return (
              <Card key={camp.id} className="hover:shadow-sm transition-shadow cursor-pointer border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-snug">{camp.title}</CardTitle>
                    <Badge variant="outline" className={`border-0 text-xs shrink-0 ${statusCfg.className}`}>
                      {statusCfg.label}
                    </Badge>
                  </div>
                  {camp.client_name && (
                    <p className="text-xs text-muted-foreground">{camp.client_name}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  {camp.objective && (
                    <p>{OBJECTIVES.find(o => o.value === camp.objective)?.label ?? camp.objective}</p>
                  )}
                  {(camp.start_date || camp.end_date) && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {camp.start_date && format(parseISO(camp.start_date), "dd/MM/yy", { locale: ptBR })}
                      {camp.start_date && camp.end_date && " → "}
                      {camp.end_date && format(parseISO(camp.end_date), "dd/MM/yy", { locale: ptBR })}
                    </div>
                  )}
                  <p className="font-medium text-foreground/70">{camp.items_count ?? 0} iten{camp.items_count !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog novo */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <FormField control={form.control} name="client_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl><Input placeholder="Nome da campanha" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="objective" render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="start_date" render={({ field }) => (
                  <FormItem><FormLabel>Início</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="end_date" render={({ field }) => (
                  <FormItem><FormLabel>Fim</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
