export interface AuthUser {
  id: string;
  email: string;
  roleSlug: string;
  permissions: string[];
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role?: string };
    user: AuthUser;
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
