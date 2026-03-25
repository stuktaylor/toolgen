const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadEnvFile } = require('../env');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'toolsgen-env-'));
}

test('loadEnvFile reads key-value pairs from a root .env file', () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, '.env');

  fs.writeFileSync(envFile, 'PORT=4123\nSESSION_SECRET=from-dotenv\n');

  const env = {};
  loadEnvFile({ envFile, env });

  assert.equal(env.PORT, '4123');
  assert.equal(env.SESSION_SECRET, 'from-dotenv');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadEnvFile does not overwrite environment variables that are already set', () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, '.env');

  fs.writeFileSync(envFile, 'PORT=4123\nSESSION_SECRET=from-dotenv\n');

  const env = { PORT: '3000', SESSION_SECRET: 'already-set' };
  loadEnvFile({ envFile, env });

  assert.equal(env.PORT, '3000');
  assert.equal(env.SESSION_SECRET, 'already-set');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadEnvFile ignores a missing .env file', () => {
  const env = {};

  assert.doesNotThrow(() => {
    loadEnvFile({ envFile: '/tmp/toolsgen-missing.env', env });
  });
  assert.deepEqual(env, {});
});
