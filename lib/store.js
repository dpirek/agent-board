'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');
const UPDATED_AT_TABLES = [
  'organizations', 'users', 'projects', 'workflows', 'issues', 'comments', 'boards', 'agents'
];

function sqliteSchema(postgresSql) {
  const beforeFunctions = postgresSql.split(/-- ={20,}\s*\n-- HELPER FUNCTION:/i)[0];
  const schema = beforeFunctions
    .replace(/^CREATE EXTENSION[^;]+;\s*/gim, '')
    .replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/CREATE INDEX\s+(?!IF NOT EXISTS)/gi, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/\s+DEFAULT\s+gen_random_uuid\(\)/gi, '')
    .replace(/now\(\)/gi, "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
    .replace(/::jsonb/gi, '')
    .replace(/USING\s+GIN\s*\(([^)]+)\)/gi, '($1)');

  const triggers = UPDATED_AT_TABLES.map((table) => `
CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at
AFTER UPDATE ON ${table}
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE ${table}
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE id = NEW.id;
END;`).join('\n');
  return `${schema.trim()}\n${triggers}\n`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

class SqliteStore {
  constructor(filePath, options = {}) {
    if (!filePath) throw new Error('A SQLite database path is required');
    this.filePath = filePath === ':memory:' ? filePath : path.resolve(filePath);
    if (this.filePath !== ':memory:') fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.database = new DatabaseSync(this.filePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    const source = fs.readFileSync(options.schemaPath || DEFAULT_SCHEMA_PATH, 'utf8');
    this.database.exec(sqliteSchema(source));
    this.schemas = this.readSchemas();
  }

  close() {
    this.database.close();
  }

  readSchemas() {
    const tables = this.database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    const schemas = {};
    for (const { name } of tables) {
      const quoted = quoteIdentifier(name);
      const foreignKeys = this.database.prepare(`PRAGMA foreign_key_list(${quoted})`).all();
      const references = Object.fromEntries(foreignKeys.map((key) => [key.from, {
        entity: key.table,
        field: key.to,
        onDelete: key.on_delete
      }]));
      const fields = {};
      for (const column of this.database.prepare(`PRAGMA table_info(${quoted})`).all()) {
        const declaredType = String(column.type || 'TEXT').toLowerCase();
        fields[column.name] = {
          type: declaredType.includes('uuid') ? 'uuid'
            : declaredType.includes('json') ? 'json'
              : declaredType.includes('bool') ? 'boolean'
                : declaredType.includes('int') ? 'integer'
                  : declaredType.includes('numeric') ? 'number'
                    : declaredType.includes('date') || declaredType.includes('time') ? 'timestamp'
                      : 'string',
          required: Boolean(column.notnull || column.pk),
          nullable: !column.notnull && !column.pk,
          generated: column.name === 'id' || column.dflt_value !== null,
          primaryKey: Boolean(column.pk),
          default: column.dflt_value,
          ...(references[column.name] ? { references: references[column.name].entity, reference: references[column.name] } : {})
        };
      }
      const unique = [];
      for (const index of this.database.prepare(`PRAGMA index_list(${quoted})`).all()) {
        if (!index.unique) continue;
        const columns = this.database.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all()
          .sort((a, b) => a.seqno - b.seqno).map((column) => column.name);
        if (columns.length) unique.push(columns);
      }
      schemas[name] = { fields, unique };
    }
    return schemas;
  }

  describeSchema() {
    return { entities: this.schemas };
  }

  getSchema(entityName) {
    const schema = this.schemas[entityName];
    if (!schema) throw new Error(`Unknown entity '${entityName}'. Expected one of: ${Object.keys(this.schemas).join(', ')}`);
    return schema;
  }

  encodeValue(definition, value) {
    if (value === null || value === undefined) return value;
    if (definition.type === 'json') return typeof value === 'string' ? value : JSON.stringify(value);
    if (definition.type === 'boolean') return value ? 1 : 0;
    if (typeof value === 'object') throw new Error('Only JSON fields accept object or array values');
    return value;
  }

  decodeRow(entityName, row) {
    if (!row) return row;
    const schema = this.getSchema(entityName);
    const decoded = { ...row };
    for (const [field, value] of Object.entries(decoded)) {
      if (value === null) continue;
      const definition = schema.fields[field];
      if (definition?.type === 'boolean') decoded[field] = Boolean(value);
      if (definition?.type === 'json' && typeof value === 'string') {
        try { decoded[field] = JSON.parse(value); } catch { /* Preserve malformed legacy values. */ }
      }
    }
    return decoded;
  }

  list(entityName, filters = {}, limit = 100) {
    const schema = this.getSchema(entityName);
    const clauses = [];
    const parameters = [];
    for (const [field, value] of Object.entries(filters)) {
      const definition = schema.fields[field];
      if (!definition) throw new Error(`Unknown filter field '${field}'`);
      clauses.push(`${quoteIdentifier(field)} ${value === null ? 'IS NULL' : '= ?'}`);
      if (value !== null) parameters.push(this.encodeValue(definition, value));
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.database.prepare(
      `SELECT * FROM ${quoteIdentifier(entityName)}${where} ORDER BY rowid LIMIT ?`
    ).all(...parameters, limit);
    return rows.map((row) => this.decodeRow(entityName, row));
  }

  findOne(entityName, filters) {
    return this.list(entityName, filters, 1)[0] || null;
  }

  get(entityName, id) {
    const schema = this.getSchema(entityName);
    if (!schema.fields.id) throw new Error(`${entityName} does not have a single id column`);
    const row = this.database.prepare(
      `SELECT * FROM ${quoteIdentifier(entityName)} WHERE id = ?`
    ).get(id);
    return this.decodeRow(entityName, row);
  }

  create(entityName, values) {
    const schema = this.getSchema(entityName);
    const record = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
    if (schema.fields.id && record.id === undefined) record.id = crypto.randomUUID();
    for (const field of Object.keys(record)) {
      if (!schema.fields[field]) throw new Error(`Unknown field '${field}'`);
    }
    const fields = Object.keys(record);
    const sql = fields.length
      ? `INSERT INTO ${quoteIdentifier(entityName)} (${fields.map(quoteIdentifier).join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) RETURNING *`
      : `INSERT INTO ${quoteIdentifier(entityName)} DEFAULT VALUES RETURNING *`;
    const parameters = fields.map((field) => this.encodeValue(schema.fields[field], record[field]));
    const row = this.database.prepare(sql).get(...parameters);
    return this.decodeRow(entityName, row);
  }

  update(entityName, id, values) {
    const schema = this.getSchema(entityName);
    if (!schema.fields.id) throw new Error(`${entityName} does not have a single id column`);
    const record = { ...values };
    for (const field of Object.keys(record)) {
      if (!schema.fields[field]) throw new Error(`Unknown field '${field}'`);
    }
    if (schema.fields.updated_at && record.updated_at === undefined) record.updated_at = new Date().toISOString();
    const fields = Object.keys(record);
    if (!fields.length) throw new Error('values must contain at least one field');
    const parameters = fields.map((field) => this.encodeValue(schema.fields[field], record[field]));
    const result = this.database.prepare(
      `UPDATE ${quoteIdentifier(entityName)} SET ${fields.map((field) => `${quoteIdentifier(field)} = ?`).join(', ')} WHERE id = ?`
    ).run(...parameters, id);
    if (!result.changes) return null;
    return this.get(entityName, id);
  }

  delete(entityName, id) {
    const record = this.get(entityName, id);
    if (!record) return null;
    this.database.prepare(`DELETE FROM ${quoteIdentifier(entityName)} WHERE id = ?`).run(id);
    return record;
  }

  transaction(operation) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  importLegacy(data) {
    const aliases = { projects: { key: 'project_key' } };
    let imported = 0;
    return this.transaction(() => {
      for (const [entityName, records] of Object.entries(data)) {
        if (!this.schemas[entityName] || !Array.isArray(records)) continue;
        for (const source of records) {
          const record = { ...source };
          for (const [oldField, newField] of Object.entries(aliases[entityName] || {})) {
            if (record[oldField] !== undefined && record[newField] === undefined) record[newField] = record[oldField];
            delete record[oldField];
          }
          if (record.updated_at === undefined && this.schemas[entityName].fields.updated_at) {
            record.updated_at = record.created_at || new Date().toISOString();
          }
          if (!record.id || !this.get(entityName, record.id)) {
            this.create(entityName, record);
            imported += 1;
          }
        }
      }
      return imported;
    });
  }
}

module.exports = { DEFAULT_SCHEMA_PATH, SqliteStore, sqliteSchema };
