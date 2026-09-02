import { MongoClient, Db, MongoClientOptions } from 'mongodb';

// ============================================================================
// Production-safe MongoDB connection manager for Next.js 15 App Router + Vercel
// serverless, using the native `mongodb` driver.
//
// Key properties:
//  • A single MongoClient + its connection are cached on `globalThis` as a PROMISE,
//    so concurrent requests (and HMR in dev / warm serverless invocations) reuse
//    one connection instead of racing multiple `connect()` calls.
//  • The client is only ever assigned to the cache via the promise — a failed
//    connection is never left cached: the promise is reset so the next request
//    can retry cleanly.
//  • We NEVER call client.close() from request handlers/repositories. The pool is
//    long-lived and managed by the driver.
//  • If the topology closes (idle/network reset between warm invocations), a driver
//    event clears the cache so the next getDb() transparently recreates it.
//  • ensureIndexes runs at most once per process, is idempotent, non-fatal, and
//    de-duplicated across concurrent callers.
//  • No connection string / credentials are ever placed in logs or thrown errors.
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var _mongoConnPromise: Promise<MongoConn> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesPromise: Promise<void> | undefined;
}

interface MongoConn {
  client: MongoClient;
  db: Db;
}

const uri = process.env.MONGO_URL as string;
const dbName = process.env.DB_NAME as string;

// Serverless-friendly options: bounded pool, fast server selection so a bad
// connection fails quickly (and is retried) instead of hanging the request.
const options: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

/** Redact anything that looks like a Mongo connection string (with credentials). */
function redact(input: unknown): string {
  const msg = input instanceof Error ? input.message : String(input ?? 'unknown error');
  return msg.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://<redacted>');
}

/** Establish a fresh connection. Only its resolved value is ever cached. */
async function createConnection(): Promise<MongoConn> {
  if (!uri) throw new Error('Database is not configured (MONGO_URL missing).');
  if (!dbName) throw new Error('Database is not configured (DB_NAME missing).');

  const client = new MongoClient(uri, options);

  // If the topology closes for any reason, drop the cache so the next getDb()
  // rebuilds the connection instead of reusing a dead client ("Topology is closed").
  const invalidate = () => {
    if (global._mongoConnPromise) global._mongoConnPromise = undefined;
    if (global._mongoIndexesPromise) global._mongoIndexesPromise = undefined;
  };
  client.on('topologyClosed', invalidate);
  client.on('close', invalidate);
  client.on('error', invalidate);

  await client.connect();
  const db = client.db(dbName);
  return { client, db };
}

/**
 * Returns a connected Db. Preserves the original API — repositories call `getDb()`
 * exactly as before. Safe under concurrency: all callers await the same promise.
 */
export async function getDb(): Promise<Db> {
  if (!global._mongoConnPromise) {
    global._mongoConnPromise = createConnection().catch((err) => {
      // Never cache a broken connection — reset so a later request can retry.
      global._mongoConnPromise = undefined;
      // Sanitized, no credentials.
      console.error('[mongo] connection failed:', redact(err));
      throw new Error('Database connection failed. Please try again.');
    });
  }

  const conn = await global._mongoConnPromise;

  // Best-effort, at-most-once, idempotent index creation. Non-fatal: an index
  // problem must never block application requests (e.g. registration).
  await ensureIndexesOnce(conn.db);

  return conn.db;
}

function ensureIndexesOnce(db: Db): Promise<void> {
  if (!global._mongoIndexesPromise) {
    global._mongoIndexesPromise = ensureIndexes(db).catch((e) => {
      // Reset so indexes can be retried on a later cold start; do not fail the request.
      global._mongoIndexesPromise = undefined;
      console.error('[mongo] ensureIndexes skipped (non-fatal):', redact(e));
    });
  }
  return global._mongoIndexesPromise;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('organizations').createIndex({ slug: 1 }, { unique: true }),
    db.collection('organizations').createIndex({ isDemo: 1, demoExpiresAt: 1 }),
    db.collection('memberships').createIndex({ userId: 1, organizationId: 1 }, { unique: true }),
    db.collection('memberships').createIndex({ organizationId: 1 }),
    db.collection('invitations').createIndex({ token: 1 }, { unique: true }),
    db.collection('invitations').createIndex({ organizationId: 1, email: 1 }),
    db.collection('audit_logs').createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection('memories').createIndex({ organizationId: 1, category: 1 }),
    db.collection('subscriptions').createIndex({ organizationId: 1 }, { unique: true }),
    db.collection('billing_invoices').createIndex({ organizationId: 1, issuedAt: -1 }),
    db.collection('usage_records').createIndex({ organizationId: 1, metric: 1, period: 1 }, { unique: true }),
    db.collection('payment_methods').createIndex({ organizationId: 1 }),
    db.collection('webhook_events').createIndex({ provider: 1, eventId: 1 }, { unique: true }),
    // Sprint 6 — product analytics (privacy-safe events) + beta feedback
    db.collection('analytics_events').createIndex({ event: 1, createdAt: -1 }),
    db.collection('analytics_events').createIndex({ day: 1, event: 1 }),
    db.collection('analytics_events').createIndex({ sessionId: 1 }),
    db.collection('analytics_events').createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection('feedback').createIndex({ createdAt: -1 }),
  ]);
}
