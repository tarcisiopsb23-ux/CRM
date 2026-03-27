'use strict'

const path = require('path')

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS contatos (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                  TEXT NOT NULL,
    telefone              TEXT NOT NULL UNIQUE,
    origem                TEXT NOT NULL DEFAULT 'whatsapp',
    ultima_mensagem       TEXT,
    tipo_mensagem         TEXT,
    data_ultima_interacao TEXT,
    status                TEXT NOT NULL DEFAULT 'pendente'
                            CHECK(status IN ('pendente','negocio','nao_negocio')),
    observacao            TEXT,
    valor_potencial       REAL,
    tem_keyword           INTEGER NOT NULL DEFAULT 0
  )
`

/**
 * Wraps node:sqlite DatabaseSync to expose a better-sqlite3-compatible API
 * (prepare().run(), prepare().get(), prepare().all(), exec())
 */
function wrapNodeSqlite(rawDb) {
  function prepare(sql) {
    return {
      run(...params) {
        const stmt = rawDb.prepare(sql)
        const result = stmt.run(...params)
        return { lastInsertRowid: result.lastInsertRowid }
      },
      get(...params) {
        const stmt = rawDb.prepare(sql)
        return stmt.get(...params) ?? undefined
      },
      all(...params) {
        const stmt = rawDb.prepare(sql)
        return stmt.all(...params)
      },
    }
  }

  function exec(sql) {
    rawDb.exec(sql)
  }

  return { prepare, exec }
}

/**
 * Initializes the SQLite database using node:sqlite (built-in, no native deps).
 * @param {string} [dbPath] - optional path override (defaults to database/crm.db)
 * @returns {object} - better-sqlite3-compatible wrapper
 */
function initDb(dbPath) {
  const resolvedPath = dbPath || path.resolve(__dirname, '../database/crm.db')
  let DatabaseSync
  try {
    ;({ DatabaseSync } = require('node:sqlite'))
  } catch (err) {
    console.error('[db] Erro fatal ao carregar node:sqlite:', err)
    process.exit(1)
  }

  let rawDb
  try {
    rawDb = new DatabaseSync(resolvedPath)
  } catch (err) {
    console.error('[db] Erro fatal ao abrir o banco de dados:', err)
    process.exit(1)
  }

  try {
    rawDb.exec(CREATE_TABLE_SQL)
    // migration segura: adiciona coluna se não existir (banco já criado antes)
    try { rawDb.exec('ALTER TABLE contatos ADD COLUMN tipo_mensagem TEXT') } catch (_) {}
  } catch (err) {
    console.error('[db] Erro fatal ao criar tabela:', err)
    process.exit(1)
  }

  return wrapNodeSqlite(rawDb)
}

/**
 * Creates an in-memory database using sql.js (for testing).
 */
function initDbSqlJs(SQL) {
  const db = new SQL.Database()
  db.run(CREATE_TABLE_SQL)
  return wrapSqlJs(db)
}

/**
 * Wraps a sql.js Database to expose a better-sqlite3-compatible API
 */
function wrapSqlJs(sqlJsDb) {
  function prepare(sql) {
    return {
      run(...params) {
        sqlJsDb.run(sql, params)
        const res = sqlJsDb.exec('SELECT last_insert_rowid() as id')
        const id = res.length ? res[0].values[0][0] : null
        return { lastInsertRowid: id }
      },
      get(...params) {
        const stmt = sqlJsDb.prepare(sql)
        stmt.bind(params)
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      },
      all(...params) {
        const results = []
        const stmt = sqlJsDb.prepare(sql)
        stmt.bind(params)
        while (stmt.step()) {
          results.push(stmt.getAsObject())
        }
        stmt.free()
        return results
      },
    }
  }

  function exec(sql) {
    sqlJsDb.run(sql)
  }

  return { prepare, exec }
}

/**
 * Upserts a contact.
 */
function upsertContato(db, contato) {
  const nome = contato.nome || contato.telefone
  const telefone = contato.telefone
  const ultima_mensagem = contato.ultima_mensagem !== undefined ? contato.ultima_mensagem : null
  const tipo_mensagem = contato.tipo_mensagem || null
  const data_ultima_interacao = contato.data_ultima_interacao || null
  const tem_keyword = contato.tem_keyword ? 1 : 0

  db.prepare(`
    INSERT INTO contatos (nome, telefone, ultima_mensagem, tipo_mensagem, data_ultima_interacao, tem_keyword)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telefone) DO UPDATE SET
      ultima_mensagem       = excluded.ultima_mensagem,
      tipo_mensagem         = excluded.tipo_mensagem,
      data_ultima_interacao = excluded.data_ultima_interacao,
      tem_keyword           = excluded.tem_keyword
  `).run(nome, telefone, ultima_mensagem, tipo_mensagem, data_ultima_interacao, tem_keyword)
}

/**
 * Returns contacts ordered by data_ultima_interacao DESC, optionally filtered by status.
 */
function getContatos(db, status) {
  if (status) {
    return db.prepare(
      'SELECT * FROM contatos WHERE status = ? ORDER BY data_ultima_interacao DESC'
    ).all(status)
  }
  return db.prepare(
    'SELECT * FROM contatos ORDER BY data_ultima_interacao DESC'
  ).all()
}

/**
 * Updates status and/or observacao for a contact by id.
 */
function updateContato(db, id, fields) {
  const existing = db.prepare('SELECT * FROM contatos WHERE id = ?').get(id)
  if (!existing) return null

  const setClauses = []
  const values = []

  if (fields.status !== undefined) {
    setClauses.push('status = ?')
    values.push(fields.status)
  }
  if (fields.observacao !== undefined) {
    setClauses.push('observacao = ?')
    values.push(fields.observacao)
  }

  if (setClauses.length === 0) return existing

  values.push(id)
  db.prepare(`UPDATE contatos SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  return db.prepare('SELECT * FROM contatos WHERE id = ?').get(id)
}

module.exports = { initDb, initDbSqlJs, upsertContato, getContatos, updateContato }
