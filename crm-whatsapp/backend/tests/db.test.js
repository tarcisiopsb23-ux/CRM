'use strict'

import { describe, test, beforeAll } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import initSqlJs from 'sql.js'
import { initDbSqlJs, upsertContato, getContatos, updateContato } from '../db.js'

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** Helper: creates a fresh in-memory database for each test run */
function makeDb() {
  return initDbSqlJs(SQL)
}

// Arbitrary for a non-empty phone string (digits only, 8-15 chars)
const arbTelefone = fc.stringMatching(/^[0-9]{8,15}$/)

// Arbitrary for a non-empty name
const arbNome = fc.string({ minLength: 1, maxLength: 50 })

// Arbitrary for ISO-8601-like date string
const arbData = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map(d => d.toISOString())

// Arbitrary for a valid contato input
const arbContato = fc.record({
  nome: arbNome,
  telefone: arbTelefone,
  ultima_mensagem: fc.string({ maxLength: 200 }),
  data_ultima_interacao: arbData,
  tem_keyword: fc.integer({ min: 0, max: 1 }),
})

// Arbitrary for valid status values
const arbStatusClassificado = fc.constantFrom('negocio', 'nao_negocio')
const arbStatusValido = fc.constantFrom('pendente', 'negocio', 'nao_negocio')

// Feature: crm-whatsapp, Property 2: Novo contato sempre inicia com status "pendente"
// Validates: Requirements 2.2, 2.5, 8.4
describe('Property 2: Novo contato sempre inicia com status "pendente"', () => {
  test('contato recém-inserido tem status pendente e origem whatsapp', () => {
    fc.assert(
      fc.property(arbContato, (contato) => {
        const db = makeDb()
        upsertContato(db, contato)
        const rows = getContatos(db)
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('pendente')
        expect(rows[0].origem).toBe('whatsapp')
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 3: Unicidade de contato por telefone
// Validates: Requirements 2.3, 2.4, 8.2
describe('Property 3: Unicidade de contato por telefone', () => {
  test('múltiplas mensagens do mesmo telefone resultam em 1 registro com dados da última mensagem', () => {
    fc.assert(
      fc.property(
        arbTelefone,
        arbNome,
        fc.array(
          fc.record({
            ultima_mensagem: fc.string({ maxLength: 200 }),
            data_ultima_interacao: arbData,
            tem_keyword: fc.integer({ min: 0, max: 1 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (telefone, nome, mensagens) => {
          const db = makeDb()
          for (const m of mensagens) {
            upsertContato(db, { nome, telefone, ...m })
          }
          const rows = getContatos(db)
          expect(rows).toHaveLength(1)
          expect(rows[0].telefone).toBe(telefone)
          // ultima_mensagem deve ser a da última chamada
          const last = mensagens[mensagens.length - 1]
          expect(rows[0].ultima_mensagem).toBe(last.ultima_mensagem)
          expect(rows[0].data_ultima_interacao).toBe(last.data_ultima_interacao)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 5: Keyword não altera status já classificado
// Validates: Requirements 3.4
describe('Property 5: Keyword não altera status já classificado', () => {
  test('upsert com tem_keyword=1 não muda status negocio/nao_negocio', () => {
    fc.assert(
      fc.property(
        arbContato,
        arbStatusClassificado,
        fc.string({ maxLength: 200 }),
        arbData,
        (contato, statusClassificado, novaMensagem, novaData) => {
          const db = makeDb()
          // Insert initial contact
          upsertContato(db, contato)
          // Classify it
          const rows = getContatos(db)
          const id = rows[0].id
          updateContato(db, id, { status: statusClassificado })
          // Now upsert again with tem_keyword=1
          upsertContato(db, {
            ...contato,
            ultima_mensagem: novaMensagem,
            data_ultima_interacao: novaData,
            tem_keyword: 1,
          })
          const updated = getContatos(db)
          expect(updated).toHaveLength(1)
          expect(updated[0].status).toBe(statusClassificado)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 6: Atualização de status é persistida corretamente
// Validates: Requirements 4.3
describe('Property 6: Atualização de status é persistida corretamente', () => {
  test('updateContato persiste o novo status e o retorna', () => {
    fc.assert(
      fc.property(arbContato, arbStatusValido, (contato, novoStatus) => {
        const db = makeDb()
        upsertContato(db, contato)
        const rows = getContatos(db)
        const id = rows[0].id
        const updated = updateContato(db, id, { status: novoStatus })
        expect(updated).not.toBeNull()
        expect(updated.status).toBe(novoStatus)
        // Verify persistence
        const fromDb = getContatos(db)
        expect(fromDb[0].status).toBe(novoStatus)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 7: Round-trip de observação
// Validates: Requirements 4.6
describe('Property 7: Round-trip de observação', () => {
  test('observação salva via updateContato é retornada intacta', () => {
    fc.assert(
      fc.property(arbContato, fc.string({ maxLength: 500 }), (contato, observacao) => {
        const db = makeDb()
        upsertContato(db, contato)
        const rows = getContatos(db)
        const id = rows[0].id
        const updated = updateContato(db, id, { observacao })
        expect(updated).not.toBeNull()
        expect(updated.observacao).toBe(observacao)
        // Verify persistence
        const fromDb = getContatos(db)
        expect(fromDb[0].observacao).toBe(observacao)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 8: Ordenação da listagem por data decrescente
// Validates: Requirements 5.1
describe('Property 8: Ordenação da listagem por data decrescente', () => {
  test('getContatos retorna contatos ordenados por data_ultima_interacao DESC', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            nome: arbNome,
            telefone: arbTelefone,
            ultima_mensagem: fc.string({ maxLength: 100 }),
            data_ultima_interacao: arbData,
            tem_keyword: fc.integer({ min: 0, max: 1 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (contatos) => {
          // Deduplicate by telefone (keep last occurrence)
          const byPhone = new Map()
          for (const c of contatos) byPhone.set(c.telefone, c)
          const unique = Array.from(byPhone.values())

          const db = makeDb()
          for (const c of unique) {
            upsertContato(db, c)
          }

          const rows = getContatos(db)
          for (let i = 0; i < rows.length - 1; i++) {
            const a = rows[i].data_ultima_interacao
            const b = rows[i + 1].data_ultima_interacao
            // DESC: a >= b (null values sort last in SQLite)
            if (a !== null && b !== null) {
              expect(a >= b).toBe(true)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
