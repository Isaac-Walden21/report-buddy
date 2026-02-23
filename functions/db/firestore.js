const admin = require('../services/firebase');

const db = admin.firestore();

// --- Default Case Law ---
const DEFAULT_CASE_LAW = [
  {
    case_name: 'Terry v. Ohio (1968)',
    filename: 'Terry v. Ohio',
    content: `Terry v. Ohio, 392 U.S. 1 (1968)

Key Holding: Officers may conduct a brief investigative stop (Terry stop) when they have reasonable suspicion that criminal activity is afoot. During such a stop, if the officer has reasonable belief the person is armed and dangerous, they may conduct a limited pat-down (frisk) of the outer clothing for weapons.

Significance for Report Writing:
- Document specific, articulable facts that created reasonable suspicion
- Describe the totality of circumstances leading to the stop
- If a frisk was conducted, articulate why you believed the person was armed and dangerous
- Note the scope of the frisk was limited to a pat-down of outer clothing for weapons`
  },
  {
    case_name: 'Graham v. Connor (1989)',
    filename: 'Graham v. Connor',
    content: `Graham v. Connor, 490 U.S. 386 (1989)

Key Holding: All claims of excessive force by law enforcement during arrest, investigative stop, or other seizure are analyzed under the Fourth Amendment's "objective reasonableness" standard. The reasonableness of force must be judged from the perspective of a reasonable officer on the scene, not with 20/20 hindsight.

Graham Factors:
1. The severity of the crime at issue
2. Whether the suspect poses an immediate threat to officers or others
3. Whether the suspect is actively resisting arrest or attempting to flee

Significance for Report Writing:
- Document the Graham factors in any use of force incident
- Describe the threat as perceived at the time, not after the fact
- Detail the suspect's actions that necessitated force
- Explain why the level of force used was proportional to the threat`
  },
  {
    case_name: 'Tennessee v. Garner (1985)',
    filename: 'Tennessee v. Garner',
    content: `Tennessee v. Garner, 471 U.S. 1 (1985)

Key Holding: Deadly force may not be used to prevent the escape of a fleeing felon unless the officer has probable cause to believe the suspect poses a significant threat of death or serious physical injury to the officer or others.

Requirements for Deadly Force Against Fleeing Suspect:
1. Probable cause that the suspect committed a crime involving infliction or threatened infliction of serious physical harm
2. Deadly force is necessary to prevent escape
3. The officer has given warning, if feasible

Significance for Report Writing:
- Document the specific threat the fleeing suspect posed
- Articulate why you believed the suspect would cause death or serious injury if not apprehended
- Note whether a warning was given before using deadly force
- Describe why lesser means of apprehension were not feasible`
  },
  {
    case_name: 'Mapp v. Ohio (1961)',
    filename: 'Mapp v. Ohio',
    content: `Mapp v. Ohio, 367 U.S. 643 (1961)

Key Holding: Evidence obtained through an unreasonable search and seizure in violation of the Fourth Amendment is inadmissible in state court proceedings (Exclusionary Rule applied to states).

Significance for Report Writing:
- Document the legal basis for every search conducted
- Clearly articulate consent, warrant authority, or applicable exception
- Search warrant exceptions to document: consent, search incident to arrest, plain view, exigent circumstances, automobile exception, inventory search
- If consent was given, document it was voluntary and who gave consent
- Note the scope of the search and how it related to the legal authority`
  },
  {
    case_name: 'Miranda v. Arizona (1966)',
    filename: 'Miranda v. Arizona',
    content: `Miranda v. Arizona, 384 U.S. 436 (1966)

Key Holding: Before custodial interrogation, suspects must be informed of their rights: the right to remain silent, that statements may be used against them, the right to an attorney, and that an attorney will be appointed if they cannot afford one.

When Miranda Applies:
1. The suspect is in custody (deprived of freedom in a significant way)
2. The suspect is being interrogated (express questioning or functional equivalent)

Significance for Report Writing:
- Document when Miranda warnings were given and the suspect's response
- Note whether the suspect invoked or waived their rights
- If rights were waived, document that the waiver was knowing, intelligent, and voluntary
- If the suspect invoked their right to silence or counsel, document that questioning ceased
- Spontaneous statements do not require Miranda warnings - document them as such`
  },
  {
    case_name: 'Carroll v. United States (1925)',
    filename: 'Carroll v. United States',
    content: `Carroll v. United States, 267 U.S. 132 (1925)

Key Holding: Officers may conduct a warrantless search of a vehicle if they have probable cause to believe it contains contraband or evidence of a crime (Automobile Exception).

Rationale: Vehicles are mobile and have a reduced expectation of privacy compared to homes.

Significance for Report Writing:
- Document the specific facts establishing probable cause to search the vehicle
- Describe what indicators led you to believe evidence or contraband was in the vehicle
- Note the scope of the search and areas searched
- Document what was found and where within the vehicle
- If the search extended to containers within the vehicle, articulate probable cause for each`
  }
];

