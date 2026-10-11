export interface AuthUser {
  id: string;
  email: string | null;
  roleSlug: string;
  permissions: string[];
  crmSessionVersion?: number;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role?: string; sessionVersion?: number; crmSessionVersion?: number };
    user: AuthUser | undefined;
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
