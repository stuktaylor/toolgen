const path = require('node:path');

const express = require('express');
const session = require('express-session');

const { createDb } = require('./db');
const { generateTool } = require('./codegen');

function sanitizeUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function truncatePrompt(prompt, maxLength = 120) {
  return prompt.length <= maxLength ? prompt : `${prompt.slice(0, maxLength - 1)}…`;
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function readSessionUser(req, store) {
  return req.session.userId ? store.getUserById(req.session.userId) : null;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return sendError(res, 401, 'You need to log in first.');
  }
  next();
}

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendError(res, 500, error.message || 'Something went wrong.');
    }
  };
}

function findOrCreateUser(store, email, password) {
  const existing = store.getUserByEmail(email);
  if (!existing) {
    return store.createUser({ email, password });
  }
  return store.authenticateUser({ email, password });
}

function mapToolSummary(tool) {
  return {
    id: tool.id,
    ownerId: tool.ownerId,
    name: tool.name,
    prompt: truncatePrompt(tool.prompt),
    isOwned: tool.isOwned,
    isShared: tool.isShared,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}

function createApp({
  store = createDb(),
  generateTool: runTool = generateTool,
  sessionSecret = process.env.SESSION_SECRET || 'toolsgen-dev-secret',
  publicDir = __dirname,
} = {}) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax' },
    })
  );

  app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

  app.get('/api/session', (req, res) => {
    const user = readSessionUser(req, store);
    return user ? res.json({ user: sanitizeUser(user) }) : sendError(res, 401, 'No active session.');
  });

  app.post('/api/session/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = email && password ? findOrCreateUser(store, email, password) : null;
    if (!user) {
      return sendError(res, 401, 'Incorrect email or password.');
    }
    req.session.userId = user.id;
    return res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/session/logout', requireAuth, (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/tools', requireAuth, (req, res) => {
    const tools = store.listVisibleTools(req.session.userId).map(mapToolSummary);
    res.json({ tools });
  });

  app.get('/api/tools/:id', requireAuth, (req, res) => {
    const tool = store.getVisibleTool(Number(req.params.id), req.session.userId);
    return tool ? res.json({ tool }) : sendError(res, 404, 'Tool not found.');
  });

  app.post(
    '/api/tools/generate',
    requireAuth,
    wrap(async (req, res) => {
      const { prompt } = req.body || {};
      if (!prompt || !prompt.trim()) {
        return sendError(res, 400, 'Please enter a prompt before generating.');
      }
      const result = await runTool({ prompt, workingDirectory: process.cwd() });
      store.logUsage({ userId: req.session.userId, action: 'generate', details: prompt.trim() });
      res.json(result);
    })
  );

  app.post(
    '/api/tools/publish',
    requireAuth,
    wrap(async (req, res) => {
      const body = req.body || {};
      const payload = {
        toolId: body.toolId ? Number(body.toolId) : undefined,
        ownerId: req.session.userId,
        name: (body.name || 'Untitled Tool').trim(),
        prompt: (body.prompt || '').trim(),
        html: (body.html || '').trim(),
        isShared: Boolean(body.isShared),
      };
      let tool;
      try {
        tool = store.saveTool(payload);
      } catch (error) {
        if (error.message.includes('only the tool owner')) {
          return sendError(res, 403, error.message);
        }
        throw error;
      }
      store.createToolVersion({ toolId: tool.id, name: tool.name, prompt: tool.prompt, html: tool.html });
      store.logUsage({ userId: req.session.userId, toolId: tool.id, action: 'publish', details: tool.name });
      res.json({ tool });
    })
  );

  app.delete('/api/tools/:id', requireAuth, (req, res) => {
    const toolId = Number(req.params.id);
    if (!Number.isInteger(toolId) || toolId < 1) {
      return sendError(res, 400, 'Tool not found.');
    }
    try {
      const tool = store.deleteTool({ toolId, ownerId: req.session.userId });
      store.logUsage({ userId: req.session.userId, action: 'delete', details: tool.name });
      res.json({ ok: true });
    } catch (error) {
      if (error.message === 'Tool not found.') {
        return sendError(res, 404, error.message);
      }
      if (error.message.includes('only the tool owner')) {
        return sendError(res, 403, error.message);
      }
      return sendError(res, 500, error.message || 'Something went wrong.');
    }
  });

  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/app.js', (req, res) => res.sendFile(path.join(publicDir, 'app.js')));

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Toolsgen listening on http://localhost:${port}`);
  });
}

module.exports = {
  createApp,
};
