import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const EVENT_TYPE_LABELS: Record<string, string> = {
  reuniao: "Reunião",
  ligacao: "Ligação",
  entrega: "Entrega",
  lembrete: "Lembrete",
  outro: "Outro",
};

export default function Agenda() {
  const orgId = useOrganization();
  const { data: events = [], isLoading, create, remove } = useEvents(orgId);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "reuniao",
    start_at: "",
    end_at: "",
    location: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const start = form.start_at ? new Date(form.start_at) : new Date();
      const end = form.end_at ? new Date(form.end_at) : new Date(start.getTime() + 3600000);
      await create.mutateAsync({
        title: form.title,
        description: form.description || null,
        type: form.type,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        location: form.location || null,
      });
      setModalOpen(false);
      setForm({ title: "", description: "", type: "reuniao", start_at: "", end_at: "", location: "" });
    } catch (err) {
      console.error(err);
    }
  };

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Eventos e compromissos. Integração Google Calendar em desenvolvimento.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo evento
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos...
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum evento cadastrado.</p>
            <Button variant="outline" className="mt-4" onClick={() => setModalOpen(true)}>
              Criar primeiro evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {events
            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
            .map((ev) => (
              <Card key={ev.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(ev.start_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {ev.end_at && (
                        <> → {format(new Date(ev.end_at), "HH:mm", { locale: ptBR })}</>
                      )}
                    </p>
                    {ev.location && (
                      <p className="text-xs text-muted-foreground mt-1">{ev.location}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(ev.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Reunião com cliente"
                required
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Local (opcional)</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Sala 1"
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detalhes do evento"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
