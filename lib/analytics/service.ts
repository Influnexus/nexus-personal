// Aggregation service powering the private founder analytics dashboard.
// All numbers are derived exclusively from the privacy-safe analytics_events + feedback
// collections — never from business data (invoices, transactions, conversations).
import { analyticsRepo } from './repo';

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export const analyticsService = {
  async dashboard(rangeDays = 30) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const inRange = { createdAt: { $gte: since } };

    const [
      visitorAgg, demoStartAgg, signupCount, demoConvertedCount, trialCount,
      activatedOrgAgg, questionOrgAgg, aiCounts, featureAgg, failAgg,
      returningAgg, sessionAgg, dailyAgg, feedbackDist, recentFeedback,
    ] = await Promise.all([
      // Distinct anonymous visitors that hit the landing page
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: 'landing_page_visit', visitorId: { $ne: null } } },
        { $group: { _id: '$visitorId' } }, { $count: 'n' },
      ]),
      // Distinct demo users started
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: 'demo_started' } },
        { $group: { _id: { $ifNull: ['$userId', '$id'] } } }, { $count: 'n' },
      ]),
      analyticsRepo.countEvents({ ...inRange, event: 'signup_completed' }),
      analyticsRepo.countEvents({ ...inRange, event: 'demo_converted' }),
      analyticsRepo.countEvents({ ...inRange, event: 'trial_started' }),
      // Activated = org received at least one successful AI CFO answer
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: 'cfo_response_completed', organizationId: { $ne: null } } },
        { $group: { _id: '$organizationId' } }, { $count: 'n' },
      ]),
      // Orgs that asked at least one CFO question (funnel step)
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: 'cfo_question', organizationId: { $ne: null } } },
        { $group: { _id: '$organizationId' } }, { $count: 'n' },
      ]),
      // Raw AI usage counts
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: { $in: ['cfo_question', 'cfo_response_completed', 'cfo_response_failed'] } } },
        { $group: { _id: '$event', n: { $sum: 1 } } },
      ]),
      // Feature adoption: usage count + distinct orgs per feature event
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: { $in: [
          'invoice_upload_completed', 'csv_import_completed', 'report_generated',
          'forecast_viewed', 'memory_page_viewed', 'memory_used', 'billing_page_viewed',
          'reports_page_viewed', 'cfo_chat_viewed', 'dashboard_viewed',
        ] } } },
        { $group: { _id: '$event', n: { $sum: 1 }, orgs: { $addToSet: '$organizationId' } } },
        { $project: { n: 1, orgs: { $size: { $setDifference: ['$orgs', [null]] } } } },
      ]),
      // Failures
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, event: { $in: ['invoice_upload_failed', 'csv_import_failed', 'cfo_response_failed', 'report_failed'] } } },
        { $group: { _id: '$event', n: { $sum: 1 } } },
      ]),
      // Returning users: same visitor or user active on 2+ distinct days
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, $or: [{ visitorId: { $ne: null } }, { userId: { $ne: null } }] } },
        { $group: { _id: { $ifNull: ['$userId', '$visitorId'] }, days: { $addToSet: '$day' } } },
        { $match: { $expr: { $gte: [{ $size: '$days' }, 2] } } },
        { $count: 'n' },
      ]),
      // Session duration: span between first and last event per session
      analyticsRepo.aggregateEvents([
        { $match: { ...inRange, sessionId: { $ne: null } } },
        { $group: { _id: '$sessionId', first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
        { $project: { dur: { $divide: [{ $subtract: ['$last', '$first'] }, 1000] } } },
        { $group: { _id: null, avgSec: { $avg: '$dur' }, sessions: { $sum: 1 } } },
      ]),
      // Daily trends
      analyticsRepo.aggregateEvents([
        { $match: inRange },
        { $group: {
          _id: '$day',
          visits: { $sum: { $cond: [{ $eq: ['$event', 'landing_page_visit'] }, 1, 0] } },
          demoStarts: { $sum: { $cond: [{ $eq: ['$event', 'demo_started'] }, 1, 0] } },
          signups: { $sum: { $cond: [{ $in: ['$event', ['signup_completed', 'demo_converted']] }, 1, 0] } },
          aiMessages: { $sum: { $cond: [{ $eq: ['$event', 'cfo_question'] }, 1, 0] } },
          errors: { $sum: { $cond: [{ $in: ['$event', ['invoice_upload_failed', 'csv_import_failed', 'cfo_response_failed', 'report_failed']] }, 1, 0] } },
        } },
        { $sort: { _id: 1 } },
      ]),
      analyticsRepo.aggregateFeedback([
        { $match: { createdAt: { $gte: since }, type: 'rating' } },
        { $group: { _id: '$rating', n: { $sum: 1 } } },
      ]),
      analyticsRepo.listFeedback(since, 50),
    ]);

    const num = (agg: any[]) => (agg[0]?.n as number) || 0;
    const aiMap = Object.fromEntries(aiCounts.map((r: any) => [r._id, r.n]));
    const failMap = Object.fromEntries(failAgg.map((r: any) => [r._id, r.n]));

    const visitors = num(visitorAgg);
    const demoUsers = num(demoStartAgg);
    const signups = signupCount + demoConvertedCount;
    const activated = num(activatedOrgAgg);
    const askedQuestion = num(questionOrgAgg);
    const answered = num(activatedOrgAgg);

    // Conversion funnel with drop-off between consecutive steps
    const steps = [
      { key: 'visitors', label: 'Landing visitors', value: visitors },
      { key: 'demo_started', label: 'Demo started', value: demoUsers },
      { key: 'first_question', label: 'Asked first CFO question', value: askedQuestion },
      { key: 'first_response', label: 'Got first CFO answer', value: answered },
      { key: 'signups', label: 'Signed up / converted', value: signups },
      { key: 'trials', label: 'Trial started', value: trialCount },
    ];
    const funnel = steps.map((s, i) => ({
      ...s,
      conversionFromPrev: i === 0 ? 100 : pct(s.value, steps[i - 1].value),
      dropOffFromPrev: i === 0 ? 0 : Math.max(0, 100 - pct(s.value, steps[i - 1].value)),
    }));

    // Weekly trend derived from daily buckets (ISO week label = week start date)
    const weeklyMap = new Map<string, any>();
    for (const d of dailyAgg as any[]) {
      const date = new Date(d._id + 'T00:00:00Z');
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); // Monday
      const wk = weekStart.toISOString().slice(0, 10);
      const cur = weeklyMap.get(wk) || { week: wk, visits: 0, demoStarts: 0, signups: 0, aiMessages: 0, errors: 0 };
      cur.visits += d.visits; cur.demoStarts += d.demoStarts; cur.signups += d.signups;
      cur.aiMessages += d.aiMessages; cur.errors += d.errors;
      weeklyMap.set(wk, cur);
    }

    const ratingDist: Record<string, number> = { very_useful: 0, useful: 0, neutral: 0, not_useful: 0, broken: 0 };
    for (const r of feedbackDist as any[]) if (r._id && r._id in ratingDist) ratingDist[r._id] = r.n;

    return {
      rangeDays,
      generatedAt: new Date().toISOString(),
      summary: {
        visitors,
        demoUsers,
        signups,
        demoConversions: demoConvertedCount,
        trials: trialCount,
        activatedUsers: activated,
        returningUsers: num(returningAgg),
        avgSessionMinutes: Math.round(((sessionAgg[0]?.avgSec as number) || 0) / 6) / 10,
        sessions: (sessionAgg[0]?.sessions as number) || 0,
      },
      aiUsage: {
        questions: aiMap['cfo_question'] || 0,
        completed: aiMap['cfo_response_completed'] || 0,
        failed: aiMap['cfo_response_failed'] || 0,
        successRate: pct(aiMap['cfo_response_completed'] || 0, (aiMap['cfo_response_completed'] || 0) + (aiMap['cfo_response_failed'] || 0)),
      },
      featureAdoption: (featureAgg as any[]).map((f) => ({ event: f._id, count: f.n, orgs: f.orgs })).sort((a, b) => b.count - a.count),
      errors: {
        invoiceUploadFailed: failMap['invoice_upload_failed'] || 0,
        csvImportFailed: failMap['csv_import_failed'] || 0,
        cfoResponseFailed: failMap['cfo_response_failed'] || 0,
        reportFailed: failMap['report_failed'] || 0,
        total: Object.values(failMap).reduce((a: number, b: any) => a + b, 0),
      },
      funnel,
      daily: (dailyAgg as any[]).map((d) => ({ day: d._id, visits: d.visits, demoStarts: d.demoStarts, signups: d.signups, aiMessages: d.aiMessages, errors: d.errors })),
      weekly: Array.from(weeklyMap.values()).sort((a, b) => a.week.localeCompare(b.week)),
      feedback: {
        ratingDistribution: ratingDist,
        recent: recentFeedback,
      },
    };
  },
};
