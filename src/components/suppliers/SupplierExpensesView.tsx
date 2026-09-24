import { useSupplierExpenses } from "@/hooks/useFinancial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SupplierExpensesViewProps {
  organizationId: string;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function SupplierExpensesView({ organizationId }: SupplierExpensesViewProps) {
  const { data: expenses = [], isLoading, isError } = useSupplierExpenses(organizationId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Despesas de Fornecedores</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : isError ? (
          <div className="p-4 text-sm text-destructive">
            Erro ao carregar despesas. Tente novamente.
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            Nenhuma despesa de fornecedor encontrada.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => {
                const supplierName =
                  (e as { suppliers?: { name?: string | null } | null }).suppliers?.name ?? "-";
                const category =
                  (e as { suppliers?: { service_category?: string | null } | null }).suppliers
                    ?.service_category ?? "Outros";
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{supplierName}</TableCell>
                    <TableCell>{category}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell>
                      {e.due_date
                        ? format(parseISO(e.due_date), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell className="capitalize">{e.status}</TableCell>
                    <TableCell className="text-right font-semibold text-red-500">
                      {formatCurrency(Number(e.value ?? 0))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
