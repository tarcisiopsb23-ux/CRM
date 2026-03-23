import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateAvaliacaoTecnica } from "@/hooks/useAvaliacoesTecnicas";
import type { CriterioTecnico } from "@/types/avaliacao360";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId: string;
  organizationId: string;
  colaboradorNome?: string;
}

interface CriterioForm {
  nome: string;
  nota: string;
  comentario: string;
}

const EMPTY_CRITERIO: CriterioForm = { nome: "", nota: "", comentario: "" };

export function AvaliacaoTecnicaDialog({ open, onOpenChange, colaboradorId, organizationId, colaboradorNome }: Props) {
  const createAvaliacao = useCreateAvaliacaoTecnica();
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [notaGeral, setNotaGeral] = useState<number | null>(null);
  const [criterios, setCriterios] = useState<CriterioForm[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const resetForm = () => {
    setTitulo("");
    setData("");
    setNotaGeral(null);
    setCriterios([]);
    setObservacoes("");
  };

  const addCriterio = () => setCriterios((prev) => [...prev, { ...EMPTY_CRITERIO }]);

  const updateCriterio = (index: number, field: keyof CriterioForm, value: string) => {
    setCriterios((prev) => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const removeCriterio = (index: number) => {
    setCriterios((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validação: título
    if (!titulo.trim()) {
      toast.error("O título não pode estar em branco");
      return;
    }

    // Validação: data
    if (!data) {
      toast.error("Informe a data da avaliação");
      return;
    }

    // Validação: nota_geral
    if (notaGeral === null || notaGeral < 1 || notaGeral > 5) {
      toast.error("A nota geral deve ser entre 1 e 5");
      return;
    }

    // Validação: critérios (se preenchidos, devem ter nome e nota válida)
    for (let i = 0; i < criterios.length; i++) {
      const c = criterios[i];
      if (!c.nome.trim()) {
        toast.error(`Critério ${i + 1}: informe o nome`);
        return;
      }
      const nota = parseInt(c.nota);
      if (isNaN(nota) || nota < 1 || nota > 5) {
        toast.error(`Critério ${i + 1}: nota deve ser entre 1 e 5`);
        return;
      }
    }

    const criteriosPayload: CriterioTecnico[] = criterios.map((c) => ({
      nome: c.nome.trim(),
      nota: parseInt(c.nota),
      comentario: c.comentario.trim() || null,
    }));

    await createAvaliacao.mutateAsync({
      organization_id: organizationId,
      colaborador_id: colaboradorId,
      titulo: titulo.trim(),
      data,
      nota_geral: notaGeral,
      criterios: criteriosPayload,
      observacoes: observacoes.trim() || null,
    });

    toast.success("Avaliação técnica registrada");
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Avaliação Técnica</DialogTitle>
          {colaboradorNome && (
            <div className="mt-1 px-3 py-2 rounded-md bg-primary/8 border border-primary/20">
              <p className="text-xs text-muted-foreground">Avaliando</p>
              <p className="text-base font-semibold text-primary leading-tight">{colaboradorNome}</p>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input
              placeholder="Ex: Avaliação de Competências Técnicas Q1/2025"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Data *</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Nota Geral (1–5) *</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNotaGeral(n)}
                  className={`w-10 h-10 rounded-full border text-sm font-semibold transition-colors ${
                    notaGeral === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary hover:text-primary"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Critérios dinâmicos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Critérios Técnicos</Label>
              <Button type="button" size="sm" variant="outline" onClick={addCriterio}>
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </div>

            {criterios.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum critério adicionado (opcional).</p>
            )}

            {criterios.map((c, i) => (
              <div key={i} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Critério {i + 1}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => removeCriterio(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Nome *</Label>
                    <Input
                      placeholder="Ex: Domínio técnico"
                      value={c.nome}
                      onChange={(e) => updateCriterio(i, "nome", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nota (1–5) *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={c.nota}
                      onChange={(e) => updateCriterio(i, "nota", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comentário</Label>
                  <Input
                    placeholder="Opcional"
                    value={c.comentario}
                    onChange={(e) => updateCriterio(i, "comentario", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              placeholder="Observações gerais sobre a avaliação..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createAvaliacao.isPending}>
            {createAvaliacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Avaliação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
