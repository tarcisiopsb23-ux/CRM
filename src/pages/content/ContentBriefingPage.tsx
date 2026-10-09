/**
 * ContentBriefingPage — listagem e criação de briefings de conteúdo.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, FileText, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/hooks/useOrganization";
import { useContentBriefs } from "@/hooks/useContentBriefs";
import { ContentBriefForm } from "@/components/content/ContentBriefForm";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho",  className: "bg-gray-100 text-gray-600" },
  enviado:  { label: "Enviado",   className: "bg-blue-100 text-blue-700" },
  aceito:   { label: "Aceito",    className: "bg-emerald-100 text-emerald-700" },
  revisao:  { label: "Em Revisão", className: "bg-amber-100 text-amber-700" },
};

export function ContentBriefingPage() {
  const organizationId = useOrganization();
  const [search,   setSearch]   = useState("");
  const [showForm, setShowForm] = useState(false);

  const { briefs, loading, create, send, isCreating } = useContentBriefs(organizationId);

  const filtered = search.trim()
    ? briefs.filter(b => b.title.toLowerCase().includes(search.toLowerCase()))
    : briefs;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Briefings</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} briefing{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />Novo Briefing
        </Button>
      </div>

      <div className="relative max-w-[300px]">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar briefings..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum briefing encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(brief => {
            const statusCfg = STATUS_CONFIG[brief.status] ?? STATUS_CONFIG.rascunho;
            return (
              <Card key={brief.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("border-0 text-xs", statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                        {brief.client_name && (
                          <span className="text-xs text-muted-foreground">{brief.client_name}</span>
                        )}
                      </div>
                      <p className="font-medium text-sm truncate">{brief.title}</p>
                      {brief.objective && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{brief.objective}</p>
                      )}
                      {brief.deadline && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Prazo: {format(parseISO(brief.deadline), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    {brief.status === "rascunho" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await send(brief.id);
                            toast.success("Briefing enviado para o cliente");
                          } catch {
                            toast.error("Falha ao enviar briefing");
                          }
                        }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />Enviar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Briefing</DialogTitle></DialogHeader>
          <ContentBriefForm
            onSubmit={async values => {
              try {
                await create(values);
                setShowForm(false);
                toast.success("Briefing criado");
              } catch {
                toast.error("Falha ao criar briefing");
              }
            }}
            onCancel={() => setShowForm(false)}
            loading={isCreating}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
