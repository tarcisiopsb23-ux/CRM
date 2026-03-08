import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useProjects, useTasks } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ProjectsPage() {
  const organizationId = useOrganization();
  const { data: projects = [], isLoading, create } = useProjects(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", start_date: "", end_date: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        title: form.title,
        description: form.description || null,
        start_date: form.start_date || new Date().toISOString().slice(0, 10),
        end_date: form.end_date || null,
        status: "ativo",
      });
      setModalOpen(false);
      setForm({ title: "", description: "", start_date: "", end_date: "" });
    } catch (err) {
      console.error(err);
    }
  };

  if (!organizationId) {
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
          <h1 className="font-display text-2xl font-bold text-foreground">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Controle de projetos e tarefas (Gantt em evolução)
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo projeto
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de projetos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : projects.length === 0 ? (
            <p className="text-muted-foreground">Nenhum projeto cadastrado. Crie um novo projeto para começar.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  projectId={p.id}
                  organizationId={organizationId}
                  title={p.title}
                  startDate={p.start_date}
                  endDate={p.end_date}
                  status={p.status}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Nome do projeto"
                required
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrição"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Data fim</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
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

function ProjectRow({
  projectId,
  organizationId,
  title,
  startDate,
  endDate,
  status,
}: {
  projectId: string;
  organizationId: string | undefined;
  title: string;
  startDate: string;
  endDate: string | null;
  status: string;
}) {
  const { data: tasks = [] } = useTasks(projectId, organizationId);
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <FolderKanban className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(startDate), "dd/MM/yyyy", { locale: ptBR })}
            {endDate && ` – ${format(new Date(endDate), "dd/MM/yyyy", { locale: ptBR })}`}
            {" • "}{tasks.length} tarefa(s)
          </p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{status}</span>
    </div>
  );
}
