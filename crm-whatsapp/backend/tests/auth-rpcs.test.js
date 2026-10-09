'use strict'

/**
 * Testes de propriedade para as RPCs de autenticação do Dashboard.
 *
 * Validates: Requirements 2.3, 3.5
 *
 * Como as RPCs são funções SQL no Supabase, os testes simulam o comportamento
 * das funções em JavaScript puro, espelhando a lógica SQL exata das migrações:
 *   - supabase/migrations/20260325000000_auth_rpcs.sql
 *
 * fast-check é usado para gerar entradas arbitrárias e verificar as propriedades.
 */

import { describe, test } from 'vitest'
import { expect } from 'vitest'
import * as fc from 'fast-check'

// ─── Implementações JS espelhando a lógica SQL das RPCs ──────────────────────

/**
 * Espelha validate_client_dashboard_password (SQL).
 *
 * Lógica:
 *   1. Busca o registro pelo slug.
 *   2. Se não encontrar (stored_password IS NULL) → retorna FALSE.
 *   3. Valida e-mail (case-insensitive, trim) E senha (case-sensitive) juntos.
 *   4. Nunca revela qual campo está errado (req 2.3).
 *
 * @param {object|null} clientRecord  - Registro do parceiro { email, password } ou null
 * @param {string} pSlug              - Slug informado (não usado aqui, já filtrado)
 * @param {string} pEmail             - E-mail informado
 * @param {string} pPassword          - Senha informada
 * @returns {boolean}
 */
function validateClientDashboardPassword(clientRecord, pEmail, pPassword) {
  if (!clientRecord || clientRecord.password == null) {
    return false
  }
  const storedEmail = clientRecord.email ?? ''
  const storedPassword = clientRecord.password

  return (
    storedEmail.toLowerCase().trim() === pEmail.toLowerCase().trim() &&
    storedPassword === pPassword
  )
}

/**
 * Espelha recover_client_password (SQL).
 *
 * Lógica:
 *   1. Busca o registro pelo slug + e-mail (case-insensitive, trim).
 *   2. Se não encontrar → retorna sem fazer nada (VOID / undefined).
 *   3. Se encontrar → atualiza a senha e define has_temp_password = true.
 *
 * @param {object|null} clientRecord  - Registro do parceiro { email, password } ou null
 * @param {string} pEmail             - E-mail informado
 * @param {string} pNewTempPassword   - Nova senha temporária
 * @returns {{ updated: boolean, record: object|null }}
 */
function recoverClientPassword(clientRecord, pEmail, pNewTempPassword) {
  if (!clientRecord) {
    // Slug inválido: retorna vazio sem revelar existência (req 3.5)
    return { updated: false, record: null }
  }

  const storedEmail = clientRecord.email ?? ''
  const emailMatches =
    storedEmail.toLowerCase().trim() === pEmail.toLowerCase().trim()

  if (!emailMatches) {
    // E-mail inválido: retorna vazio sem revelar existência (req 3.5)
    return { updated: false, record: null }
  }

  // Slug + e-mail válidos: atualiza senha e marca como temporária (req 3.2)
  const updated = {
    ...clientRecord,
    password: pNewTempPassword,
    has_temp_password: true,
  }
  return { updated: true, record: updated }
}

// ─── Geradores fast-check ────────────────────────────────────────────────────

/** Gera strings arbitrárias não-nulas (incluindo vazias) */
const arbString = fc.string()

/** Gera e-mail arbitrário (formato simples) */
const arbEmail = fc.emailAddress()

/** Gera slug arbitrário (letras, números, hífens) */
const arbSlug = fc.stringMatching(/^[a-z0-9-]{1,30}$/)

/** Gera senha arbitrária (string não-vazia) */
const arbPassword = fc.string({ minLength: 1, maxLength: 64 })

/** Gera um registro de parceiro válido */
const arbClientRecord = fc.record({
  email: arbEmail,
  password: arbPassword,
})

// ─── Propriedade 1: validate_client_dashboard_password ───────────────────────
// **Validates: Requirement 2.3**
//
// Para qualquer slug/e-mail/senha inválidos, a função retorna FALSE.
// "Inválido" significa: slug não existe OU e-mail não bate OU senha não bate.
// A função nunca revela qual campo está errado.

