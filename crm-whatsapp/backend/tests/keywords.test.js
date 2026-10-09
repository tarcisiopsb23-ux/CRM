'use strict'

import { describe, test } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { KEYWORDS, hasBusinessKeyword } = require('../keywords.js')

// Helper: randomly change case of each character in a string
function randomCase(str, seed) {
  // Use fast-check's own arbitrary for this — handled via fc.string transformations
  return str
}

// Arbitrary: takes a keyword and returns a case-mutated version
const arbMutatedKeyword = fc.constantFrom(...KEYWORDS).chain(kw =>
  fc.array(fc.boolean(), { minLength: kw.length, maxLength: kw.length }).map(flips =>
    kw.split('').map((ch, i) => (flips[i] ? ch.toUpperCase() : ch.toLowerCase())).join('')
  )
)

// Arbitrary: a message that contains a mutated keyword (prefix + keyword + suffix)
const arbMessageWithKeyword = fc.tuple(
  fc.string({ maxLength: 30 }),
  arbMutatedKeyword,
  fc.string({ maxLength: 30 })
).map(([prefix, kw, suffix]) => prefix + kw + suffix)

// Arbitrary: a message that contains none of the keywords
const arbMessageWithoutKeyword = fc.string({ minLength: 0, maxLength: 100 }).filter(msg => {
  const lower = msg.toLowerCase()
  return KEYWORDS.every(kw => !lower.includes(kw))
})

// Feature: crm-whatsapp, Property 4: Detecção de keywords é case-insensitive
// Validates: Requirements 3.1, 3.2
describe('Property 4: Detecção de keywords é case-insensitive', () => {
  test('mensagem com keyword em qualquer combinação de maiúsculas/minúsculas retorna true', () => {
    fc.assert(
      fc.property(arbMessageWithKeyword, (message) => {
        expect(hasBusinessKeyword(message)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  test('mensagem sem nenhuma keyword retorna false', () => {
    fc.assert(
      fc.property(arbMessageWithoutKeyword, (message) => {
        expect(hasBusinessKeyword(message)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
