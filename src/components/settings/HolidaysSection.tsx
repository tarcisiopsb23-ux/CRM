import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, RefreshCw, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface BrasilAPIHoliday {
  date: string;
  name: string;
  type: string;
}

interface HolidayRow {
  id: string;
  organization_id: string | null;
  holiday_date: string;
  description: string;
  is_national: boolean;
  day_type: "feriado" | "ponto_facultativo";
}

export function HolidaysSection() {
  const orgId = useOrganization();
  const qc = useQueryClient();

  const [syncYear, setSyncYear] = useState(() => new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({
    date: "",
    description: "",
    day_type: "feriado" as "feriado" | "ponto_facultativo",
    is_national: false,
  });

  const holidays = useQuery<HolidayRow[]>({
    queryKey: ["rep_p_holidays", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rep_p_holidays")
        .select("*")
        .or(`organization_id.eq.${orgId},is_national.eq.true`)
        .order("holiday_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HolidayRow[];
    },
    enabled: !!orgId && listOpen,
  });

  const syncHolidays = async (year = syncYear) => {
    setSyncing(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (!res.ok) throw new Error("Erro ao consultar BrasilAPI");
      const apiHolidays: BrasilAPIHoliday[] = await res.json();

      // DELETE + INSERT para nacionais do ano (evita problema de NULL em UNIQUE)
      await supabase
        .from("rep_p_holidays")
        .delete()
        .eq("is_national", true)
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`);

      const rows = apiHolidays.map((h) => ({
        holiday_date: h.date,
        description: h.name,
        is_national: true,
        day_type: "feriado" as const,
        organization_id: null as string | null,
      }));

      const { error } = await supabase.from("rep_p_holidays").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} feriados de ${year} sincronizados`);
      qc.invalidateQueries({ queryKey: ["rep_p_holidays", orgId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar feriados");
    } finally {
      setSyncing(false);
    }
  };

  const addHoliday = async () => {
    if (!newHoliday.date || !newHoliday.description.trim()) {
      toast.error("Informe data e descrição");
      return;
    }
    const { error } = await supabase.from("rep_p_holidays").insert({
      organization_id: newHoliday.is_national ? null : orgId,
      holiday_date: newHoliday.date,
      description: newHoliday.description,
      is_national: newHoliday.is_national,
      day_type: newHoliday.day_type,
    });
    if (error) { toast.error("Erro ao adicionar"); return; }
    toast.success("Adicionado com sucesso");
    setNewHoliday({ date: "", description: "", day_type: "feriado", is_national: false });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["rep_p_holidays", orgId] });
  };

  const removeHoliday = async (id: string) => {
    const { error } = await supabase.from("rep_p_holidays").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Removido");
    qc.invalidateQueries({ queryKey: ["rep_p_holidays", orgId] });
  };

  return (
    <SettingsSection
      title="Feriados e Pontos Facultativos"
      description="Feriados nacionais bloqueiam o registro de ponto sem autorização. Sincronize automaticamente via BrasilAPI ou adicione datas customizadas da sua organização."
      icon={<CalendarDays className="h-5 w-5" />}
    >
      {/* Sync BrasilAPI */}
      <div className="flex flex-wrap items-end gap-3 border rounded-lg p-4 bg-muted/30">
        <div className="space-y-1 flex-1 min-w-48">
          <Label>Sincronizar feriados nacionais — BrasilAPI</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={2024}
              max={2035}
              value={syncYear}
              onChange={(e) => setSyncYear(Number(e.target.value))}
              className="w-28"
            />
            <Button onClick={() => syncHolidays()} disabled={syncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : `Sincronizar ${syncYear}`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Fonte: brasilapi.com.br — sincronização automática ocorre todo dia 01/01
          </p>
        </div>
        <Button variant="outline" onClick={() => setListOpen(true)}>
          <CalendarDays className="h-4 w-4 mr-1" /> Mostrar Feriados
        </Button>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar data
        </Button>
      </div>

      {/* Dialog: Lista de feriados */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-[75vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Feriados e Pontos Facultativos
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : holidays.data?.length ? (
                  holidays.data.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm font-medium">
                        {format(new Date(h.holiday_date + "T12:00:00"), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-sm">{h.description}</TableCell>
                      <TableCell>
                        <Badge variant={h.day_type === "feriado" ? "destructive" : "secondary"}>
                          {h.day_type === "feriado" ? "Feriado" : "Ponto Facultativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={h.is_national ? "default" : "outline"}>
                          {h.is_national ? "Nacional" : "Customizado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!h.is_national && (
                          <Button variant="ghost" size="sm" onClick={() => removeHoliday(h.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhuma data cadastrada. Clique em "Sincronizar" para importar os feriados nacionais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Feriado / Ponto Facultativo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={newHoliday.day_type}
                onValueChange={(v) => setNewHoliday((p) => ({ ...p, day_type: v as "feriado" | "ponto_facultativo" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feriado">Feriado — bloqueia ponto sem autorização</SelectItem>
                  <SelectItem value="ponto_facultativo">Ponto Facultativo — exibe aviso, não bloqueia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Select
                value={newHoliday.is_national ? "nacional" : "customizado"}
                onValueChange={(v) => setNewHoliday((p) => ({ ...p, is_national: v === "nacional" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customizado">Customizado — válido apenas para esta organização</SelectItem>
                  <SelectItem value="nacional">Nacional — válido para todas as organizações</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input
                type="date"
                value={newHoliday.date}
                onChange={(e) => setNewHoliday((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={newHoliday.description}
                onChange={(e) => setNewHoliday((p) => ({ ...p, description: e.target.value }))}
                placeholder="Ex: Aniversário da cidade, Ponto facultativo municipal..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addHoliday}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
