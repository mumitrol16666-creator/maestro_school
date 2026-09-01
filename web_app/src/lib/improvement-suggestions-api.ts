import { apiRequest } from "@/lib/api-client";

export const improvementSuggestionsApi = {
  submit(body: {
    idempotencyKey: string;
    title: string;
    details: string;
    currentPath?: string | null;
  }) {
    return apiRequest<{ id: string; status: string }>("/improvement-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
