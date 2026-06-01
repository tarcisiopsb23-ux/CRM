/**
 * Script de Teste - Integração Asaas via N8N
 * 
 * Este script valida todo o fluxo de integração com Asaas:
 * 1. Criação de cobranças (PIX, Boleto, Cartão)
 * 2. Processamento via N8N
 * 3. Webhook de atualização
 * 4. Relatórios e estatísticas
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configurações - ajuste para seu ambiente
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = 'your-service-role-key';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
  data?: any;
}

class AsaasIntegrationTester {
  private supabase: any;
  private testResults: TestResult[] = [];
  private testPaymentId: string | null = null;
  private testClientId: string | null = null;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });
  }

  private addResult(test: string, status: 'PASS' | 'FAIL' | 'SKIP', details: string, data?: any) {
    const result: TestResult = { test, status, details, data };
    this.testResults.push(result);
    console.log(`[${status}] ${test}: ${details}`);
    if (data) console.log('Data:', data);
  }

  async setupTestData(): Promise<void> {
    try {
      // Criar cliente de teste
      const { data: client, error: clientError } = await this.supabase
        .from('clients')
        .insert({
          name: 'Cliente Teste Asaas',
          company: 'Empresa Teste',
          email: 'teste@asaas.com',
          document: '12345678901',
          phone: '11999999999',
          organization_id: 'test-org-id'
        })
        .select()
        .single();

      if (clientError) {
        this.addResult('Setup Test Data', 'FAIL', `Erro ao criar cliente: ${clientError.message}`);
        return;
      }

      this.testClientId = client.id;

      // Criar pagamento de teste
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          client_id: client.id,
          description: 'Pagamento Teste Asaas',
          value: 100.00,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pendente',
          organization_id: 'test-org-id'
        })
        .select()
        .single();

      if (paymentError) {
        this.addResult('Setup Test Data', 'FAIL', `Erro ao criar pagamento: ${paymentError.message}`);
        return;
      }

      this.testPaymentId = payment.id;
      this.addResult('Setup Test Data', 'PASS', 'Dados de teste criados', { client, payment });

    } catch (err) {
      this.addResult('Setup Test Data', 'FAIL', `Exceção no setup: ${err.message}`);
    }
  }

  async testGeneratePixCharge(): Promise<void> {
    if (!this.testPaymentId) {
      this.addResult('Generate PIX Charge', 'SKIP', 'Sem payment_id para teste');
      return;
    }

    try {
      const { data, error } = await this.supabase.rpc('generate_asaas_charge', {
        p_payment_id: this.testPaymentId,
        p_billing_type: 'pix',
        p_custom_expiration_days: 3
      });

      if (error) {
        this.addResult('Generate PIX Charge', 'FAIL', `Erro RPC: ${error.message}`);
        return;
      }

      if (!data?.success) {
        this.addResult('Generate PIX Charge', 'FAIL', `Falha na geração: ${data?.error}`);
        return;
      }

      this.addResult('Generate PIX Charge', 'PASS', 'Cobrança PIX gerada', data);

      // Aguardar processamento (simulação)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verificar se cobrança foi criada
      const { data: charge, error: fetchError } = await this.supabase
        .from('asaas_charges')
        .select('*')
        .eq('payment_id', this.testPaymentId)
        .single();

      if (fetchError || !charge) {
        this.addResult('Generate PIX Charge', 'FAIL', 'Cobrança não encontrada no banco');
        return;
      }

      this.addResult('Generate PIX Charge', 'PASS', 'Cobrança PIX persistida', charge);

    } catch (err) {
      this.addResult('Generate PIX Charge', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testGenerateBoletoCharge(): Promise<void> {
    if (!this.testPaymentId) {
      this.addResult('Generate Boleto Charge', 'SKIP', 'Sem payment_id para teste');
      return;
    }

    try {
      // Criar novo pagamento para boleto
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          client_id: this.testClientId,
          description: 'Pagamento Teste Boleto',
          value: 150.00,
          due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pendente',
          organization_id: 'test-org-id'
        })
        .select()
        .single();

      if (paymentError || !payment) {
        this.addResult('Generate Boleto Charge', 'SKIP', 'Não foi possível criar pagamento para boleto');
        return;
      }

      const { data, error } = await this.supabase.rpc('generate_asaas_charge', {
        p_payment_id: payment.id,
        p_billing_type: 'boleto',
        p_custom_expiration_days: 5
      });

      if (error) {
        this.addResult('Generate Boleto Charge', 'FAIL', `Erro RPC: ${error.message}`);
        return;
      }

      if (!data?.success) {
        this.addResult('Generate Boleto Charge', 'FAIL', `Falha na geração: ${data?.error}`);
        return;
      }

      this.addResult('Generate Boleto Charge', 'PASS', 'Cobrança Boleto gerada', data);

    } catch (err) {
      this.addResult('Generate Boleto Charge', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testGenerateCreditCardCharge(): Promise<void> {
    if (!this.testPaymentId) {
      this.addResult('Generate Credit Card Charge', 'SKIP', 'Sem payment_id para teste');
      return;
    }

    try {
      // Criar novo pagamento para cartão
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          client_id: this.testClientId,
          description: 'Pagamento Teste Cartão',
          value: 200.00,
          due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pendente',
          organization_id: 'test-org-id'
        })
        .select()
        .single();

      if (paymentError || !payment) {
        this.addResult('Generate Credit Card Charge', 'SKIP', 'Não foi possível criar pagamento para cartão');
        return;
      }

      const cardData = {
        holderName: 'Teste Cartão',
        number: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2025',
        cvv: '123',
        brand: 'visa',
        lastDigits: '1111'
      };

      const { data, error } = await this.supabase.rpc('generate_asaas_charge', {
        p_payment_id: payment.id,
        p_billing_type: 'credit_card',
        p_card_data: cardData,
        p_custom_expiration_days: 1
      });

      if (error) {
        this.addResult('Generate Credit Card Charge', 'FAIL', `Erro RPC: ${error.message}`);
        return;
      }

      if (!data?.success) {
        this.addResult('Generate Credit Card Charge', 'FAIL', `Falha na geração: ${data?.error}`);
        return;
      }

      this.addResult('Generate Credit Card Charge', 'PASS', 'Cobrança Cartão gerada', data);

    } catch (err) {
      this.addResult('Generate Credit Card Charge', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testWebhookProcessing(): Promise<void> {
    try {
      // Simular webhook do Asaas
      const webhookData = {
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: 'asaas_test_' + Date.now(),
          dateCreated: new Date().toISOString(),
          customer: 'teste@asaas.com',
          value: 100.00,
          billingType: 'pix',
          status: 'RECEIVED',
          dueDate: new Date().toISOString(),
          paymentDate: new Date().toISOString(),
          confirmedDate: new Date().toISOString(),
          description: 'Pagamento Teste'
        }
      };

      // Buscar uma cobrança existente para teste
      const { data: charge, error: fetchError } = await this.supabase
        .from('asaas_charges')
        .select('*')
        .limit(1)
        .single();

      if (fetchError || !charge) {
        this.addResult('Webhook Processing', 'SKIP', 'Nenhuma cobrança encontrada para teste de webhook');
        return;
      }

      // Atualizar status via RPC
      const { data, error } = await this.supabase.rpc('handle_asaas_webhook', {
        p_asaas_id: charge.asaas_id,
        p_status: 'received',
        p_payment_date: new Date().toISOString(),
        p_confirmation_date: new Date().toISOString(),
        p_asaas_response: webhookData
      });

      if (error) {
        this.addResult('Webhook Processing', 'FAIL', `Erro ao processar webhook: ${error.message}`);
        return;
      }

      if (!data?.success) {
        this.addResult('Webhook Processing', 'FAIL', `Falha no processamento: ${data?.error}`);
        return;
      }

      this.addResult('Webhook Processing', 'PASS', 'Webhook processado com sucesso', data);

      // Verificar se pagamento foi atualizado
      const { data: updatedPayment, error: paymentError } = await this.supabase
        .from('payments')
        .select('status, paid_at')
        .eq('id', charge.payment_id)
        .single();

      if (paymentError) {
        this.addResult('Webhook Processing', 'FAIL', 'Erro ao verificar pagamento atualizado');
        return;
      }

      if (updatedPayment?.status === 'pago') {
        this.addResult('Webhook Processing', 'PASS', 'Pagamento atualizado para pago', updatedPayment);
      } else {
        this.addResult('Webhook Processing', 'FAIL', 'Pagamento não foi atualizado');
      }

    } catch (err) {
      this.addResult('Webhook Processing', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testChargeCancellation(): Promise<void> {
    try {
      // Buscar uma cobrança pendente
      const { data: charge, error: fetchError } = await this.supabase
        .from('asaas_charges')
        .select('*')
        .eq('status', 'pending')
        .limit(1)
        .single();

      if (fetchError || !charge) {
        this.addResult('Charge Cancellation', 'SKIP', 'Nenhuma cobrança pendente encontrada');
        return;
      }

      const { data, error } = await this.supabase.rpc('cancel_asaas_charge', {
        p_asaas_id: charge.asaas_id,
        p_reason: 'Teste de cancelamento'
      });

      if (error) {
        this.addResult('Charge Cancellation', 'FAIL', `Erro ao cancelar: ${error.message}`);
        return;
      }

      if (!data?.success) {
        this.addResult('Charge Cancellation', 'FAIL', `Falha no cancelamento: ${data?.error}`);
        return;
      }

      this.addResult('Charge Cancellation', 'PASS', 'Cobrança cancelada com sucesso', data);

    } catch (err) {
      this.addResult('Charge Cancellation', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testChargeStatistics(): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('get_asaas_charges_stats', {
        p_organization_id: 'test-org-id'
      });

      if (error) {
        this.addResult('Charge Statistics', 'FAIL', `Erro ao buscar estatísticas: ${error.message}`);
        return;
      }

      if (!data) {
        this.addResult('Charge Statistics', 'FAIL', 'Estatísticas não retornaram dados');
        return;
      }

      this.addResult('Charge Statistics', 'PASS', 'Estatísticas obtidas com sucesso', {
        total_charges: data.total_charges,
        total_value: data.total_value,
        conversion_rate: data.conversion_rate
      });

    } catch (err) {
      this.addResult('Charge Statistics', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async testChargeListing(): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('get_asaas_charges', {
        p_organization_id: 'test-org-id',
        p_limit: 10,
        p_offset: 0
      });

      if (error) {
        this.addResult('Charge Listing', 'FAIL', `Erro ao listar cobranças: ${error.message}`);
        return;
      }

      if (!Array.isArray(data)) {
        this.addResult('Charge Listing', 'FAIL', 'Lista não é um array');
        return;
      }

      this.addResult('Charge Listing', 'PASS', `${data.length} cobranças listadas`, {
        count: data.length,
        first_charge: data[0] ? data[0].asaas_id : null
      });

    } catch (err) {
      this.addResult('Charge Listing', 'FAIL', `Exceção: ${err.message}`);
    }
  }

  async cleanupTestData(): Promise<void> {
    try {
      // Limpar cobranças
      if (this.testPaymentId) {
        await this.supabase
          .from('asaas_charges')
          .delete()
          .eq('payment_id', this.testPaymentId);
      }

      // Limpar pagamentos
      if (this.testClientId) {
        await this.supabase
          .from('payments')
          .delete()
          .eq('client_id', this.testClientId);
      }

      // Limpar cliente
      if (this.testClientId) {
        await this.supabase
          .from('clients')
          .delete()
          .eq('id', this.testClientId);
      }

      this.addResult('Cleanup Test Data', 'PASS', 'Dados de teste limpos');

    } catch (err) {
      this.addResult('Cleanup Test Data', 'FAIL', `Exceção na limpeza: ${err.message}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Iniciando testes de integração Asaas...\n');

    try {
      // Setup
      await this.setupTestData();

      // Testes de geração
      await this.testGeneratePixCharge();
      await this.testGenerateBoletoCharge();
      await this.testGenerateCreditCardCharge();

      // Testes de processamento
      await this.testWebhookProcessing();
      await this.testChargeCancellation();

      // Testes de consulta
      await this.testChargeStatistics();
      await this.testChargeListing();

      // Cleanup
      await this.cleanupTestData();

    } catch (err) {
      this.addResult('Test Suite', 'FAIL', `Erro geral: ${err.message}`);
    } finally {
      // Exibir resumo
      this.printSummary();
    }
  }

  private printSummary(): void {
    console.log('\n📊 RESUMO DOS TESTES ASAAS');
    console.log('='.repeat(50));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
    const total = this.testResults.length;

    console.log(`Total: ${total} | Passou: ${passed} | Falhou: ${failed} | Pulou: ${skipped}`);
    console.log(`Taxa de sucesso: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ TESTES QUE FALHARAM:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.details}`));
    }

    if (skipped > 0) {
      console.log('\n⚠️ TESTES PULADOS:');
      this.testResults
        .filter(r => r.status === 'SKIP')
        .forEach(r => console.log(`  - ${r.test}: ${r.details}`));
    }

    console.log('\n✅ TESTES QUE PASSARAM:');
    this.testResults
      .filter(r => r.status === 'PASS')
      .forEach(r => console.log(`  - ${r.test}: ${r.details}`));

    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('1. Configurar variáveis de ambiente N8N e Asaas');
    console.log('2. Criar workflow no N8N para processamento de cobranças');
    console.log('3. Configurar webhook URL no painel Asaas');
    console.log('4. Testar com dados reais em ambiente de homologação');
  }
}

// Executar testes
async function main() {
  const tester = new AsaasIntegrationTester();
  await tester.runAllTests();
}

// Exportar para uso em outros módulos
export { AsaasIntegrationTester };

// Executar se chamado diretamente
if (import.meta.main) {
  main().catch(console.error);
}
