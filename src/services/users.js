// src/services/users.js
const db = require('../db/database');

/**
 * Get or create a local user from a decoded Firebase token.
 * Uses INSERT OR IGNORE to avoid UNIQUE constraint violations
 * when two requests arrive simultaneously for the same new user.
 *
 * @param {object} decodedToken - Decoded Firebase ID token
 * @returns {object|null} User object { id, firebase_uid, email, name }, or null if email is missing
 */
function getOrCreateUser(decodedToken) {
  const { uid, email, name } = decodedToken;

  // Check if user already exists
  let user = db.prepare(
    'SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = ?'
  ).get(uid);

  if (user) {
    return user;
  }

  // Email is required for new user creation
  if (!email) {
    return null;
  }

  const displayName = name || email.split('@')[0];

  // INSERT OR IGNORE silently skips if firebase_uid already exists (race condition)
  const result = db.prepare(
    'INSERT OR IGNORE INTO users (firebase_uid, email, name) VALUES (?, ?, ?)'
  ).run(uid, email, displayName);

  // Always re-SELECT to get the user (whether we just inserted or another request did)
  user = db.prepare(
    'SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = ?'
  ).get(uid);

  // Only create style profiles if we actually inserted a new row
  if (result.changes > 0) {
    const reportTypes = ['incident', 'arrest', 'supplemental'];
    const insertProfile = db.prepare(
      'INSERT INTO style_profiles (user_id, report_type) VALUES (?, ?)'
    );
    for (const type of reportTypes) {
      insertProfile.run(user.id, type);
    }
  }

  return user;
}

module.exports = { getOrCreateUser };
