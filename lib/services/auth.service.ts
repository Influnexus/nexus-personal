import bcrypt from 'bcryptjs';
import { usersRepo } from '@/lib/repositories/users';
import { auditRepo } from '@/lib/repositories/auditLogs';

export const authService = {
  async register(input: { name: string; email: string; password: string }) {
    const existing = await usersRepo.findByEmail(input.email);
    if (existing) throw new Error('An account with this email already exists');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await usersRepo.create({ email: input.email, name: input.name, passwordHash });
    await auditRepo.log({ userId: user.id, action: 'user.register' });
    return user;
  },
  async verifyCredentials(email: string, password: string) {
    const user = await usersRepo.findByEmail(email);
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  },
};