// --- User Operations ---

async function getUser(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return { id: uid, ...doc.data() };
}

async function createUser(uid, email, name) {
  const now = new Date().toISOString();
  const userData = {
    email,
    name,
    jurisdiction_state: null,
    jurisdiction_county: null,
    caselaw_initialized: false,
    stripe_customer_id: null,
    subscription_status: 'trialing',
    subscription_id: null,
    subscription_current_period_end: null,
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
    updated_at: now
  };
  await db.collection('users').doc(uid).set(userData);

  // Create default style profiles
  const reportTypes = ['incident', 'arrest', 'supplemental'];
  const batch = db.batch();
  for (const type of reportTypes) {
    const ref = db.collection('users').doc(uid).collection('style_profiles').doc(type);
    batch.set(ref, {
      voice: 'first_person',
      detail_level: 'medium',
      common_phrases: [],
      vocabulary_preferences: {},
      created_at: now,
      updated_at: now
    });
  }
  await batch.commit();

  // Seed default case law
  await seedDefaultCaseLaw(uid);

  return { id: uid, ...userData };
}

async function updateUser(uid, updates) {
  const ALLOWED_FIELDS = ['name', 'jurisdiction_state', 'jurisdiction_county'];
  const sanitized = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  await db.collection('users').doc(uid).update(sanitized);
  return getUser(uid);
}

// --- Default Case Law Seeding ---

async function seedDefaultCaseLaw(uid) {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();
  if (userDoc.exists && userDoc.data().caselaw_initialized) return;

  // Copy from global_caselaw into user's policy_documents
  const globalSnap = await db.collection('global_caselaw').get();
  if (globalSnap.empty) return;

  const batch = db.batch();
  const now = new Date().toISOString();
  for (const doc of globalSnap.docs) {
    const data = doc.data();
    const ref = userRef.collection('policy_documents').doc();
    batch.set(ref, {
      filename: data.filename,
      content: data.content,
      is_caselaw: true,
      created_at: now
    });
  }
  batch.update(userRef, { caselaw_initialized: true });
  await batch.commit();
}

// --- Style Profile Operations ---

async function getStyleProfile(uid, reportType) {
  const doc = await db.collection('users').doc(uid)
    .collection('style_profiles').doc(reportType).get();
  if (!doc.exists) return null;
  return { id: doc.id, report_type: doc.id, ...doc.data() };
}

async function getAllStyleProfiles(uid) {
  const snap = await db.collection('users').doc(uid)
    .collection('style_profiles').get();
  return snap.docs.map(d => ({ id: d.id, report_type: d.id, ...d.data() }));
}

async function updateStyleProfile(uid, reportType, updates) {
  const ALLOWED_FIELDS = ['voice', 'detail_level', 'common_phrases', 'vocabulary_preferences'];
  const sanitized = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  const ref = db.collection('users').doc(uid)
    .collection('style_profiles').doc(reportType);
  await ref.update(sanitized);
  const doc = await ref.get();
  return { id: doc.id, report_type: doc.id, ...doc.data() };
}

// --- Example Report Operations ---

async function getExampleReports(uid, reportType) {
  let query = db.collection('users').doc(uid).collection('example_reports');
  if (reportType) {
    query = query.where('report_type', '==', reportType);
  }
  const snap = await query.get();
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      report_type: data.report_type,
      created_at: data.created_at,
      preview: data.content ? data.content.substring(0, 200) : '',
      content: data.content
    };
  });
}

async function countExampleReports(uid, reportType) {
  const snap = await db.collection('users').doc(uid)
    .collection('example_reports')
    .where('report_type', '==', reportType).get();
  return snap.size;
}

async function addExampleReport(uid, reportType, content) {
  const now = new Date().toISOString();
  const ref = await db.collection('users').doc(uid)
    .collection('example_reports').add({
      report_type: reportType,
      content,
      created_at: now
    });
  return { id: ref.id, report_type: reportType, created_at: now };
}

