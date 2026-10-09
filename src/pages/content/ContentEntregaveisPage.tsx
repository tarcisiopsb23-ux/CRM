/**
 * ContentEntregaveisPage — entregáveis formais de conteúdo.
 * Geração de PDF via window.print() (padrão ContractViewer).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Download, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import { useContentDeliverables } from "@/hooks/useContentDeliverables";

export function ContentEntregaveisPage() {
  const organizationId  = useOrganization();
  const [search, setSearch] = useState("");

  const { deliverables, loading, update } = useContentDeliverables(organizationId);

  const filtered = search.trim()
    ? deliverables.filter(d => d.title.toLowerCase().includes(search.toLowerCase()))
    : deliverables;

  async function toggleVisibility(id: string, current: boolean) {
    try {
      await update({ id, is_visible_to_client: !current });
      toast.success(!current ? "Visível para o cliente" : "Ocultado do cliente");
    } catch {
      toast.error("Falha ao atualizar visibilidade");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Entregáveis</h1>
          <p className="text-sm text-muted-foreground">
            Relatórios formais ao final de cada ciclo de conteúdo.
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" />Novo Entregável
        </Button>
      </div>

      <div className="relative max-w-[300px]">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar entregáveis..."
          className="pl-8"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>Nenhum entregável ainda.</p>
          <p className="text-xs mt-1">Os entregáveis são gerados ao concluir um ciclo de conteúdo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => (
            <Card key={d.id} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-snug">{d.title}</CardTitle>
                  <Badge variant="outline" className={`border-0 text-xs ${d.is_visible_to_client ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {d.is_visible_to_client ? "Visível" : "Oculto"}
                  </Badge>
                </div>
                {d.client_name && (
                  <p className="text-xs text-muted-foreground">{d.client_name}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {(d.period_start || d.period_end) && (
                  <p>
                    {d.period_start && format(parseISO(d.period_start), "dd/MM/yy", { locale: ptBR })}
                    {d.period_start && d.period_end && " – "}
                    {d.period_end && format(parseISO(d.period_end), "dd/MM/yy", { locale: ptBR })}
                  </p>
                )}
                <div className="flex items-center gap-3 text-foreground/70">
                  <span><strong>{d.items_count}</strong> iten{d.items_count !== 1 ? "s" : ""}</span>
                  {d.reach_total > 0 && (
                    <span><strong>{d.reach_total.toLocaleString("pt-BR")}</strong> alcance</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => toggleVisibility(d.id, d.is_visible_to_client)}
                  >
                    {d.is_visible_to_client
                      ? <><EyeOff className="h-3 w-3 mr-1" />Ocultar</>
                      : <><Eye className="h-3 w-3 mr-1" />Liberar</>
                    }
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" disabled>
                    <Download className="h-3 w-3 mr-1" />PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
