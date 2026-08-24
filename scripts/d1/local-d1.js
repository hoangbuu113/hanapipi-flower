export class LocalD1Statement {
  constructor(database, sql, parameters = []) {
    this.database = database
    this.sql = sql
    this.parameters = parameters
  }

  bind(...parameters) {
    return new LocalD1Statement(this.database, this.sql, parameters)
  }

  execute() {
    const statement = this.database.prepare(this.sql)
    return statement.run(...this.parameters)
  }

  async run() {
    const result = this.execute()
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      success: true,
    }
  }

  async first(columnName) {
    const row = this.database.prepare(this.sql).get(...this.parameters) ?? null
    if (row == null || columnName == null) return row
    return row[columnName] ?? null
  }

  async all() {
    return {
      results: this.database.prepare(this.sql).all(...this.parameters),
      success: true,
    }
  }
}

export class LocalD1Database {
  constructor(database) {
    this.database = database
  }

  prepare(sql) {
    if (typeof sql !== 'string' || sql.trim().length === 0) {
      throw new TypeError('SQL must be a non-empty string.')
    }
    return new LocalD1Statement(this.database, sql)
  }

  async batch(statements) {
    if (!Array.isArray(statements) || statements.some((statement) => !(statement instanceof LocalD1Statement))) {
      throw new TypeError('batch requires LocalD1Statement entries.')
    }

    this.database.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => {
        const result = statement.execute()
        return {
          meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid),
          },
          success: true,
        }
      })
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

