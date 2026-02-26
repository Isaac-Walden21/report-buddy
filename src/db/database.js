// src/db/database.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/report-buddy.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migration: Add firebase_uid column if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const hasFirebaseUid = columns.some(col => col.name === 'firebase_uid');

  if (!hasFirebaseUid) {
    // Note: Can't add UNIQUE constraint to existing table, will enforce in application
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');
    console.log('Migration: Added firebase_uid column to users table');
  }

  // Migration: Make password_hash nullable for Firebase auth users
  // SQLite can't ALTER COLUMN, so we must recreate the table
  const passwordCol = columns.find(col => col.name === 'password_hash');
  if (passwordCol && passwordCol.notnull === 1) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firebase_uid TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT NOT NULL,
        jurisdiction_state TEXT,
        jurisdiction_county TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_new SELECT id, firebase_uid, email, password_hash, name,
        jurisdiction_state, jurisdiction_county, created_at, updated_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
    `);
    db.pragma('foreign_keys = ON');
    console.log('Migration: Made password_hash nullable for Firebase auth');
  }
} catch (err) {
  console.error('Migration error:', err);
}

module.exports = db;
