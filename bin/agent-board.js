#!/usr/bin/env node

'use strict';

const { runCli } = require('../lib/cli');

runCli(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});

