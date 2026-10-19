import { useState, useMemo, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/contexts/AuthContext';
import { useCloserPerformance, type CloserMetrics } from '@/hooks/useCloserPerformance';
import { useProfiles } from '@/hooks/useProfiles';
import PeriodSelector, { DateRange, getDateRangeFromPreset } from '@/components/filters/PeriodSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertCircle, TrendingUp, Target, Users, DollarSign, Phone } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { SalesFunnel } from '@/components/ui/sales-funnel';

export function ClosersPerformancePage() {
  const organizationId = useOrganization();
  const { profile } = useAuth();
  const { data: profiles = [] } = useProfiles(organizationId);

  // ==================
  // PERÍODO & FILTROS
  // ==================
  const [selectedRange, setSelectedRange] = useState<DateRange>(() => 
    getDateRangeFromPreset('month')
  );
  const [selectedCloserId, setSelectedCloserId] = useState<string>('all');
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  
  // Se for closer comum, filtrar pelos seus próprios dados
  const filterCloserId = isAdmin ? (selectedCloserId === 'all' ? undefined : selectedCloserId) : profile?.id;

  // ==================
  // BUSCAR DADOS
  // ==================
  const { allMetrics, closerMetrics, totalMetrics, isLoading } = useCloserPerformance(
    organizationId,
    filterCloserId,
    selectedRange
  );

  // ==================
  // PREPARAR DADOS PARA GRÁFICOS
  // ==================
  const funnelData = useMemo(() => {
    const metrics = filterCloserId && closerMetrics ? closerMetrics : totalMetrics;
    return [
      { name: 'Leads Recebidos', value: metrics.leads_recebidos },
      { name: 'Qualificados', value: metrics.leads_qualificados },
      { name: 'Contatos Efetivos', value: metrics.contatos_efetivos },
      { name: 'Reuniões Agendadas', value: metrics.reunioes_agendadas },
      { name: 'Propostas', value: metrics.propostas_enviadas },
      { name: 'Clientes Fechados', value: metrics.clientes_fechados },
    ];
  }, [filterCloserId, closerMetrics, totalMetrics]);

  const conversionRatesData = useMemo(() => {
    const metrics = filterCloserId && closerMetrics ? closerMetrics : totalMetrics;
    return [
      { name: 'Contato', value: Math.round(metrics.taxa_contato * 10) / 10 },
      { name: 'Reunião', value: Math.round(metrics.taxa_reuniao * 10) / 10 },
      { name: 'Cliente', value: Math.round(metrics.taxa_cliente * 10) / 10 },
    ];
  }, [filterCloserId, closerMetrics, totalMetrics]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ==================
  // OBTER DADOS DO CLOSER SELECIONADO
  // ==================
  const displayMetrics = filterCloserId && closerMetrics ? closerMetrics : totalMetrics;
  const displayTitle = filterCloserId && closerMetrics 
    ? closerMetrics.closer_name 
    : `Visão Geral ${selectedRange.from.toLocaleDateString('pt-BR')} — ${selectedRange.to.toLocaleDateString('pt-BR')}`;

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance de Closers</h1>
        <p className="text-muted-foreground mt-2">
          Acompanhe métricas de vendas, taxas de conversão e receita por closer
        </p>
      </div>

      {/* FILTROS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="text-sm font-medium block mb-2">Período</label>
            <PeriodSelector
              initialPreset="mes_atual"
              onChange={(range) => setSelectedRange(range)}
              customLabel="Personalizado"
            />
          </div>

          {isAdmin && (
            <div className="flex-1 min-w-[250px]">
              <label className="text-sm font-medium block mb-2">Closer</label>
              <Select value={selectedCloserId} onValueChange={setSelectedCloserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Closers</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* INDICADORES PRINCIPAIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Leads Recebidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayMetrics.leads_recebidos}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {displayMetrics.leads_recebidos === 0 ? '—' : `${displayMetrics.contatos_efetivos} efetivos (${Math.round(displayMetrics.taxa_contato)}%)`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Clientes Fechados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{displayMetrics.clientes_fechados}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {displayMetrics.clientes_fechados === 0 ? '—' : `${Math.round(displayMetrics.taxa_cliente)}% de conversão`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Receita Gerada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {displayMetrics.receita_gerada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {displayMetrics.clientes_fechados === 0 ? '—' : `R$ ${(displayMetrics.receita_gerada / displayMetrics.clientes_fechados).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} por cliente`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Taxa Pós-Reunião
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(displayMetrics.taxa_pos_reuniao)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {displayMetrics.reunioes_agendadas === 0 ? 'Nenhuma reunião' : `${displayMetrics.clientes_fechados} de ${displayMetrics.reunioes_agendadas}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FUNIL */}
        <Card>
          <CardHeader>
            <CardTitle>Funil de Vendas</CardTitle>
            <CardDescription>{displayTitle}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <SalesFunnel
              steps={funnelData.map((item, idx) => ({
                label: item.name,
                value: item.value,
                rateLabel: idx < funnelData.length - 1
                  ? `${funnelData[idx + 1].value > 0 && item.value > 0 ? Math.round((funnelData[idx + 1].value / item.value) * 100) : 0}%`
                  : undefined,
              }))}
              emptyMessage="Nenhum dado de funil para o período selecionado."
            />
          </CardContent>
        </Card>

        {/* TAXAS DE CONVERSÃO */}
        <Card>
          <CardHeader>
            <CardTitle>Taxas de Conversão (%)</CardTitle>
            <CardDescription>Desempenho em cada etapa</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionRatesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* COMPARATIVO DE CLOSERS (apenas admin) */}
      {isAdmin && selectedCloserId === 'all' && (
        <Card>
          <CardHeader>
            <CardTitle>Ranking de Closers</CardTitle>
            <CardDescription>Comparativo de performance de todos os closers</CardDescription>
          </CardHeader>
          <CardContent>
            {allMetrics.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Nenhum closer com atividade no período</AlertDescription>
              </Alert>
            ) : (
              <div className="table-scroll-container">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Closer</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Contatos</TableHead>
                      <TableHead className="text-right">Taxa Contato</TableHead>
                      <TableHead className="text-right">Qualificados</TableHead>
                      <TableHead className="text-right">Reuniões</TableHead>
                      <TableHead className="text-right">Taxa Reunião</TableHead>
                      <TableHead className="text-right">Fechados</TableHead>
                      <TableHead className="text-right">Taxa Cliente</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allMetrics.map((metrics, idx) => (
                      <TableRow key={metrics.closer_id || idx} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{metrics.closer_name}</TableCell>
                        <TableCell className="text-right">{metrics.leads_recebidos}</TableCell>
                        <TableCell className="text-right">{metrics.contatos_efetivos}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {Math.round(metrics.taxa_contato)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{metrics.leads_qualificados}</TableCell>
                        <TableCell className="text-right">{metrics.reunioes_agendadas}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={metrics.taxa_reuniao > 30 ? 'default' : 'secondary'}>
                            {Math.round(metrics.taxa_reuniao)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{metrics.clientes_fechados}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={metrics.taxa_cliente > 15 ? 'default' : metrics.taxa_cliente > 10 ? 'secondary' : 'outline'}
                          >
                            {Math.round(metrics.taxa_cliente)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          R$ {metrics.receita_gerada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{totalMetrics.leads_recebidos}</TableCell>
                      <TableCell className="text-right">{totalMetrics.contatos_efetivos}</TableCell>
                      <TableCell className="text-right">{Math.round(totalMetrics.taxa_contato)}%</TableCell>
                      <TableCell className="text-right">{totalMetrics.leads_qualificados}</TableCell>
                      <TableCell className="text-right">{totalMetrics.reunioes_agendadas}</TableCell>
                      <TableCell className="text-right">{Math.round(totalMetrics.taxa_reuniao)}%</TableCell>
                      <TableCell className="text-right">{totalMetrics.clientes_fechados}</TableCell>
                      <TableCell className="text-right">{Math.round(totalMetrics.taxa_cliente)}%</TableCell>
                      <TableCell className="text-right">
                        R$ {totalMetrics.receita_gerada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DETALHES */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes de Métricas</CardTitle>
          <CardDescription>Breakdown completo do desempenho</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Contatos Efetivos</p>
              <p className="text-lg font-semibold">{displayMetrics.contatos_efetivos}</p>
              <p className="text-xs text-muted-foreground">
                {displayMetrics.leads_recebidos === 0 ? '—' : `${Math.round((displayMetrics.contatos_efetivos / displayMetrics.leads_recebidos) * 100)}% dos leads`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Leads Qualificados</p>
              <p className="text-lg font-semibold">{displayMetrics.leads_qualificados}</p>
              <p className="text-xs text-muted-foreground">
                {displayMetrics.leads_recebidos === 0 ? '—' : `${Math.round((displayMetrics.leads_qualificados / displayMetrics.leads_recebidos) * 100)}% dos leads`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Reuniões Agendadas</p>
              <p className="text-lg font-semibold">{displayMetrics.reunioes_agendadas}</p>
              <p className="text-xs text-muted-foreground">
                {displayMetrics.leads_qualificados === 0 ? '—' : `${Math.round((displayMetrics.reunioes_agendadas / displayMetrics.leads_qualificados) * 100)}% dos qualificados`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Reuniões Realizadas</p>
              <p className="text-lg font-semibold">{displayMetrics.reunioes_realizadas}</p>
              <p className="text-xs text-muted-foreground">
                {displayMetrics.reunioes_agendadas === 0 ? '—' : `${Math.round((displayMetrics.reunioes_realizadas / displayMetrics.reunioes_agendadas) * 100)}% confirmadas`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Propostas Enviadas</p>
              <p className="text-lg font-semibold">{displayMetrics.propostas_enviadas}</p>
              <p className="text-xs text-muted-foreground">
                {displayMetrics.propostas_enviadas === 0 ? '—' : `${Math.round((displayMetrics.clientes_fechados / displayMetrics.propostas_enviadas) * 100)}% fechadas`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Ticket Médio</p>
              <p className="text-lg font-semibold">
                R$ {displayMetrics.clientes_fechados === 0 ? '0' : (displayMetrics.receita_gerada / displayMetrics.clientes_fechados).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">receita por cliente</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
