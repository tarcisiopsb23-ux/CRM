'use strict'

import { describe, test, beforeAll, vi } from 'vitest'
import { expect } from 'vitest'
import initSqlJs from 'sql.js'
import { initDbSqlJs, upsertContato, getContatos, updateContato } from '../db.js'

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** Helper: creates a fresh in-memory database for each test */
function makeDb() {
  return initDbSqlJs(SQL)
}

// ─── Req 8.1, 8.3: Inicialização do banco — schema criado corretamente ───────

describe('Inicialização do banco (Req 8.1, 8.3)', () => {
  test('tabela contatos existe após initDbSqlJs', () => {
    const db = makeDb()
    // Query sqlite_master to confirm the table was created
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='contatos'"
    ).get()
    expect(row).toBeDefined()
    expect(row.name).toBe('contatos')
  })

  test('tabela contatos possui todos os campos esperados', () => {
    const db = makeDb()
    const cols = db.prepare('PRAGMA table_info(contatos)').all()
    const colNames = cols.map(c => c.name)
    const expected = [
      'id', 'nome', 'telefone', 'origem',
      'ultima_mensagem', 'data_ultima_interacao',
      'status', 'observacao', 'valor_potencial', 'tem_keyword',
    ]
    for (const col of expected) {
      expect(colNames).toContain(col)
    }
  })

  test('campo status tem valor padrão "pendente"', () => {
    const db = makeDb()
    const cols = db.prepare('PRAGMA table_info(contatos)').all()
    const statusCol = cols.find(c => c.name === 'status')
    expect(statusCol).toBeDefined()
    expect(statusCol.dflt_value).toBe("'pendente'")
  })

  test('campo telefone é UNIQUE', () => {
    const db = makeDb()
    const indexList = db.prepare('PRAGMA index_list(contatos)').all()
    // There should be at least one unique index (the one on telefone)
    const hasUnique = indexList.some(idx => idx.unique === 1)
    expect(hasUnique).toBe(true)
  })
})

// ─── Req 2.6: Fallback de nome para telefone quando nome ausente ──────────────

describe('Fallback de nome para telefone (Req 2.6)', () => {
  test('usa telefone como nome quando nome não é fornecido', () => {
    const db = makeDb()
    upsertContato(db, { telefone: '5511999990001' })
    const rows = getContatos(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('5511999990001')
  })

  test('usa telefone como nome quando nome é string vazia', () => {
    const db = makeDb()
    upsertContato(db, { nome: '', telefone: '5511999990002' })
    const rows = getContatos(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('5511999990002')
  })

  test('usa telefone como nome quando nome é null', () => {
    const db = makeDb()
    upsertContato(db, { nome: null, telefone: '5511999990003' })
    const rows = getContatos(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('5511999990003')
  })

  test('preserva nome quando fornecido', () => {
    const db = makeDb()
    upsertContato(db, { nome: 'João Silva', telefone: '5511999990004' })
    const rows = getContatos(db)
    expect(rows[0].nome).toBe('João Silva')
  })
})

// ─── Req 5.5: Lista vazia retorna array vazio de getContatos ──────────────────

describe('Lista vazia (Req 5.5)', () => {
  test('getContatos retorna array vazio quando banco não tem contatos', () => {
    const db = makeDb()
    const rows = getContatos(db)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })

  test('getContatos com filtro de status retorna array vazio quando não há correspondência', () => {
    const db = makeDb()
    upsertContato(db, { telefone: '5511999990010' })
    // No contacts with status 'negocio' yet
    const rows = getContatos(db, 'negocio')
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })
})

// ─── Req 7.6: updateContato retorna null para ID inexistente ─────────────────

describe('updateContato com ID inexistente (Req 7.6)', () => {
  test('retorna null quando id não existe no banco', () => {
    const db = makeDb()
    const result = updateContato(db, 9999, { status: 'negocio' })
    expect(result).toBeNull()
  })

  test('retorna null para id zero', () => {
    const db = makeDb()
    const result = updateContato(db, 0, { status: 'pendente' })
    expect(result).toBeNull()
  })

  test('retorna null para id negativo', () => {
    const db = makeDb()
    const result = updateContato(db, -1, { observacao: 'teste' })
    expect(result).toBeNull()
  })

  test('retorna o contato atualizado quando id existe', () => {
    const db = makeDb()
    upsertContato(db, { telefone: '5511999990020', nome: 'Teste' })
    const rows = getContatos(db)
    const id = rows[0].id
    const result = updateContato(db, id, { status: 'negocio' })
    expect(result).not.toBeNull()
    expect(result.status).toBe('negocio')
  })
})

// ─── Req 8.5: Erro de banco não encerra o processo ───────────────────────────

describe('Erro de banco não encerra o processo (Req 8.5)', () => {
  test('upsertContato com db quebrado não lança exceção não tratada para o processo', () => {
    // Simulate a broken db by passing an object whose prepare() throws
    const brokenDb = {
      prepare: () => {
        throw new Error('Simulated DB write error')
      },
    }

    // The process should NOT crash — the error should be catchable
    // upsertContato itself may throw, but the caller (e.g. whatsapp handler) wraps it
    // Here we verify the error is a regular JS Error (not a process.exit)
    let caughtError = null
    try {
      upsertContato(brokenDb, { telefone: '5511999990030' })
    } catch (err) {
      caughtError = err
    }

    // The error is catchable — process is still alive
    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError.message).toContain('Simulated DB write error')
  })

  test('getContatos com db quebrado lança erro tratável (não process.exit)', () => {
    const brokenDb = {
      prepare: () => {
        throw new Error('Simulated DB read error')
      },
    }

    let caughtError = null
    try {
      getContatos(brokenDb)
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError.message).toContain('Simulated DB read error')
  })

  test('process.exit não é chamado em erros de escrita (mock de process.exit)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    const brokenDb = {
      prepare: () => { throw new Error('write error') },
    }

    try {
      upsertContato(brokenDb, { telefone: '5511999990031' })
    } catch {
      // expected — error is thrown, not process.exit
    }

    // process.exit should NOT have been called for a write error
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})
