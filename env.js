const fs = require('node:fs');
const path = require('node:path');

function parseValue(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n');
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, '').trim();
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: parseValue(match[2]),
  };
}

function loadEnvFile({ envFile = path.join(__dirname, '.env'), env = process.env } = {}) {
  if (!fs.existsSync(envFile)) {
    return false;
  }

  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed && env[parsed.key] === undefined) {
      env[parsed.key] = parsed.value;
    }
  }

  return true;
}

module.exports = {
  loadEnvFile,
};
