const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const request = require('supertest');

const { createDb } = require('../db');
const { createApp } = require('../server');

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolsgen-server-'));
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

function makeApp(overrides = {}) {
  const store = overrides.store || makeStore();
  const generated = [];
  const app = createApp({
    store,
    sessionSecret: 'test-secret',
    generateTool: async ({ prompt }) => {
      generated.push(prompt);
      return {
        name: 'Generated Tool',
        html: '<!DOCTYPE html><html><head><title>Generated Tool</title></head><body>OK</body></html>',
      };
    },
    publicDir: path.join(__dirname, 'fixtures'),
  });

  return {
    app,
    store,
    generated,
    cleanup() {
      store.cleanup();
    },
  };
}

test('login auto-creates a user, returns the session user, and allows logout', async () => {
  const harness = makeApp();
  const agent = request.agent(harness.app);

  const login = await agent.post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const session = await agent.get('/api/session');
  const logout = await agent.post('/api/session/logout');
  const afterLogout = await agent.get('/api/session');

  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, 'owner@example.com');
  assert.equal(session.body.user.email, 'owner@example.com');
  assert.equal(logout.status, 200);
  assert.equal(afterLogout.status, 401);

  harness.cleanup();
});

test('login rejects an incorrect password for an existing user', async () => {
  const harness = makeApp();
  harness.store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });

  const response = await request(harness.app).post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'wrong-password',
  });

  assert.equal(response.status, 401);
  assert.match(response.body.error, /incorrect email or password/i);

  harness.cleanup();
});

test('authenticated users can generate tools and unauthenticated users cannot', async () => {
  const harness = makeApp();
  const agent = request.agent(harness.app);

  const rejected = await request(harness.app).post('/api/tools/generate').send({
    prompt: 'Build a staffing planner',
  });

  await agent.post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'hunter2',
  });

  const generated = await agent.post('/api/tools/generate').send({
    prompt: 'Build a staffing planner',
  });

  assert.equal(rejected.status, 401);
  assert.equal(generated.status, 200);
  assert.equal(generated.body.name, 'Generated Tool');
  assert.equal(harness.generated[0], 'Build a staffing planner');

  harness.cleanup();
});

test('library returns owned and shared tools, and tool details respect visibility', async () => {
  const harness = makeApp();
  const owner = harness.store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const viewer = harness.store.createUser({
    email: 'viewer@example.com',
    password: 'hunter3',
  });
  const privateTool = harness.store.saveTool({
    ownerId: owner.id,
    name: 'Private Tool',
    prompt: 'a very long prompt about a private tool',
    html: '<!DOCTYPE html><html><body>Private</body></html>',
    isShared: false,
  });
  const sharedTool = harness.store.saveTool({
    ownerId: owner.id,
    name: 'Shared Tool',
    prompt: 'a very long prompt about a shared tool',
    html: '<!DOCTYPE html><html><body>Shared</body></html>',
    isShared: true,
  });
  const agent = request.agent(harness.app);

  await agent.post('/api/session/login').send({
    email: 'viewer@example.com',
    password: 'hunter3',
  });

  const list = await agent.get('/api/tools');
  const sharedDetail = await agent.get(`/api/tools/${sharedTool.id}`);
  const privateDetail = await agent.get(`/api/tools/${privateTool.id}`);

  assert.equal(list.status, 200);
  assert.equal(list.body.tools.length, 1);
  assert.equal(list.body.tools[0].id, sharedTool.id);
  assert.equal(list.body.tools[0].isOwned, false);
  assert.ok(list.body.tools[0].prompt.length <= 120);
  assert.equal(sharedDetail.status, 200);
  assert.equal(privateDetail.status, 404);
  assert.equal(sharedDetail.body.tool.ownerId, owner.id);
  assert.equal(viewer.id > 0, true);

  harness.cleanup();
});

test('publish creates tools, records versions, and shared tools become visible to other users', async () => {
  const harness = makeApp();
  const ownerAgent = request.agent(harness.app);
  const viewerAgent = request.agent(harness.app);

  await ownerAgent.post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  await viewerAgent.post('/api/session/login').send({
    email: 'viewer@example.com',
    password: 'hunter3',
  });

  const publish = await ownerAgent.post('/api/tools/publish').send({
    name: 'Team Directory',
    prompt: 'Build a team directory',
    html: '<!DOCTYPE html><html><head><title>Team Directory</title></head><body>OK</body></html>',
    isShared: true,
  });
  const viewerLibrary = await viewerAgent.get('/api/tools');
  const versions = harness.store.db
    .prepare('SELECT COUNT(*) AS total FROM tool_versions WHERE tool_id = ?')
    .get(publish.body.tool.id);

  assert.equal(publish.status, 200);
  assert.equal(viewerLibrary.body.tools.length, 1);
  assert.equal(viewerLibrary.body.tools[0].name, 'Team Directory');
  assert.equal(versions.total, 1);

  harness.cleanup();
});

test('publish updates only owner-owned tools', async () => {
  const harness = makeApp();
  const owner = harness.store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  const intruder = harness.store.createUser({
    email: 'intruder@example.com',
    password: 'hunter3',
  });
  const tool = harness.store.saveTool({
    ownerId: owner.id,
    name: 'Editable Tool',
    prompt: 'Build an editable tool',
    html: '<!DOCTYPE html><html><body>v1</body></html>',
    isShared: false,
  });
  const agent = request.agent(harness.app);

  await agent.post('/api/session/login').send({
    email: intruder.email,
    password: 'hunter3',
  });

  const response = await agent.post('/api/tools/publish').send({
    toolId: tool.id,
    name: 'Stolen Tool',
    prompt: 'steal it',
    html: '<!DOCTYPE html><html><body>v2</body></html>',
    isShared: false,
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /only the tool owner/i);

  harness.cleanup();
});

test('tool owners can delete a shared tool and it disappears from every user library', async () => {
  const harness = makeApp();
  const owner = harness.store.createUser({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  harness.store.createUser({
    email: 'viewer@example.com',
    password: 'hunter3',
  });
  const tool = harness.store.saveTool({
    ownerId: owner.id,
    name: 'Shared Tool',
    prompt: 'Build a shared tool',
    html: '<!DOCTYPE html><html><body>Shared</body></html>',
    isShared: true,
  });
  const ownerAgent = request.agent(harness.app);
  const viewerAgent = request.agent(harness.app);

  await ownerAgent.post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'hunter2',
  });
  await viewerAgent.post('/api/session/login').send({
    email: 'viewer@example.com',
    password: 'hunter3',
  });

  const beforeDelete = await viewerAgent.get('/api/tools');
  const deleted = await ownerAgent.delete(`/api/tools/${tool.id}`);
  const afterDelete = await viewerAgent.get('/api/tools');
  const detail = await viewerAgent.get(`/api/tools/${tool.id}`);

  assert.equal(beforeDelete.status, 200);
  assert.equal(beforeDelete.body.tools.length, 1);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);
  assert.equal(afterDelete.status, 200);
  assert.equal(afterDelete.body.tools.length, 0);
  assert.equal(detail.status, 404);

  harness.cleanup();
});

test('deleting an unknown tool returns a plain-language 404', async () => {
  const harness = makeApp();
  const agent = request.agent(harness.app);

  await agent.post('/api/session/login').send({
    email: 'owner@example.com',
    password: 'hunter2',
  });

  const response = await agent.delete('/api/tools/999999');

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'Tool not found.');

  harness.cleanup();
});
