import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var _mongoDb: Db | undefined;
}

const uri = process.env.MONGO_URL as string;
const dbName = process.env.DB_NAME as string;

export async function getDb(): Promise<Db> {
  if (global._mongoDb) return global._mongoDb;
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri, { maxPoolSize: 20 });
    await global._mongoClient.connect();
  }
  global._mongoDb = global._mongoClient.db(dbName);
  await ensureIndexes(global._mongoDb);
  return global._mongoDb;
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
  ]);
}
