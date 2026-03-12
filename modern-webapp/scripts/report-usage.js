#!/usr/bin/env node
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

function parseArgs(argv) {
  const result = {
    uid: '',
    email: '',
    month: '',
    json: false
  };
  argv.forEach((arg) => {
    if (arg === '--json') {
      result.json = true;
      return;
    }
    if (arg.startsWith('--uid=')) {
      result.uid = String(arg.slice('--uid='.length) || '').trim();
      return;
    }
    if (arg.startsWith('--email=')) {
      result.email = String(arg.slice('--email='.length) || '').trim().toLowerCase();
      return;
    }
    if (arg.startsWith('--month=')) {
      result.month = String(arg.slice('--month='.length) || '').trim();
    }
  });
  return result;
}

function parseServiceAccountJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function decodeFirestoreValue_(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return String(value.stringValue);
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return String(value.timestampValue);
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    const mapFields = value.mapValue && value.mapValue.fields ? value.mapValue.fields : {};
    const mapValue = {};
    Object.keys(mapFields).forEach((key) => {
      mapValue[key] = decodeFirestoreValue_(mapFields[key]);
    });
    return mapValue;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const list = value.arrayValue && Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
    return list.map((item) => decodeFirestoreValue_(item));
  }
  return null;
}

function getField_(doc, key) {
  const fields = doc && doc.fields ? doc.fields : {};
  return decodeFirestoreValue_(fields[key]);
}

function getDocId_(name) {
  const parts = String(name || '').split('/');
  return String(parts[parts.length - 1] || '').trim();
}

function formatDateTime_(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .format(new Date(value))
    .replace(',', '');
}

async function listAllDocuments_(firestoreApi, parent, collectionId) {
  const docs = [];
  let pageToken = undefined;
  do {
    const response = await firestoreApi.projects.databases.documents.listDocuments({
      parent,
      collectionId,
      pageSize: 1000,
      pageToken,
      showMissing: false
    });
    const batch = response && response.data && Array.isArray(response.data.documents)
      ? response.data.documents
      : [];
    docs.push(...batch);
    pageToken = response && response.data ? response.data.nextPageToken : undefined;
  } while (pageToken);
  return docs;
}

function printUsageAndExit_(message) {
  console.error(message);
  console.error('Usage: npm run usage:report -- [--uid=<uid>] [--email=<email>] [--month=YYYY-MM] [--json]');
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.month && !/^\d{4}-\d{2}$/.test(args.month)) {
    printUsageAndExit_('--month must be YYYY-MM format.');
  }

  const serviceAccount = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!serviceAccount) {
    printUsageAndExit_('GOOGLE_SERVICE_ACCOUNT_JSON is empty or invalid in modern-webapp/.env');
  }

  const projectId = String(process.env.PUBLIC_FIREBASE_PROJECT_ID || serviceAccount.project_id || '').trim();
  if (!projectId) {
    printUsageAndExit_('PUBLIC_FIREBASE_PROJECT_ID (or service account project_id) is required.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  const authClient = await auth.getClient();
  const firestoreApi = google.firestore({ version: 'v1', auth: authClient });
  const rootParent = `projects/${projectId}/databases/(default)/documents`;

  const usageUserDocs = await listAllDocuments_(firestoreApi, rootParent, 'mercari_usage_users');
  const usersByUid = new Map();
  usageUserDocs.forEach((doc) => {
    const uid = getDocId_(doc.name);
    usersByUid.set(uid, {
      uid,
      email: String(getField_(doc, 'email') || '').trim().toLowerCase(),
      displayName: String(getField_(doc, 'displayName') || '').trim()
    });
  });

  const usageRootDocs = await listAllDocuments_(firestoreApi, rootParent, 'mercari_usage');
  const rows = [];
  for (const usageRoot of usageRootDocs) {
    const uid = getDocId_(usageRoot.name);
    if (!uid) continue;
    const userMeta = usersByUid.get(uid) || { uid, email: '', displayName: '' };
    if (args.uid && uid !== args.uid) continue;
    if (args.email && userMeta.email !== args.email) continue;

    const monthDocs = await listAllDocuments_(firestoreApi, usageRoot.name, 'months');
    monthDocs.forEach((doc) => {
      const month = String(getField_(doc, 'month') || getDocId_(doc.name) || '').trim();
      if (!month) return;
      if (args.month && month !== args.month) return;
      const addedCount = Number(getField_(doc, 'addedCount') || 0);
      const firstAddedAtMs = Number(getField_(doc, 'firstAddedAtMs') || 0);
      const lastAddedAtMs = Number(getField_(doc, 'lastAddedAtMs') || 0);
      rows.push({
        uid,
        email: userMeta.email,
        displayName: userMeta.displayName,
        month,
        addedCount: Number.isFinite(addedCount) ? addedCount : 0,
        firstAddedAtMs: Number.isFinite(firstAddedAtMs) ? firstAddedAtMs : 0,
        lastAddedAtMs: Number.isFinite(lastAddedAtMs) ? lastAddedAtMs : 0
      });
    });
  }

  rows.sort((a, b) => {
    if (a.uid !== b.uid) return a.uid.localeCompare(b.uid);
    return b.month.localeCompare(a.month);
  });

  if (args.json) {
    process.stdout.write(JSON.stringify({
      projectId,
      count: rows.length,
      rows
    }, null, 2) + '\n');
    return;
  }

  if (rows.length === 0) {
    console.log('No usage rows found for the given filters.');
    return;
  }

  console.log('uid\temail\tdisplayName\tmonth\taddedCount\tfirstAddedAt\tlastAddedAt');
  rows.forEach((row) => {
    console.log([
      row.uid,
      row.email || '-',
      row.displayName || '-',
      row.month,
      String(row.addedCount),
      formatDateTime_(row.firstAddedAtMs) || '-',
      formatDateTime_(row.lastAddedAtMs) || '-'
    ].join('\t'));
  });

  const totals = new Map();
  rows.forEach((row) => {
    const key = row.uid;
    const prev = totals.get(key) || {
      uid: row.uid,
      email: row.email,
      displayName: row.displayName,
      totalAddedCount: 0,
      latestMonth: ''
    };
    prev.totalAddedCount += row.addedCount;
    if (!prev.latestMonth || row.month > prev.latestMonth) {
      prev.latestMonth = row.month;
    }
    totals.set(key, prev);
  });

  console.log('');
  console.log('--- User Totals ---');
  Array.from(totals.values())
    .sort((a, b) => a.uid.localeCompare(b.uid))
    .forEach((entry) => {
      console.log([
        entry.uid,
        entry.email || '-',
        entry.displayName || '-',
        String(entry.totalAddedCount),
        entry.latestMonth || '-'
      ].join('\t'));
    });
}

main().catch((error) => {
  console.error('[usage-report] failed:', String(error && error.message ? error.message : error));
  process.exit(1);
});
