'use strict'

/**
 * Testes de propriedade para funções puras do frontend.
 * Importa calcDashboard e renderContatoCard de frontend/utils.js.
 *
 * Feature: crm-whatsapp
 */

import { describe, test } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import { calcDashboard, renderContatoCard } from '../../frontend/utils.js'

// ===== Arbitrários =====

const arbStatus = fc.constantFrom('pendente', 'negocio', 'nao_negocio')

const arbContato = fc.record({
  id: fc.integer({ min: 1, max: 999999 }),
  nome: fc.string({ minLength: 1, maxLength: 60 }),
  telefone: fc.stringMatching(/^[0-9]{8,15}$/),
  ultima_mensagem: fc.oneof(fc.string({ maxLength: 200 }), fc.constant(null)),
  data_ultima_interacao: fc.oneof(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
    fc.constant(null)
  ),
  status: arbStatus,
  observacao: fc.oneof(fc.string({ maxLength: 200 }), fc.constant(null)),
  tem_keyword: fc.integer({ min: 0, max: 1 }),
})

const arbListaContatos = fc.array(arbContato, { minLength: 0, maxLength: 50 })

// ===== Property 10: Renderização completa do card de contato =====
// Feature: crm-whatsapp, Property 10: Renderização completa do card
// Validates: Requirements 5.4

describe('Property 10: Renderização completa do card de contato', () => {
  test('HTML gerado contém nome, telefone, última mensagem, data, status e badge keyword quando tem_keyword=1', () => {
    fc.assert(
      fc.property(
        arbContato,
        (contato) => {
          const html = renderContatoCard(contato)

          // Deve conter o nome (escapado) — verifica que os primeiros chars do nome aparecem no HTML
          // Usa a própria função escapeHtml para comparar
          function escapeHtml(str) {
            if (str == null) return ''
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
          }
          expect(html).toContain(escapeHtml(contato.nome))

          // Deve conter o telefone
          expect(html).toContain(contato.telefone)

          // Deve conter o status como classe CSS
          expect(html).toContain(`badge-status ${contato.status}`)

          // Deve conter o badge de keyword quando tem_keyword=1
          if (contato.tem_keyword === 1) {
            expect(html).toContain('badge-keyword')
          } else {
            expect(html).not.toContain('badge-keyword')
          }

          // Deve conter os botões de ação
          expect(html).toContain('btn-negocio')
          expect(html).toContain('btn-nao-negocio')
          expect(html).toContain('btn-obs')

          // Deve conter o campo de observação inline
          expect(html).toContain(`obs-${contato.id}`)

          // Deve conter a última mensagem (truncada se necessário)
          if (contato.ultima_mensagem && contato.ultima_mensagem.length > 0) {
            const primeiros = escapeHtml(contato.ultima_mensagem.slice(0, 40))
            expect(html).toContain(primeiros)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ===== Property 11: Consistência das métricas do dashboard =====
// Feature: crm-whatsapp, Property 11: Consistência do dashboard
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

describe('Property 11: Consistência das métricas do dashboard', () => {
  test('total = pendentes + negocios + nao_negocios; taxa calculada corretamente', () => {
    fc.assert(
      fc.property(
        arbListaContatos,
        (lista) => {
          const { total, pendentes, negocios, nao_negocios, conversao } = calcDashboard(lista)

          // total = soma das três categorias
          expect(total).toBe(pendentes + negocios + nao_negocios)

          // total deve ser igual ao tamanho da lista
          expect(total).toBe(lista.length)

          // Contagens individuais devem ser não-negativas
          expect(pendentes).toBeGreaterThanOrEqual(0)
          expect(negocios).toBeGreaterThanOrEqual(0)
          expect(nao_negocios).toBeGreaterThanOrEqual(0)

          // Taxa de conversão
          const denominador = negocios + nao_negocios
          if (denominador === 0) {
            expect(conversao).toBe('0.0%')
          } else {
            const esperado = (negocios / denominador * 100).toFixed(1) + '%'
            expect(conversao).toBe(esperado)
          }

          // Conversão deve terminar com '%'
          expect(conversao).toMatch(/%$/)

          // Conversão deve ter exatamente 1 casa decimal
          expect(conversao).toMatch(/^\d+\.\d%$/)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('taxa de conversão é 0.0% quando não há contatos classificados', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1 }),
            nome: fc.string({ minLength: 1 }),
            telefone: fc.stringMatching(/^[0-9]{8,15}$/),
            ultima_mensagem: fc.constant(null),
            data_ultima_interacao: fc.constant(null),
            status: fc.constant('pendente'),
            observacao: fc.constant(null),
            tem_keyword: fc.integer({ min: 0, max: 1 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (listaPendentes) => {
          const { conversao, negocios, nao_negocios } = calcDashboard(listaPendentes)
          expect(negocios).toBe(0)
          expect(nao_negocios).toBe(0)
          expect(conversao).toBe('0.0%')
        }
      ),
      { numRuns: 100 }
    )
  })
})
