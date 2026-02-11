// src/db/database.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use /tmp for Cloud Functions (ephemeral storage)
const dbPath = process.env.FUNCTIONS_EMULATOR
  ? path.join(__dirname, '../../data/report-buddy.db')
  : '/tmp/report-buddy.db';
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

  // Make password_hash optional for existing tables
  const hasPasswordHash = columns.some(col => col.name === 'password_hash');
  if (hasPasswordHash) {
    // SQLite doesn't support altering column constraints, but new inserts can have NULL
    console.log('Migration: password_hash column exists, Firebase users will have NULL password');
  }
} catch (err) {
  console.error('Migration error:', err);
}

module.exports = db;
