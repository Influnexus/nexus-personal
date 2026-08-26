// Ephemeral, fully-interactive demo workspaces — no signup required.
// A visitor gets a real (temporary) user + org + seeded financial data so every
// AI CFO feature (chat, invoices, CSV import, dashboard, reports, forecast) works instantly.
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { usersRepo } from '@/lib/repositories/users';
import { orgsRepo } from '@/lib/repositories/organizations';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo } from '@/lib/repositories/invoices';
import { conversationsRepo } from '@/lib/repositories/conversations';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { seedService } from '@/lib/services/seed.service';
import { personalSeedService, PERSONAL_DEMO_PROFILE } from '@/lib/services/personal-seed.service';

const DEMO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const demoService = {
  // Best-effort garbage collection of stale demo workspaces. There is no cron in this
  // environment, so we sweep opportunistically every time a new demo is requested.
  async cleanupExpired() {
    const expired = await orgsRepo.listExpiredDemo(new Date());
    for (const org of expired) {
      await Promise.all([
        transactionsRepo.deleteByOrg(org.id),
        invoicesRepo.deleteByOrg(org.id),
        conversationsRepo.deleteByOrg(org.id),
        membershipsRepo.removeByOrg(org.id),
      ]);
      await orgsRepo.remove(org.id);
      const owner = await usersRepo.findById(org.ownerId);
      if (owner?.isDemo) await usersRepo.remove(owner.id);
    }
    return expired.length;
  },

  async createDemoWorkspace() {
    // Fire-and-forget cleanup so it never slows down the visitor's "Try Demo" click.
    this.cleanupExpired().catch(() => {});

    const rid = uuid().slice(0, 8);
    const email = `demo_${rid}@nexusai.demo`;
    const passwordHash = await bcrypt.hash(uuid(), 10); // random, unusable password
    const user = await usersRepo.create({ email, name: 'Demo User', passwordHash, isDemo: true });

    const org = await orgsRepo.create({
      name: 'Acme Demo Co.',
      slug: `demo-${rid}`,
      ownerId: user.id,
      isDemo: true,
      demoExpiresAt: new Date(Date.now() + DEMO_TTL_MS),
    });
    await membershipsRepo.create({ userId: user.id, organizationId: org.id, role: 'OWNER' });
    await seedService.seedOrg(org.id);
    await auditRepo.log({ userId: user.id, organizationId: org.id, action: 'demo.start' });

    return { id: user.id, email, name: 'Demo User', isDemo: true, organizationId: org.id, demoExpiresAt: org.demoExpiresAt };
  },

  // Sprint P2 — Personal Demo Mode. Same ephemeral machinery as the Enterprise demo, but the
  // workspace is kind='personal' and seeded with clearly fictional personal finances (₹).
  async createPersonalDemoWorkspace() {
    this.cleanupExpired().catch(() => {});

    const rid = uuid().slice(0, 8);
    const email = `demo_personal_${rid}@nexusai.demo`;
    const passwordHash = await bcrypt.hash(uuid(), 10);
    const user = await usersRepo.create({ email, name: 'Aarav (Demo)', passwordHash, isDemo: true });

    const org = await orgsRepo.create({
      name: 'Aarav\u2019s Money (Demo)',
      slug: `demo-personal-${rid}`,
      ownerId: user.id,
      kind: 'personal',
      isDemo: true,
      demoExpiresAt: new Date(Date.now() + DEMO_TTL_MS),
    });
    await membershipsRepo.create({ userId: user.id, organizationId: org.id, role: 'OWNER' });
    await orgsRepo.update(org.id, { personalProfile: { ...PERSONAL_DEMO_PROFILE, updatedAt: new Date() } } as any);
    await personalSeedService.seedFromProfile(org.id, PERSONAL_DEMO_PROFILE, { demo: true });
    await auditRepo.log({ userId: user.id, organizationId: org.id, action: 'demo.personal.start' });

    return { id: user.id, email, name: 'Aarav (Demo)', isDemo: true, organizationId: org.id, demoExpiresAt: org.demoExpiresAt };
  },

  // Converts the ephemeral demo user into a permanent account IN PLACE — the org, its
  // invoices, transactions and chat history are untouched, so the user never loses work.
  async convertToReal(userId: string, data: { name: string; email: string; password: string }) {
    const normalizedEmail = data.email.toLowerCase();
    const existing = await usersRepo.findByEmail(normalizedEmail);
    if (existing && existing.id !== userId) throw new Error('An account with this email already exists. Please use a different email.');

    const user = await usersRepo.findById(userId);
    if (!user) throw new Error('User not found');

    const passwordHash = await bcrypt.hash(data.password, 10);
    await usersRepo.update(userId, { email: normalizedEmail, name: data.name, passwordHash, isDemo: false } as any);

    const memberships = await membershipsRepo.listByUser(userId);
    for (const m of memberships) {
      const org = await orgsRepo.findById(m.organizationId);
      if (org?.isDemo && org.ownerId === userId) {
        await orgsRepo.update(org.id, { isDemo: false, demoExpiresAt: null } as any);
      }
    }
    await auditRepo.log({ userId, action: 'demo.convert' });
    return { id: userId, email: normalizedEmail, name: data.name };
  },
};
