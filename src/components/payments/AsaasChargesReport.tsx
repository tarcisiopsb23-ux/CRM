import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  QrCode, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react";
import { useAsaasChargeStats, type AsaasChargeStats } from "@/hooks/useAsaasCharges";
import { formatBRL } from "@/lib/formatters";

interface AsaasChargesReportProps {
  organizationId: string;
  dateStart?: string;
  dateEnd?: string;
}

export function AsaasChargesReport({ organizationId, dateStart, dateEnd }: AsaasChargesReportProps) {
  const { stats, isLoading } = useAsaasChargeStats(organizationId, { dateStart, dateEnd });

  const chartData = useMemo(() => {
    if (!stats) return [];
    
    return [
      {
        name: "PIX",
        count: stats.by_billing_type.pix.count,
        value: stats.by_billing_type.pix.value,
        color: "#8b5cf6"
      },
      {
        name: "Boleto",
        count: stats.by_billing_type.boleto.count,
        value: stats.by_billing_type.boleto.value,
        color: "#3b82f6"
      },
      {
        name: "Cartão",
        count: stats.by_billing_type.credit_card.count,
        value: stats.by_billing_type.credit_card.value,
        color: "#10b981"
      }
    ];
  }, [stats]);

  const statusData = useMemo(() => {
    if (!stats) return [];
    
    return [
      {
        name: "Pagas",
        value: stats.paid_charges,
        color: "#10b981"
      },
      {
        name: "Pendentes",
        value: stats.pending_charges,
        color: "#f59e0b"
      },
      {
        name: "Vencidas",
        value: stats.overdue_charges,
        color: "#ef4444"
      },
      {
        name: "Canceladas",
        value: stats.canceled_charges,
        color: "#6b7280"
      }
    ];
  }, [stats]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">Nenhuma cobrança encontrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Cobranças</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_charges}</div>
            <p className="text-xs text-muted-foreground">
              {formatBRL(stats.total_value)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cobranças Pagas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.paid_charges}</div>
            <p className="text-xs text-muted-foreground">
              {formatBRL(stats.paid_value)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cobranças Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending_charges}</div>
            <p className="text-xs text-muted-foreground">
              {formatBRL(stats.pending_value)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversion_rate}%</div>
            <Progress value={stats.conversion_rate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      {(stats.overdue_charges > 0 || stats.canceled_charges > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.overdue_charges > 0 && (
            <Card className="border-red-200">
              <CardContent className="flex items-center gap-4 p-6">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <h3 className="font-semibold text-red-600">Cobranças Vencidas</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats.overdue_charges} cobranças ({formatBRL(stats.overdue_value)})
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.canceled_charges > 0 && (
            <Card className="border-gray-200">
              <CardContent className="flex items-center gap-4 p-6">
                <AlertTriangle className="h-8 w-8 text-gray-600" />
                <div>
                  <h3 className="font-semibold text-gray-600">Cobranças Canceladas</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats.canceled_charges} cobranças
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico por Tipo de Cobrança */}
        <Card>
          <CardHeader>
            <CardTitle>Cobranças por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    name === "count" ? value : formatBRL(value),
                    name === "count" ? "Quantidade" : "Valor"
                  ]}
                />
                <Legend />
                <Bar dataKey="count" fill="#8b5cf6" name="Quantidade" />
                <Bar dataKey="value" fill="#3b82f6" name="Valor" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico de Status */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detalhes por Tipo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              PIX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Quantidade:</span>
              <span className="font-semibold">{stats.by_billing_type.pix.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Valor Total:</span>
              <span className="font-semibold">{formatBRL(stats.by_billing_type.pix.value)}</span>
            </div>
            <Badge variant="secondary" className="w-full justify-center">
              {stats.total_charges > 0 
                ? Math.round((stats.by_billing_type.pix.count / stats.total_charges) * 100)
                : 0}% do total
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Boleto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Quantidade:</span>
              <span className="font-semibold">{stats.by_billing_type.boleto.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Valor Total:</span>
              <span className="font-semibold">{formatBRL(stats.by_billing_type.boleto.value)}</span>
            </div>
            <Badge variant="secondary" className="w-full justify-center">
              {stats.total_charges > 0 
                ? Math.round((stats.by_billing_type.boleto.count / stats.total_charges) * 100)
                : 0}% do total
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Cartão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Quantidade:</span>
              <span className="font-semibold">{stats.by_billing_type.credit_card.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Valor Total:</span>
              <span className="font-semibold">{formatBRL(stats.by_billing_type.credit_card.value)}</span>
            </div>
            <Badge variant="secondary" className="w-full justify-center">
              {stats.total_charges > 0 
                ? Math.round((stats.by_billing_type.credit_card.count / stats.total_charges) * 100)
                : 0}% do total
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Período */}
      {(dateStart || dateEnd) && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Período: {dateStart ? new Date(dateStart).toLocaleDateString('pt-BR') : 'Início'} até {' '}
              {dateEnd ? new Date(dateEnd).toLocaleDateString('pt-BR') : 'Hoje'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
