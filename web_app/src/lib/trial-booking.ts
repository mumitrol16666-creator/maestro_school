/**
 * 03.11 (Vladislav): one place to book a trial lesson — the form on the school site.
 * The app only links there; `utm_source=app` shows the lead's origin in CRM.
 */
export const TRIAL_BOOKING_URL =
  process.env.NEXT_PUBLIC_TRIAL_LANDING_URL || "https://maestro.com.kz/?utm_source=app#zapis";
