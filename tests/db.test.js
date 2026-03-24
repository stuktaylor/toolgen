const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDb } = require('../db');

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolsgen-db-'));
  const filename = path.join(dir, 'test.db');
  const store = createDb({ filename });

  return {
    ...store,
    cleanup() {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('createDb initializes the expected tables', () => {
  const store = makeDb();
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);

  assert.deepEqual(
    tables.sort(),
    ['tool_versions', 'tools', 'usage_log', 'users'].sort()
  );

  store.cleanup();
});

test('createUser stores a salted password hash and returns the created user', () => {
  const store = makeDb();
  const user = store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const row = store.db
    .prepare(
      'SELECT email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE id = ?'
    )
    .get(user.id);

  assert.equal(row.email, 'owner@example.com');
  assert.notEqual(row.passwordHash, 'hunter2');
  assert.ok(row.passwordHash.length > 10);
  assert.ok(row.passwordSalt.length > 10);

  store.cleanup();
});

test('authenticateUser returns the user for a correct password and null otherwise', () => {
  const store = makeDb();

  store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });

  const authed = store.authenticateUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const rejected = store.authenticateUser({
    email: 'owner@example.com',
    password: 'wrong-password',
  });

  assert.equal(authed.email, 'owner@example.com');
  assert.equal(rejected, null);

  store.cleanup();
});

test('saveTool creates owned tools, lists shared visibility, and enforces owner-only updates', () => {
  const store = makeDb();
  const owner = store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const viewer = store.createUser({
    email: 'viewer@example.com',
    password: 'hunter3',
  });
  const privateTool = store.saveTool({
    ownerId: owner.id,
    name: 'Private Tool',
    prompt: 'make me a private tool',
    html: '<html><body>Private</body></html>',
    isShared: false,
  });
  const sharedTool = store.saveTool({
    ownerId: owner.id,
    name: 'Shared Tool',
    prompt: 'make me a shared tool',
    html: '<html><body>Shared</body></html>',
    isShared: true,
  });
  const ownerVisible = store.listVisibleTools(owner.id);
  const viewerVisible = store.listVisibleTools(viewer.id);

  assert.equal(ownerVisible.length, 2);
  assert.equal(viewerVisible.length, 1);
  assert.equal(viewerVisible[0].id, sharedTool.id);
  assert.equal(viewerVisible[0].isOwned, false);

  assert.throws(
    () =>
      store.saveTool({
        toolId: privateTool.id,
        ownerId: viewer.id,
        name: 'Hacked Tool',
        prompt: 'steal it',
        html: '<html></html>',
        isShared: false,
      }),
    /only the tool owner can update it/
  );

  const updated = store.saveTool({
    toolId: privateTool.id,
    ownerId: owner.id,
    name: 'Private Tool v2',
    prompt: 'update my private tool',
    html: '<html><body>Updated</body></html>',
    isShared: false,
  });

  assert.equal(updated.name, 'Private Tool v2');

  store.cleanup();
});

test('tool versions and usage events are recorded', () => {
  const store = makeDb();
  const owner = store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const tool = store.saveTool({
    ownerId: owner.id,
    name: 'Tool One',
    prompt: 'initial prompt',
    html: '<html><body>v1</body></html>',
    isShared: false,
  });

  store.createToolVersion({
    toolId: tool.id,
    name: tool.name,
    prompt: tool.prompt,
    html: tool.html,
  });
  store.logUsage({
    userId: owner.id,
    toolId: tool.id,
    action: 'generate',
    details: 'Generated a first draft',
  });

  const version = store.db
    .prepare('SELECT tool_id AS toolId, name, prompt FROM tool_versions WHERE tool_id = ?')
    .get(tool.id);
  const usage = store.db
    .prepare(
      'SELECT user_id AS userId, tool_id AS toolId, action, details FROM usage_log WHERE tool_id = ?'
    )
    .get(tool.id);

  assert.equal(version.toolId, tool.id);
  assert.equal(version.name, 'Tool One');
  assert.equal(usage.userId, owner.id);
  assert.equal(usage.action, 'generate');

  store.cleanup();
});
