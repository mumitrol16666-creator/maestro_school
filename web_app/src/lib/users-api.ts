import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";

export interface AdminUserSummary {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  fullName?: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  role: string;
  roleName: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  roleDescription: string | null;
  permissions: string[];
  crmStudentId?: string | null;
  crmTeacherId?: string | null;
  externalLinkStatus?: string | null;
  linkedAt?: string | null;
}

export interface CrmLinkStatus {
  appUserId: string;
  role: string;
  crmStudentId: string | null;
  crmTeacherId: string | null;
  externalLinkStatus: string | null;
  linkedAt: string | null;
  local: Record<string, unknown>;
  crmLookup: CrmLookupResult | null;
  crmLinkStatus: Record<string, unknown> | null;
}

export interface CrmLookupResult {
  found: boolean;
  crmUserId?: string;
  role?: string;
  name?: string;
  phone?: string;
  appUserId?: string | null;
  externalLinkStatus?: string | null;
}

export interface AssignableRole {
  slug: string;
  name: string;
  description: string | null;
}

export const usersApi = {
  roles: () => apiRequest<AssignableRole[]>("/admin/users/roles"),
  list: (params: { search?: string; role?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.role) query.set("role", params.role);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    return apiRequestEnvelope<AdminUserSummary[], { page: number; limit: number; total: number; pages: number }>(
      `/admin/users?${query}`,
    );
  },
  get: (id: string) => apiRequest<AdminUserDetail>(`/admin/users/${id}`),
  updateRole: (id: string, role: string) =>
    apiRequest<AdminUserSummary>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  crmLink: (id: string) => apiRequest<CrmLinkStatus>(`/admin/users/${id}/crm-link`),
  linkToCrm: (id: string, crmUserId?: string) =>
    apiRequest<{
      status: string;
      crmStudentId: string | null;
      crmTeacherId: string | null;
      externalLinkStatus: string | null;
      linkedAt: string | null;
    }>(`/admin/users/${id}/crm-link`, {
      method: "POST",
      body: JSON.stringify(crmUserId ? { crmUserId } : {}),
    }),
  crmLookup: (phone: string) =>
    apiRequest<CrmLookupResult>(`/admin/crm-lookup?phone=${encodeURIComponent(phone)}`),
};
