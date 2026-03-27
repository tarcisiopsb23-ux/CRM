'use strict'

// Palavras-chave de intenção de compra (UTF-8)
const KEYWORDS = ['pre\u00E7o', 'valor', 'or\u00E7amento', 'quanto custa']

/**
 * Returns true if the message contains at least one business keyword (case-insensitive).
 * @param {string} message
 * @returns {boolean}
 */
function hasBusinessKeyword(message) {
  const lower = message.toLowerCase()
  return KEYWORDS.some(kw => lower.includes(kw))
}

module.exports = { KEYWORDS, hasBusinessKeyword }
