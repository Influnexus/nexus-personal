// Repository for analytics events and beta feedback. Events are append-only and contain
// NO sensitive content (enforced upstream by lib/analytics/events.ts sanitizers).
import { getDb } from '@/lib/db/mongo';
import { v4 as uuid } from 'uuid';
import { AnalyticsEvent } from './events';

export interface AnalyticsEventDoc {
  id: string;
  event: AnalyticsEvent;
  visitorId: string | null; // anonymous browser id (uuid we mint client-side)
  sessionId: string | null; // per-tab session id
  userId: string | null;
  organizationId: string | null;
  isDemo: boolean;
  page: string | null;
  meta: Record<string, string | number | boolean>;
  day: string; // YYYY-MM-DD (UTC) — makes daily aggregations cheap
  createdAt: Date;
}

export type FeedbackType = 'rating' | 'problem';
export type FeedbackRating = 'very_useful' | 'useful' | 'neutral' | 'not_useful' | 'broken';

export interface FeedbackDoc {
  id: string;
  type: FeedbackType;
  rating: FeedbackRating | null;
  text: string | null; // optional free text, capped — the ONLY user-authored text we store
  page: string | null;
  feature: string | null;
  errorId: string | null;
  userId: string | null;
  organizationId: string | null;
  isDemo: boolean;
  createdAt: Date;
}

const eventsCol = async () => (await getDb()).collection<AnalyticsEventDoc>('analytics_events');
const feedbackCol = async () => (await getDb()).collection<FeedbackDoc>('feedback');

export const analyticsRepo = {
  async track(data: {
    event: AnalyticsEvent;
    visitorId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    organizationId?: string | null;
    isDemo?: boolean;
    page?: string | null;
    meta?: Record<string, string | number | boolean>;
  }) {
    const now = new Date();
    const doc: AnalyticsEventDoc = {
      id: uuid(),
      event: data.event,
      visitorId: data.visitorId ?? null,
      sessionId: data.sessionId ?? null,
      userId: data.userId ?? null,
      organizationId: data.organizationId ?? null,
      isDemo: !!data.isDemo,
      page: data.page ?? null,
      meta: data.meta ?? {},
      day: now.toISOString().slice(0, 10),
      createdAt: now,
    };
    await (await eventsCol()).insertOne(doc as any);
    return doc;
  },

  async createFeedback(data: Omit<FeedbackDoc, 'id' | 'createdAt'>) {
    const doc: FeedbackDoc = { id: uuid(), ...data, createdAt: new Date() };
    await (await feedbackCol()).insertOne(doc as any);
    return doc;
  },

  async aggregateEvents(pipeline: any[]) {
    return (await eventsCol()).aggregate(pipeline).toArray();
  },

  async countEvents(query: any) {
    return (await eventsCol()).countDocuments(query);
  },

  async listFeedback(since: Date, limit = 100) {
    return (await feedbackCol())
      .find({ createdAt: { $gte: since } }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  },

  async aggregateFeedback(pipeline: any[]) {
    return (await feedbackCol()).aggregate(pipeline).toArray();
  },
};
