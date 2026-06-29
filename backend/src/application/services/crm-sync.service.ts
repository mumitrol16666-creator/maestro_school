import { syncStudentFromApp } from "../../infrastructure/crm/crm-client.js";
import { linkUserToCrm } from "../repositories/user-link.repository.js";
import { normalizePhoneDigits } from "../../lib/phone.js";

export async function syncNewStudentToCrm(params: {
  appUserId: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string;
}) {
  if (!process.env.INTEGRATION_SERVICE_SECRET) {
    console.warn("[crm-sync] INTEGRATION_SERVICE_SECRET is not configured, skip sync");
    return null;
  }

  try {
    const result = await syncStudentFromApp(params);
    const crmStudentId = String(result.crmStudentId ?? "");
    if (!crmStudentId) return null;

    await linkUserToCrm(
      params.appUserId,
      crmStudentId,
      normalizePhoneDigits(params.phone),
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[crm-sync] Failed to sync student to CRM:", message);
    return null;
  }
}
