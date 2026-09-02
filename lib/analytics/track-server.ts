// Fire-and-forget server-side event tracking. Analytics must NEVER break, slow down or
// throw inside a product flow — every call is best-effort and errors are swallowed.
import { analyticsRepo } from './repo';
import { AnalyticsEvent } from './events';

export function trackServer(
  event: AnalyticsEvent,
  ctx: {
    userId?: string | null;
    organizationId?: string | null;
    isDemo?: boolean;
    page?: string | null;
    meta?: Record<string, string | number | boolean>;
  } = {},
) {
  analyticsRepo
    .track({ event, userId: ctx.userId, organizationId: ctx.organizationId, isDemo: ctx.isDemo, page: ctx.page, meta: ctx.meta })
    .catch(() => {});
}