describe('Property: validate_client_dashboard_password retorna false para entradas inválidas', () => {

  test('retorna false quando o slug não existe (clientRecord = null)', () => {
    /**
     * **Validates: Requirements 2.3**
     * Para qualquer combinação de e-mail e senha, se o slug não corresponde
     * a nenhum parceiro, a função retorna FALSE.
     */
    fc.assert(
      fc.property(arbEmail, arbPassword, (email, password) => {
        const result = validateClientDashboardPassword(null, email, password)
        expect(result).toBe(false)
      }),
      { numRuns: 200 }
    )
  })

  test('retorna false quando o e-mail não corresponde ao registrado', () => {
    /**
     * **Validates: Requirements 2.3**
     * Para qualquer parceiro existente, se o e-mail informado for diferente
     * do e-mail armazenado, a função retorna FALSE — sem revelar que a senha
     * poderia estar correta.
     */
    fc.assert(
      fc.property(arbClientRecord, arbPassword, (record, password) => {
        // Gera um e-mail diferente do armazenado adicionando sufixo
        const wrongEmail = 'wrong_' + record.email
        const result = validateClientDashboardPassword(record, wrongEmail, password)
        expect(result).toBe(false)
      }),
      { numRuns: 200 }
    )
  })

  test('retorna false quando a senha não corresponde à armazenada', () => {
    /**
     * **Validates: Requirements 2.3**
     * Para qualquer parceiro existente, se a senha informada for diferente
     * da senha armazenada, a função retorna FALSE — sem revelar que o e-mail
     * poderia estar correto.
     */
    fc.assert(
      fc.property(arbClientRecord, (record) => {
        const wrongPassword = record.password + '_wrong'
        const result = validateClientDashboardPassword(
          record,
          record.email,
          wrongPassword
        )
        expect(result).toBe(false)
      }),
      { numRuns: 200 }
    )
  })

  test('retorna false quando tanto e-mail quanto senha estão errados', () => {
    /**
     * **Validates: Requirements 2.3**
     * Quando ambos os campos estão errados, a função retorna FALSE.
     * A mensagem de erro não pode revelar qual campo está incorreto.
     */
    fc.assert(
      fc.property(arbClientRecord, (record) => {
        const wrongEmail = 'wrong_' + record.email
        const wrongPassword = record.password + '_wrong'
        const result = validateClientDashboardPassword(
          record,
          wrongEmail,
          wrongPassword
        )
        expect(result).toBe(false)
      }),
      { numRuns: 200 }
    )
  })

  test('retorna true apenas quando e-mail E senha correspondem exatamente', () => {
    /**
     * **Validates: Requirements 2.3**
     * A função só retorna TRUE quando ambos os campos estão corretos.
     * Confirma que a propriedade de retorno false para inválidos é precisa.
     */
    fc.assert(
      fc.property(arbClientRecord, (record) => {
        const result = validateClientDashboardPassword(
          record,
          record.email,
          record.password
        )
        expect(result).toBe(true)
      }),
      { numRuns: 200 }
    )
  })

  test('retorna true para e-mail com variações de case e espaços (normalização)', () => {
    /**
     * **Validates: Requirements 2.3**
     * A comparação de e-mail é case-insensitive e ignora espaços nas bordas,
     * espelhando LOWER(TRIM(...)) do SQL.
     */
    fc.assert(
      fc.property(arbClientRecord, (record) => {
        const emailWithSpaces = '  ' + record.email.toUpperCase() + '  '
        const result = validateClientDashboardPassword(
          record,
          emailWithSpaces,
          record.password
        )
        expect(result).toBe(true)
      }),
      { numRuns: 200 }
    )
  })
})

// ─── Propriedade 2: recover_client_password ──────────────────────────────────
// **Validates: Requirement 3.5**
//
// Para slug ou e-mail inexistentes, a função retorna vazio (sem atualizar nada).
// Não revela se o slug existe ou não.

describe('Property: recover_client_password retorna vazio para slug ou e-mail inexistentes', () => {

  test('retorna vazio (updated=false, record=null) quando slug não existe', () => {
    /**
     * **Validates: Requirements 3.5**
     * Para qualquer e-mail e senha temporária, se o slug não corresponde
     * a nenhum parceiro, a função retorna sem fazer nada.
     */
    fc.assert(
      fc.property(arbEmail, arbPassword, (email, newTempPassword) => {
        const result = recoverClientPassword(null, email, newTempPassword)
        expect(result.updated).toBe(false)
        expect(result.record).toBeNull()
      }),
      { numRuns: 200 }
    )
  })

  test('retorna vazio quando o e-mail não corresponde ao registrado', () => {
    /**
     * **Validates: Requirements 3.5**
     * Para qualquer parceiro existente, se o e-mail informado não bate
     * com o e-mail armazenado, a função retorna sem fazer nada.
     */
    fc.assert(
      fc.property(arbClientRecord, arbPassword, (record, newTempPassword) => {
        const wrongEmail = 'wrong_' + record.email
        const result = recoverClientPassword(record, wrongEmail, newTempPassword)
        expect(result.updated).toBe(false)
        expect(result.record).toBeNull()
      }),
      { numRuns: 200 }
    )
  })

  test('não modifica o registro original quando slug ou e-mail são inválidos', () => {
    /**
     * **Validates: Requirements 3.5**
     * A função não deve alterar nenhum dado quando as credenciais são inválidas.
     * Garante que não há efeito colateral em caso de slug/e-mail inexistentes.
     */
    fc.assert(
      fc.property(arbClientRecord, arbPassword, (record, newTempPassword) => {
        const originalPassword = record.password
        const wrongEmail = 'wrong_' + record.email

        recoverClientPassword(record, wrongEmail, newTempPassword)

        // O registro original não deve ter sido modificado
        expect(record.password).toBe(originalPassword)
      }),
      { numRuns: 200 }
    )
  })

  test('atualiza senha e define has_temp_password=true quando slug+e-mail são válidos', () => {
    /**
     * **Validates: Requirements 3.5**
     * Confirma o comportamento positivo: quando slug e e-mail são válidos,
     * a senha é atualizada e has_temp_password é definido como true.
     */
    fc.assert(
      fc.property(arbClientRecord, arbPassword, (record, newTempPassword) => {
        const result = recoverClientPassword(record, record.email, newTempPassword)
        expect(result.updated).toBe(true)
        expect(result.record).not.toBeNull()
        expect(result.record.password).toBe(newTempPassword)
        expect(result.record.has_temp_password).toBe(true)
      }),
      { numRuns: 200 }
    )
  })

  test('e-mail com variações de case e espaços é aceito (normalização)', () => {
    /**
     * **Validates: Requirements 3.5**
     * A comparação de e-mail em recover_client_password também é
     * case-insensitive e ignora espaços, espelhando LOWER(TRIM(...)) do SQL.
     */
    fc.assert(
      fc.property(arbClientRecord, arbPassword, (record, newTempPassword) => {
        const emailWithSpaces = '  ' + record.email.toUpperCase() + '  '
        const result = recoverClientPassword(record, emailWithSpaces, newTempPassword)
        expect(result.updated).toBe(true)
        expect(result.record.password).toBe(newTempPassword)
      }),
      { numRuns: 200 }
    )
  })
})
