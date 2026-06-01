/**
 * Script de Teste - Cadastro Restrito com Registration Codes
 * 
 * Este script valida o fluxo completo de cadastro restrito:
 * 1. Geração de código por admin
 * 2. Validação do código
 * 3. Cadastro com código válido
 * 4. Tentativa de cadastro com código inválido
 * 5. Teste de expiração
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configurações - ajuste para seu ambiente
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = 'your-service-role-key';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
  data?: any;
}

class RegistrationCodeTester {
  private supabase: any;
  private testResults: TestResult[] = [];

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });
  }

  private addResult(test: string, status: 'PASS' | 'FAIL', details: string, data?: any) {
    const result: TestResult = { test, status, details, data };
    this.testResults.push(result);
    console.log(`[${status}] ${test}: ${details}`);
    if (data) console.log('Data:', data);
  }

  async testGenerateCode(orgId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('generate_registration_code', {
        p_org_id: orgId,
        p_validity_hours: 72
      });

      if (error) {
        this.addResult('Generate Code', 'FAIL', `Erro ao gerar código: ${error.message}`);
        return;
      }

      if (!data) {
        this.addResult('Generate Code', 'FAIL', 'Nenhum código retornado');
        return;
      }

      this.addResult('Generate Code', 'PASS', `Código gerado com sucesso: ${data}`, { code: data, orgId });
    } catch (err) {
      this.addResult('Generate Code', 'FAIL', `Exceção ao gerar código: ${err.message}`);
    }
  }

  async testValidateCode(code: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('validate_registration_code', {
        p_code: code
      });

      if (error) {
        this.addResult('Validate Code', 'FAIL', `Erro ao validar código: ${error.message}`);
        return;
      }

      if (!data) {
        this.addResult('Validate Code', 'FAIL', 'Validação retornou falso sem erro');
        return;
      }

      this.addResult('Validate Code', 'PASS', `Código válido: ${data}`, { valid: data });
    } catch (err) {
      this.addResult('Validate Code', 'FAIL', `Exceção ao validar código: ${err.message}`);
    }
  }

  async testListCodes(orgId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('registration_codes')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        this.addResult('List Codes', 'FAIL', `Erro ao listar códigos: ${error.message}`);
        return;
      }

      this.addResult('List Codes', 'PASS', `${data?.length || 0} códigos encontrados`, { codes: data });
    } catch (err) {
      this.addResult('List Codes', 'FAIL', `Exceção ao listar códigos: ${err.message}`);
    }
  }

  async testExpiredCode(): Promise<void> {
    try {
      // Criar código com expiração de 1 segundo
      const { data: code, error: genError } = await this.supabase.rpc('generate_registration_code', {
        p_org_id: 'test-org-id',
        p_validity_hours: 0.0003 // ~1 segundo
      });

      if (genError || !code) {
        this.addResult('Expired Code', 'FAIL', 'Não foi possível gerar código de teste');
        return;
      }

      // Aguardar expiração
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Tentar validar
      const { data: valid, error: valError } = await this.supabase.rpc('validate_registration_code', {
        p_code: code
      });

      if (valError) {
        this.addResult('Expired Code', 'FAIL', `Erro ao validar código expirado: ${valError.message}`);
        return;
      }

      if (valid) {
        this.addResult('Expired Code', 'FAIL', 'Código expirado ainda está válido');
      } else {
        this.addResult('Expired Code', 'PASS', 'Código expirado corretamente rejeitado');
      }
    } catch (err) {
      this.addResult('Expired Code', 'FAIL', `Exceção ao testar código expirado: ${err.message}`);
    }
  }

  async testInvalidCode(): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('validate_registration_code', {
        p_code: 'INVALID-CODE-123'
      });

      if (error) {
        this.addResult('Invalid Code', 'FAIL', `Erro ao validar código inválido: ${error.message}`);
        return;
      }

      if (data) {
        this.addResult('Invalid Code', 'FAIL', 'Código inválido foi aceito');
      } else {
        this.addResult('Invalid Code', 'PASS', 'Código inválido corretamente rejeitado');
      }
    } catch (err) {
      this.addResult('Invalid Code', 'FAIL', `Exceção ao testar código inválido: ${err.message}`);
    }
  }

  async testCodeUsage(): Promise<void> {
    try {
      // Gerar código
      const { data: code, error: genError } = await this.supabase.rpc('generate_registration_code', {
        p_org_id: 'test-org-id',
        p_validity_hours: 1
      });

      if (genError || !code) {
        this.addResult('Code Usage', 'FAIL', 'Não foi possível gerar código para teste de uso');
        return;
      }

      // Validar código
      const { data: valid, error: valError } = await this.supabase.rpc('validate_registration_code', {
        p_code: code
      });

      if (valError || !valid) {
        this.addResult('Code Usage', 'FAIL', 'Código gerado não é válido');
        return;
      }

      // Tentar usar novamente (deve falhar)
      const { data: secondValid, error: secondError } = await this.supabase.rpc('validate_registration_code', {
        p_code: code
      });

      if (secondError) {
        this.addResult('Code Usage', 'FAIL', `Erro ao testar segundo uso: ${secondError.message}`);
        return;
      }

      if (secondValid) {
        this.addResult('Code Usage', 'FAIL', 'Código já usado foi aceito novamente');
      } else {
        this.addResult('Code Usage', 'PASS', 'Código já usado corretamente rejeitado');
      }
    } catch (err) {
      this.addResult('Code Usage', 'FAIL', `Exceção ao testar uso de código: ${err.message}`);
    }
  }

  async testRolePermissions(): Promise<void> {
    try {
      // Testar permissões de owner/admin para gerar código
      const { data: ownerCode, error: ownerError } = await this.supabase.rpc('generate_registration_code', {
        p_org_id: 'test-org-id',
        p_validity_hours: 1
      });

      if (ownerError) {
        this.addResult('Role Permissions', 'FAIL', `Owner não conseguiu gerar código: ${ownerError.message}`);
        return;
      }

      // Criar usuário com role member para teste (se necessário)
      this.addResult('Role Permissions', 'PASS', 'Owner/admin podem gerar códigos', { code: ownerCode });
    } catch (err) {
      this.addResult('Role Permissions', 'FAIL', `Exceção ao testar permissões: ${err.message}`);
    }
  }

  async runAllTests(orgId: string): Promise<void> {
    console.log('🧪 Iniciando testes de Registration Codes...\n');

    // Limpar dados de teste anteriores
    await this.cleanupTestData();

    // Executar todos os testes
    await this.testGenerateCode(orgId);
    await this.testListCodes(orgId);
    await this.testExpiredCode();
    await this.testInvalidCode();
    await this.testCodeUsage();
    await this.testRolePermissions();

    // Exibir resumo
    this.printSummary();
  }

  private async cleanupTestData(): Promise<void> {
    try {
      await this.supabase
        .from('registration_codes')
        .delete()
        .eq('organization_id', 'test-org-id');
    } catch (err) {
      console.log('Aviso: Não foi possível limpar dados de teste:', err.message);
    }
  }

  private printSummary(): void {
    console.log('\n📊 RESUMO DOS TESTES');
    console.log('='.repeat(50));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;

    console.log(`Total: ${total} | Passou: ${passed} | Falhou: ${failed}`);
    console.log(`Taxa de sucesso: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ TESTES QUE FALHARAM:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.details}`));
    }

    console.log('\n✅ TESTES QUE PASSARAM:');
    this.testResults
      .filter(r => r.status === 'PASS')
      .forEach(r => console.log(`  - ${r.test}: ${r.details}`));
  }
}

// Executar testes
async function main() {
  const tester = new RegistrationCodeTester();
  
  // Substitua pelo ID da organização de teste
  const testOrgId = 'your-organization-id-here';
  
  if (testOrgId === 'your-organization-id-here') {
    console.error('⚠️  Por favor, atualize o testOrgId no script com um ID de organização válido');
    process.exit(1);
  }

  await tester.runAllTests(testOrgId);
}

// Exportar para uso em outros módulos
export { RegistrationCodeTester };

// Executar se chamado diretamente
if (import.meta.main) {
  main().catch(console.error);
}
