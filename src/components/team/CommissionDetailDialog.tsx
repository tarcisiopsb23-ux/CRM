import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useCommissionEntrySales } from "@/hooks/useCommissionEntries";
import type { CommissionEntry } from "@/types/commission";
import { formatBRL } from "@/lib/formatters";

interface Props {
  entry: CommissionEntry;
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = { pending: "Pendente", approved: "Aprovado", paid: "Pago" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
};

function monthLabel(ref: string) {
  const [y, mo] = ref.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[Number(mo) - 1]}/${y}`;
}

export function CommissionDetailDialog({ entry, open, onClose }: Props) {
  const { data: sales = [], isLoading } = useCommissionEntrySales(entry.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comissão — {monthLabel(entry.month_reference)}</DialogTitle>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Total Vendas" value={formatBRL(entry.total_sales_value)} />
          <Stat label="Comissão" value={formatBRL(entry.commission_value)} />
          <Stat label="% Meta" value={entry.goal_achieved_pct != null ? `${entry.goal_achieved_pct}%` : "—"} />
          <Stat label="Bônus" value={entry.bonus_value > 0 ? formatBRL(entry.bonus_value) : "—"} />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="secondary" className={STATUS_COLOR[entry.status]}>
            {STATUS_LABEL[entry.status]}
          </Badge>
          {entry.notes && <span className="text-muted-foreground ml-2">— {entry.notes}</span>}
        </div>

        {/* Vendas vinculadas */}
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Vendas Vinculadas</p>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : sales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda vinculada</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Data Venda</TableHead>
                    <TableHead>Data Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.client_name}</TableCell>
                      <TableCell>{s.product ?? "—"}</TableCell>
                      <TableCell>{s.sale_date ? new Date(s.sale_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell>{s.first_payment_date ? new Date(s.first_payment_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(s.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}
