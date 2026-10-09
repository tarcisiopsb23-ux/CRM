'use strict'

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { handleMessage } from '../whatsapp.js'

// Arbitrary for a phone number string (digits only, 8-15 chars)
const arbTelefone = fc.stringMatching(/^[0-9]{8,15}$/)

// Arbitrary for a non-empty message body
const arbBody = fc.string({ minLength: 1, maxLength: 200 })

// Arbitrary for a Unix timestamp (seconds) — year 2020 to 2030
const arbTimestamp = fc.integer({ min: 1577836800, max: 1893456000 })

// Arbitrary for an optional notifyName
const arbNotifyName = fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })

/**
 * Creates a mock db that records calls to upsertContato.
 */
function makeMockDb() {
  const calls = []
  return {
    calls,
    prepare: () => ({
      run: (...args) => { calls.push(args) },
      get: () => undefined,
      all: () => [],
    }),
  }
}

// Feature: crm-whatsapp, Property 1: Extração completa de dados da mensagem
// Validates: Requirements 2.1
describe('Property 1: Extração completa de dados da mensagem', () => {
  test('dados extraídos correspondem aos campos da mensagem recebida', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTelefone,
        arbBody,
        arbTimestamp,
        arbNotifyName,
        async (telefone, body, timestamp, notifyName) => {
          const capturedUpserts = []

          // Mock db that captures upsertContato calls via prepare().run()
          const mockDb = {
            prepare: (sql) => ({
              run: (...args) => {
                capturedUpserts.push({ sql, args })
              },
              get: () => undefined,
              all: () => [],
            }),
          }

          const msg = {
            fromMe: false,
            from: `${telefone}@c.us`,
            body,
            timestamp,
            _data: notifyName ? { notifyName } : {},
          }

          await handleMessage(msg, mockDb)

          // Exactly one upsert should have been called
          expect(capturedUpserts).toHaveLength(1)

          // upsertContato calls prepare(sql).run(nome, telefone, ultima_mensagem, data_ultima_interacao, tem_keyword)
          const [nome, tel, ultima_mensagem, data_ultima_interacao] = capturedUpserts[0].args

          // telefone extracted correctly (strip @c.us)
          expect(tel).toBe(telefone)

          // nome: notifyName if present, else telefone
          const expectedNome = notifyName || telefone
          expect(nome).toBe(expectedNome)

          // ultima_mensagem matches body
          expect(ultima_mensagem).toBe(body)

          // timestamp converted correctly to ISO string
          const expectedTs = new Date(timestamp * 1000).toISOString()
          expect(data_ultima_interacao).toBe(expectedTs)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 14: Mensagens ignoradas não geram upsert
// Validates: Requirements 9.1, 9.2, 9.3
describe('Property 14: Mensagens ignoradas não geram upsert', () => {
  test('mensagem fromMe=true não chama upsertContato', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTelefone,
        arbBody,
        arbTimestamp,
        async (telefone, body, timestamp) => {
          const capturedUpserts = []
          const mockDb = {
            prepare: (sql) => ({
              run: (...args) => { capturedUpserts.push(args) },
              get: () => undefined,
              all: () => [],
            }),
          }

          const msg = {
            fromMe: true,
            from: `${telefone}@c.us`,
            body,
            timestamp,
            _data: {},
          }

          await handleMessage(msg, mockDb)
          expect(capturedUpserts).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('mensagem de grupo (@g.us) não chama upsertContato', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTelefone,
        arbBody,
        arbTimestamp,
        async (telefone, body, timestamp) => {
          const capturedUpserts = []
          const mockDb = {
            prepare: (sql) => ({
              run: (...args) => { capturedUpserts.push(args) },
              get: () => undefined,
              all: () => [],
            }),
          }

          const msg = {
            fromMe: false,
            from: `${telefone}@g.us`,
            body,
            timestamp,
            _data: {},
          }

          await handleMessage(msg, mockDb)
          expect(capturedUpserts).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})
