import { useMemo } from "react";
import { startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useSupplierExpenses } from "@/hooks/useFinancial";
import { Users, TrendingDown, Award, PieChart as PieChartIcon } from "lucide-react";

interface SuppliersDashboardTabProps {
  organizationId: string;
}

const COLORS = ["#6A2DBD", "#8B5CF6", "#A78BFA", "#C4B5FD", "#22c55e", "#f97316", "#ef4444"];

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SuppliersDashboardTab({ organizationId }: SuppliersDashboardTabProps) {
  const { data: suppliers = [], isLoading: loadingSuppliers } = useSuppliers(organizationId);
  const { data: expenses = [], isLoading: loadingExpenses } = useSupplierExpenses(organizationId);

  const now = new Date();
  const monthInterval = { start: startOfMonth(now), end: endOfMonth(now) };

  const currentMonthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        try {
          return isWithinInterval(parseISO(e.due_date), monthInterval);
        } catch {
          return false;
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses]
  );

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);

  const totalMonthExpenses = useMemo(
    () => currentMonthExpenses.reduce((sum, e) => sum + (e.value ?? 0), 0),
    [currentMonthExpenses]
  );

  const top5Suppliers = useMemo(() => {
    const bySupplier = new Map<string, { name: string; total: number }>();
    for (const e of currentMonthExpenses) {
      const name = e.suppliers?.name ?? e.supplier_id;
      const prev = bySupplier.get(e.supplier_id) ?? { name, total: 0 };
      bySupplier.set(e.supplier_id, { name: prev.name, total: prev.total + (e.value ?? 0) });
    }
    return Array.from(bySupplier.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [currentMonthExpenses]);

  const categoryDistribution = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const e of currentMonthExpenses) {
      const cat = e.suppliers?.service_category ?? "Sem categoria";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + (e.value ?? 0));
    }
    return Array.from(byCategory.entries()).map(([name, value]) => ({ name, value }));
  }, [currentMonthExpenses]);

  const isLoading = loadingSuppliers || loadingExpenses;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="h-24 flex items-center justify-center text-muted-foreground text-sm">
              Carregando...
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fornecedores Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeSuppliers.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas do Mês Atual
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBRL(totalMonthExpenses)}</p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas no Mês
            </CardTitle>
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{currentMonthExpenses.length}</p>
            <p className="text-xs text-muted-foreground">lançamentos</p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 and Category Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top 5 suppliers */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Top 5 Fornecedores (mês)</CardTitle>
          </CardHeader>
          <CardContent>
            {top5Suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa no mês atual.</p>
            ) : (
              <ol className="space-y-2">
                {top5Suppliers.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-sm truncate">{s.name}</span>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatBRL(s.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Category distribution pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa no mês atual.</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                    >
                      {categoryDistribution.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatBRL(value), "Total"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) =>
                        value.length > 20 ? value.slice(0, 18) + "…" : value
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