async function deleteExampleReport(uid, exampleId) {
  const ref = db.collection('users').doc(uid)
    .collection('example_reports').doc(exampleId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

// --- Report Operations ---

async function createReport(uid, reportType, title) {
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') throw new Error('Title must be a string');
    if (title.length > 200) throw new Error('Title must be 200 characters or less');
  }
  const now = new Date().toISOString();
  const data = {
    report_type: reportType,
    status: 'draft',
    title: title || `New ${reportType} report`,
    transcript: null,
    generated_content: null,
    final_content: null,
    case_number: null,
    created_at: now,
    updated_at: now
  };
  const ref = await db.collection('users').doc(uid).collection('reports').add(data);
  return { id: ref.id, ...data };
}

async function getReport(uid, reportId) {
  const doc = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function getReports(uid, status) {
  let query = db.collection('users').doc(uid).collection('reports');
  if (status) {
    query = query.where('status', '==', status);
  }
  query = query.orderBy('updated_at', 'desc');
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateReport(uid, reportId, updates) {
  const ALLOWED_FIELDS = ['transcript', 'generated_content', 'final_content', 'status', 'title', 'case_number'];
  const sanitized = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  const ref = db.collection('users').doc(uid)
    .collection('reports').doc(reportId);
  await ref.update(sanitized);
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function deleteReport(uid, reportId) {
  const reportRef = db.collection('users').doc(uid)
    .collection('reports').doc(reportId);
  const doc = await reportRef.get();
  if (!doc.exists) return false;

  // Delete legal_references subcollection first
  const refsSnap = await reportRef.collection('legal_references').get();
  if (!refsSnap.empty) {
    const batch = db.batch();
    refsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Delete court_prep_sessions and their messages subcollections
  const sessionsSnap = await reportRef.collection('court_prep_sessions').get();
  for (const sessionDoc of sessionsSnap.docs) {
    const messagesSnap = await sessionDoc.ref.collection('messages').get();
    if (!messagesSnap.empty) {
      const msgBatch = db.batch();
      messagesSnap.docs.forEach(d => msgBatch.delete(d.ref));
      await msgBatch.commit();
    }
  }
  if (!sessionsSnap.empty) {
    const sessionBatch = db.batch();
    sessionsSnap.docs.forEach(d => sessionBatch.delete(d.ref));
    await sessionBatch.commit();
  }

  await reportRef.delete();
  return true;
}

// --- Legal Reference Operations ---

async function getLegalReferences(uid, reportId) {
  const snap = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('legal_references').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveLegalReferences(uid, reportId, analysis) {
  const reportRef = db.collection('users').doc(uid)
    .collection('reports').doc(reportId);

  // Clear existing references
  const existingSnap = await reportRef.collection('legal_references').get();
  if (!existingSnap.empty) {
    const deleteBatch = db.batch();
    existingSnap.docs.forEach(d => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

  const now = new Date().toISOString();
  const batch = db.batch();

  // Save validations
  for (const v of analysis.validations || []) {
    const ref = reportRef.collection('legal_references').doc();
    batch.set(ref, {
      reference_type: 'validation',
      title: v.case_law || 'Policy Support',
      citation: v.policy || '',
      content: v.support,
      action_validated: v.action,
      created_at: now
    });
  }

  // Save clarifications
  for (const c of analysis.clarifications || []) {
    const ref = reportRef.collection('legal_references').doc();
    batch.set(ref, {
      reference_type: 'clarification',
      title: c.issue,
      citation: '',
      content: JSON.stringify({ reason: c.reason, suggestion: c.suggestion }),
      action_validated: '',
      created_at: now
    });
  }

  // Save relevant references
  for (const r of analysis.relevant_references || []) {
    const ref = reportRef.collection('legal_references').doc();
    batch.set(ref, {
      reference_type: 'case_law',
      title: r.title,
      citation: r.citation,
      content: r.relevance,
      action_validated: '',
      created_at: now
    });
  }

  await batch.commit();
}

// --- Policy Document Operations ---

async function getPolicyDocuments(uid, includeContent = false) {
  const snap = await db.collection('users').doc(uid)
    .collection('policy_documents').get();
  return snap.docs.map(d => {
    const data = d.data();
    const result = {
      id: d.id,
      filename: data.filename,
      is_caselaw: data.is_caselaw || false,
      created_at: data.created_at
    };
    if (includeContent) {
      result.content = data.content;
    }
    return result;
  });
}

async function getPoliciesAndCaseLaw(uid) {
  const snap = await db.collection('users').doc(uid)
    .collection('policy_documents').get();

  const policies = [];
  const caseLaw = [];

  snap.docs.forEach(d => {
    const data = d.data();
    const item = { id: d.id, filename: data.filename, content: data.content };
    if (data.is_caselaw) {
      caseLaw.push(item);
    } else {
      policies.push(item);
    }
  });

  return { policies, caseLaw };
}

async function addPolicyDocument(uid, filename, content, isCaselaw = false) {
  const now = new Date().toISOString();
  const ref = await db.collection('users').doc(uid)
    .collection('policy_documents').add({
      filename,
      content,
      is_caselaw: isCaselaw,
      created_at: now
    });
  return { id: ref.id, filename, is_caselaw: isCaselaw, created_at: now };
}

async function deletePolicyDocument(uid, docId) {
  const ref = db.collection('users').doc(uid)
    .collection('policy_documents').doc(docId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

// --- Example Report Counts (grouped) ---

async function getExampleCounts(uid) {
  const snap = await db.collection('users').doc(uid)
    .collection('example_reports').get();
  const counts = {};
  snap.docs.forEach(d => {
    const type = d.data().report_type;
    counts[type] = (counts[type] || 0) + 1;
  });
  return Object.entries(counts).map(([report_type, count]) => ({ report_type, count }));
}

// --- Global Case Law Seeder (run once) ---

async function populateGlobalCaseLaw() {
  const existing = await db.collection('global_caselaw').get();
  if (!existing.empty) return;

  const batch = db.batch();
  for (const caseData of DEFAULT_CASE_LAW) {
    const ref = db.collection('global_caselaw').doc();
    batch.set(ref, caseData);
  }
  await batch.commit();
  console.log('Global case law seeded');
}

// --- Court Prep Session Operations ---

async function createCourtPrepSession(uid, reportId) {
  const now = new Date().toISOString();
  const data = {
    status: 'analyzing',
    vulnerability_assessment: null,
    debrief: null,
    message_count: 0,
    created_at: now,
    updated_at: now
  };
  const ref = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('court_prep_sessions').add(data);
  return { id: ref.id, ...data };
}

async function getCourtPrepSession(uid, reportId, sessionId) {
  const doc = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('court_prep_sessions').doc(sessionId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateCourtPrepSession(uid, reportId, sessionId, updates) {
  const ALLOWED_FIELDS = ['status', 'vulnerability_assessment', 'debrief', 'message_count'];
  const sanitized = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  const ref = db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('court_prep_sessions').doc(sessionId);
  await ref.update(sanitized);
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function addCourtPrepMessage(uid, reportId, sessionId, role, content) {
  const now = new Date().toISOString();
  const ref = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('court_prep_sessions').doc(sessionId)
    .collection('messages').add({
      role,
      content,
      created_at: now
    });
  return { id: ref.id, role, content, created_at: now };
}

async function getCourtPrepMessages(uid, reportId, sessionId) {
  const snap = await db.collection('users').doc(uid)
    .collection('reports').doc(reportId)
    .collection('court_prep_sessions').doc(sessionId)
    .collection('messages')
    .orderBy('created_at', 'asc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// --- Subscription Operations ---

async function updateSubscription(uid, data) {
  const ALLOWED_FIELDS = [
    'stripe_customer_id',
    'subscription_status',
    'subscription_id',
    'subscription_current_period_end',
    'trial_ends_at'
  ];
  const sanitized = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }
  await db.collection('users').doc(uid).update(sanitized);
  return getUser(uid);
}

async function getUserByStripeCustomerId(stripeCustomerId) {
  const snap = await db.collection('users')
    .where('stripe_customer_id', '==', stripeCustomerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

function hasSubscriptionAccess(user) {
  const status = user.subscription_status;

  // Active or past_due subscribers have access
  if (status === 'active' || status === 'past_due') return true;

  // Trialing users — check trial expiration
  if (status === 'trialing') {
    const trialEnd = user.trial_ends_at;
    if (trialEnd) {
      return new Date(trialEnd) > new Date();
    }
    // Fallback for existing users missing trial_ends_at: compute from created_at
    if (user.created_at) {
      const trialFromCreation = new Date(new Date(user.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
      return trialFromCreation > new Date();
    }
  }

  // Existing users with no subscription fields — compute trial from created_at
  if (!status && user.created_at) {
    const trialFromCreation = new Date(new Date(user.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
    return trialFromCreation > new Date();
  }

  return false;
}

module.exports = {
  db,
  getUser,
  createUser,
  updateUser,
  seedDefaultCaseLaw,
  getStyleProfile,
  getAllStyleProfiles,
  updateStyleProfile,
  getExampleReports,
  countExampleReports,
  addExampleReport,
  deleteExampleReport,
  createReport,
  getReport,
  getReports,
  updateReport,
  deleteReport,
  getLegalReferences,
  saveLegalReferences,
  getPolicyDocuments,
  getPoliciesAndCaseLaw,
  addPolicyDocument,
  deletePolicyDocument,
  getExampleCounts,
  populateGlobalCaseLaw,
  DEFAULT_CASE_LAW,
  updateSubscription,
  getUserByStripeCustomerId,
  hasSubscriptionAccess,
  createCourtPrepSession,
  getCourtPrepSession,
  updateCourtPrepSession,
  addCourtPrepMessage,
  getCourtPrepMessages
};
