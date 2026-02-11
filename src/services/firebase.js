// src/services/firebase.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// In production, this will use Application Default Credentials when deployed to Firebase
// For local development, you can use a service account key file
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Use service account from environment variable (JSON string)
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Use service account file path
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } else {
    // For Firebase Cloud Functions, use default credentials
    admin.initializeApp();
  }
}

module.exports = admin;
