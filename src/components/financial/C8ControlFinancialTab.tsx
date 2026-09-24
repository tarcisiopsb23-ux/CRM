import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCrmFinancial, type CrmFinancialClient } from "@/hooks/useCrmFinancial";
import type { SubscriptionStatus } from "@/lib/crmModules";

interface C8ControlFinancialTabProps {
  organizationId: string;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  inadimplente: "Inadimplente",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

const STATUS_BADGE_CLASS: Record<SubscriptionStatus, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  bloqueado: "bg-red-100 text-red-700",
  inadimplente: "bg-yellow-100 text-yellow-700",
  suspenso: "bg-yellow-100 text-yellow-600",
  cancelado: "bg-slate-100 text-slate-600",
};

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

export function C8ControlFinancialTab({ organizationId }: C8ControlFinancialTabProps) {
  const {
    clients,
    totalExpectedMonthly,
    totalReceivedMonth,
    overdueClients,
    isLoading,
    generateCharge,
    blockAccess,
    unblockAccess,
  } = useCrmFinancial(organizationId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando dados financeiros...
      </div>
    );
  }

  async function handleBlock(client: CrmFinancialClient) {
    try {
      await blockAccess.mutateAsync(client.client_id);
      toast.success(`Acesso de ${client.client_name} bloqueado.`);
    } catch {
      toast.error("Erro ao bloquear acesso.");
    }
  }

  async function handleUnblock(client: CrmFinancialClient) {
    try {
      await unblockAccess.mutateAsync(client.client_id);
      toast.success(`Acesso de ${client.client_name} liberado.`);
    } catch {
      toast.error("Erro ao liberar acesso.");
    }
  }

  async function handleGenerateCharge(client: CrmFinancialClient) {
    try {
      await generateCharge.mutateAsync(client.client_id);
      toast.success(`Cobrança gerada para ${client.client_name}.`);
    } catch {
      toast.error("Erro ao gerar cobrança.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Cards de totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita Mensal Esperada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {fmtCurrency(totalExpectedMonthly)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recebido no Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {fmtCurrency(totalReceivedMonth)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seção de inadimplentes */}
      {overdueClients.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Inadimplentes
              <Badge className="bg-red-100 text-red-700">{overdueClients.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Em Aberto</TableHead>
                  <TableHead>Próximo Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueClients.map((c) => (
                  <TableRow
                    key={c.client_id}
                    className="cursor-pointer hover:bg-red-50 transition-colors"
                    onClick={() => generateCharge.mutate(c.client_id)}
                    title="Clique para gerar cobrança"
                  >
                    <TableCell className="font-medium">{c.client_name}</TableCell>
                    <TableCell className="text-red-600 font-medium">
                      {fmtCurrency(c.pending_amount)}
                    </TableCell>
                    <TableCell>{formatDueDate(c.next_due_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabela principal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes com C8 Control Ativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              Nenhum cliente com C8 Control habilitado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor do Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próximo Vencimento</TableHead>
                  <TableHead>Em Aberto</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => {
                  const status = c.subscription_status as SubscriptionStatus;
                  const canBlock = status === "ativo" || status === "inadimplente";
                  const canUnblock = status === "bloqueado";

                  return (
                    <TableRow key={c.client_id}>
                      <TableCell className="font-medium">{c.client_name}</TableCell>
                      <TableCell>{fmtCurrency(c.plan_value)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE_CLASS[status] ?? "bg-muted text-muted-foreground"}>
                          {STATUS_LABEL[status] ?? status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDueDate(c.next_due_date)}</TableCell>
                      <TableCell className={c.pending_amount > 0 ? "text-red-600 font-medium" : ""}>
                        {fmtCurrency(c.pending_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canBlock && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={blockAccess.isPending}
                              onClick={() => handleBlock(c)}
                            >
                              {blockAccess.isPending && (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              )}
                              Bloquear
                            </Button>
                          )}
                          {canUnblock && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={unblockAccess.isPending}
                              onClick={() => handleUnblock(c)}
                            >
                              {unblockAccess.isPending && (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              )}
                              Liberar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={generateCharge.isPending}
                            onClick={() => handleGenerateCharge(c)}
                          >
                            {generateCharge.isPending && (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            )}
                            Gerar Cobrança
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
