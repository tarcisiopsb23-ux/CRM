import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Package, Wrench, RefreshCw, Zap } from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  type: "produto" | "servico";
  recurrence: "continuo" | "esporadico";
  active: boolean;
  created_at: string;
};

const EMPTY: Omit<Product, "id" | "created_at"> = {
  name: "", description: null, category: null,
  type: "servico", recurrence: "continuo", active: true,
};

const CATEGORIES = [
  "Consultoria", "Marketing", "Tecnologia", "Saúde", "Educação",
  "Beleza", "Alimentação", "Construção", "Jurídico", "Financeiro", "Outro",
];

export function CatalogPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id" | "created_at">>(EMPTY);
  const [filter, setFilter] = useState<"todos" | "produto" | "servico">("todos");

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const fetch = async () => {
    const { data, error } = await supabase
      .from("products").select("*").order("name");
    if (error) { toast.error("Erro ao carregar catálogo"); return; }
    setProducts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description, category: p.category,
      type: p.type, recurrence: p.recurrence, active: p.active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    if (editing) {
      const { error } = await supabase.from("products").update(form).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Atualizado");
    } else {
      const { error } = await supabase.from("products").insert(form);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Criado");
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Excluído");
    fetch();
  };

  const toggleActive = async (p: Product) => {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    fetch();
  };

  const filtered = products.filter(p => filter === "todos" || p.type === filter);
  const ativos = products.filter(p => p.active).length;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Catálogo</h1>
              <p className="text-slate-400 text-sm">{ativos} itens ativos · {products.length} total</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
            <Plus className="h-4 w-4" /> Novo Item
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {(["todos", "produto", "servico"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                filter === f ? "bg-[#7C3AED] text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}>
              {f === "todos" ? "Todos" : f === "produto" ? "Produtos" : "Serviços"}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="bg-[#1E293B] border-slate-800">
            <CardContent className="py-16 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum item cadastrado ainda.</p>
              <Button onClick={openNew} variant="link" className="text-[#7C3AED] mt-2">Cadastrar primeiro item</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(p => (
              <Card key={p.id} className={`bg-[#1E293B] border-slate-800 transition-opacity ${!p.active ? "opacity-50" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.type === "produto"
                          ? <Package className="h-4 w-4 text-violet-400 shrink-0" />
                          : <Wrench className="h-4 w-4 text-blue-400 shrink-0" />}
                        <p className="font-bold text-white truncate">{p.name}</p>
                        {!p.active && <Badge className="bg-slate-700 text-slate-400 text-[10px]">Inativo</Badge>}
                      </div>
                      {p.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {p.category && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{p.category}</span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          p.recurrence === "continuo" ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400"
                        }`}>
                          {p.recurrence === "continuo" ? <RefreshCw className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
                          {p.recurrence === "continuo" ? "Contínuo" : "Esporádico"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => toggleActive(p)}
                        className={`p-1.5 rounded hover:bg-slate-700 text-xs font-bold ${p.active ? "text-emerald-400" : "text-slate-600"}`}
                        title={p.active ? "Desativar" : "Ativar"}>
                        {p.active ? "●" : "○"}
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white font-black">{editing ? "Editar Item" : "Novo Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-slate-300">Nome *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white" placeholder="Nome do produto ou serviço" />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">Descrição</Label>
              <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value || null)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-sm resize-none h-20"
                placeholder="Descreva brevemente o que é oferecido..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-300">Tipo</Label>
                <Select value={form.type} onValueChange={v => set("type", v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="produto">Produto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Recorrência</Label>
                <Select value={form.recurrence} onValueChange={v => set("recurrence", v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="continuo">Contínuo</SelectItem>
                    <SelectItem value="esporadico">Esporádico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Categoria</Label>
                <Select value={form.category ?? "__none__"} onValueChange={v => set("category", v === "__none__" ? null : v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Sem categoria —</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Status</Label>
                <Select value={form.active ? "ativo" : "inativo"} onValueChange={v => set("active", v === "ativo")}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-400">Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
