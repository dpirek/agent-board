'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { entityNames } = require('./schema');

function emptyData() {
  return Object.fromEntries(entityNames.map((name) => [name, []]));
}

class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const data = emptyData();
      for (const name of entityNames) {
        if (!Array.isArray(parsed[name])) {
          throw new Error(`Data file property '${name}' must be an array`);
        }
        data[name] = parsed[name];
      }
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return emptyData();
      if (error instanceof SyntaxError) {
        throw new Error(`Data file is not valid JSON: ${this.filePath}`);
      }
      throw error;
    }
  }

  async mutate(mutator) {
    const operation = this.writeQueue.then(async () => {
      const data = await this.read();
      const result = await mutator(data);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, this.filePath);
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }
}

module.exports = { JsonStore, emptyData };

