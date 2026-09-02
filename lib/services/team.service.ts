import { membershipsRepo } from '@/lib/repositories/memberships';
import { invitationsRepo } from '@/lib/repositories/invitations';
import { usersRepo } from '@/lib/repositories/users';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { Role } from '@/lib/db/models';

export const teamService = {
  async listMembers(organizationId: string) {
    const memberships = await membershipsRepo.listByOrg(organizationId);
    const users = await Promise.all(memberships.map(m => usersRepo.findById(m.userId)));
    return memberships.map((m, i) => ({
      membershipId: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.createdAt,
      email: users[i]?.email,
      name: users[i]?.name,
      image: users[i]?.image,
    }));
  },
  async invite(organizationId: string, invitedBy: string, email: string, role: Role) {
    const inv = await invitationsRepo.create({ organizationId, email, role, invitedBy });
    await auditRepo.log({ userId: invitedBy, organizationId, action: 'team.invite', metadata: { email, role } });
    return inv;
  },
  async listInvitations(organizationId: string) {
    return invitationsRepo.listByOrg(organizationId);
  },
  async acceptInvitation(token: string, userId: string) {
    const inv = await invitationsRepo.findByToken(token);
    if (!inv) throw new Error('Invitation not found');
    if (inv.status !== 'PENDING') throw new Error('Invitation is no longer valid');
    if (inv.expiresAt < new Date()) {
      await invitationsRepo.updateStatus(inv.id, 'EXPIRED');
      throw new Error('Invitation expired');
    }
    const existing = await membershipsRepo.find(userId, inv.organizationId);
    if (!existing) {
      await membershipsRepo.create({ userId, organizationId: inv.organizationId, role: inv.role });
    }
    await invitationsRepo.updateStatus(inv.id, 'ACCEPTED');
    await auditRepo.log({ userId, organizationId: inv.organizationId, action: 'team.invitation.accepted' });
    return inv;
  },
  async removeMember(organizationId: string, membershipId: string, actorId: string) {
    await membershipsRepo.remove(membershipId);
    await auditRepo.log({ userId: actorId, organizationId, action: 'team.member.removed', metadata: { membershipId } });
  },
  async updateMemberRole(organizationId: string, membershipId: string, role: Role, actorId: string) {
    await membershipsRepo.updateRole(membershipId, role);
    await auditRepo.log({ userId: actorId, organizationId, action: 'team.member.role_updated', metadata: { membershipId, role } });
  },
};
