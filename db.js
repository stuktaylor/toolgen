const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function now() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function readUserByEmail(db, email) {
  return db
    .prepare(
      `SELECT id, email, password_hash AS passwordHash,
       password_salt AS passwordSalt, created_at AS createdAt
       FROM users WHERE email = ?`
    )
    .get(email);
}

function readUserById(db, id) {
  return db
    .prepare(
      `SELECT id, email, password_hash AS passwordHash,
       password_salt AS passwordSalt, created_at AS createdAt
       FROM users WHERE id = ?`
    )
    .get(id);
}

function readToolById(db, toolId) {
  return db
    .prepare(
      `SELECT id, owner_id AS ownerId, name, prompt, html,
       is_shared AS isShared, created_at AS createdAt,
       updated_at AS updatedAt FROM tools WHERE id = ?`
    )
    .get(toolId);
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      is_shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tool_versions (
      id INTEGER PRIMARY KEY,
      tool_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tool_id) REFERENCES tools(id)
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      tool_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(tool_id) REFERENCES tools(id)
    );
  `);
}

function createUserMethod(db) {
  return ({ email, password }) => {
    const { hash, salt } = hashPassword(password);
    const createdAt = now();
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, password_salt, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(email, hash, salt, createdAt);
    return readUserById(db, result.lastInsertRowid);
  };
}

function authenticateUserMethod(db) {
  return ({ email, password }) => {
    const user = readUserByEmail(db, email);
    if (!user) {
      return null;
    }
    const { hash } = hashPassword(password, user.passwordSalt);
    return hash === user.passwordHash ? user : null;
  };
}

function listVisibleToolsMethod(db) {
  return (userId) =>
    db
      .prepare(
        `SELECT id, owner_id AS ownerId, name, prompt, html,
         is_shared AS isShared, created_at AS createdAt,
         updated_at AS updatedAt, owner_id = ? AS isOwned
         FROM tools
         WHERE owner_id = ? OR is_shared = 1
         ORDER BY datetime(updated_at) DESC, id DESC`
      )
      .all(userId, userId)
      .map((row) => ({ ...row, isShared: Boolean(row.isShared), isOwned: Boolean(row.isOwned) }));
}

function getVisibleToolMethod(db) {
  return (toolId, userId) => {
    const tool = db
      .prepare(
        `SELECT id, owner_id AS ownerId, name, prompt, html,
         is_shared AS isShared, created_at AS createdAt,
         updated_at AS updatedAt, owner_id = ? AS isOwned
         FROM tools
         WHERE id = ? AND (owner_id = ? OR is_shared = 1)`
      )
      .get(userId, toolId, userId);
    return tool
      ? { ...tool, isShared: Boolean(tool.isShared), isOwned: Boolean(tool.isOwned) }
      : null;
  };
}

function insertTool(db, input) {
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO tools
       (owner_id, name, prompt, html, is_shared, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.ownerId, input.name, input.prompt, input.html, Number(input.isShared), timestamp, timestamp);
  return readToolById(db, result.lastInsertRowid);
}

function updateTool(db, input) {
  const existing = readToolById(db, input.toolId);
  if (!existing || existing.ownerId !== input.ownerId) {
    throw new Error('only the tool owner can update it');
  }
  db.prepare(
    `UPDATE tools
     SET name = ?, prompt = ?, html = ?, is_shared = ?, updated_at = ?
     WHERE id = ?`
  ).run(input.name, input.prompt, input.html, Number(input.isShared), now(), input.toolId);
  return readToolById(db, input.toolId);
}

function saveToolMethod(db) {
  return (input) => (input.toolId ? updateTool(db, input) : insertTool(db, input));
}

function createToolVersionMethod(db) {
  return ({ toolId, name, prompt, html }) => {
    const createdAt = now();
    return db
      .prepare(
        `INSERT INTO tool_versions (tool_id, name, prompt, html, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(toolId, name, prompt, html, createdAt);
  };
}

function logUsageMethod(db) {
  return ({ userId = null, toolId = null, action, details = null }) => {
    const createdAt = now();
    return db
      .prepare(
        `INSERT INTO usage_log (user_id, tool_id, action, details, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(userId, toolId, action, details, createdAt);
  };
}

function createDb({ filename = 'toolsgen.db' } = {}) {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  initSchema(db);

  return {
    db,
    createUser: createUserMethod(db),
    authenticateUser: authenticateUserMethod(db),
    getUserByEmail: (email) => readUserByEmail(db, email),
    getUserById: (id) => readUserById(db, id),
    listVisibleTools: listVisibleToolsMethod(db),
    getVisibleTool: getVisibleToolMethod(db),
    saveTool: saveToolMethod(db),
    createToolVersion: createToolVersionMethod(db),
    logUsage: logUsageMethod(db),
    close: () => db.close(),
  };
}

module.exports = {
  createDb,
};
