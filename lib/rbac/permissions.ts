import { Role } from '@/lib/db/models';

export type Permission =
  | 'org:read' | 'org:update' | 'org:delete'
  | 'members:read' | 'members:invite' | 'members:remove' | 'members:update_role'
  | 'billing:read' | 'billing:manage'
  | 'audit:read';

const MATRIX: Record<Role, Permission[]> = {
  OWNER: ['org:read','org:update','org:delete','members:read','members:invite','members:remove','members:update_role','billing:read','billing:manage','audit:read'],
  ADMIN: ['org:read','org:update','members:read','members:invite','members:remove','members:update_role','billing:read','audit:read'],
  MEMBER: ['org:read','members:read'],
  VIEWER: ['org:read','members:read'],
};

export function can(role: Role | null | undefined, perm: Permission) {
  if (!role) return false;
  return MATRIX[role]?.includes(perm) ?? false;
}

export const ROLES: Role[] = ['OWNER','ADMIN','MEMBER','VIEWER'];
