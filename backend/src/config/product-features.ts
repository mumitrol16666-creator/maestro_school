export const DEFAULT_PRODUCT_CUTOVER_AT = "2026-09-06T19:00:00.000Z";

export const PRODUCT_FEATURE_ENV = {
  learningTopicsV2: "FEATURE_LEARNING_TOPICS_V2",
  studentWorkspaceV2: "FEATURE_STUDENT_WORKSPACE_V2",
  homeworkFlowV2: "FEATURE_HOMEWORK_FLOW_V2",
  unifiedLessonV2: "FEATURE_UNIFIED_LESSON_V2",
  lessonSyncV2: "FEATURE_LESSON_SYNC_V2",
  rewardEconomyV2: "FEATURE_REWARD_ECONOMY_V2",
  curatorWorkspaceV2: "FEATURE_CURATOR_WORKSPACE_V2",
  learningDialogsV2: "FEATURE_LEARNING_DIALOGS_V2",
  roleNavigationV2: "FEATURE_ROLE_NAVIGATION_V2",
} as const;

export type ProductFeatureKey = keyof typeof PRODUCT_FEATURE_ENV;

export type ProductFeatureConfig = {
  cutoverAt: Date;
  flags: Record<ProductFeatureKey, boolean>;
};

function parseFeatureSwitch(value: string | undefined, envKey: string) {
  if (value === undefined || value.trim() === "") return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${envKey} must be a boolean switch`);
}

function parseCutoverAt(value: string | undefined) {
  const raw = value?.trim() || DEFAULT_PRODUCT_CUTOVER_AT;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error("PRODUCT_V2_CUTOVER_AT must include an explicit UTC offset");
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("PRODUCT_V2_CUTOVER_AT must be a valid ISO datetime");
  }
  return date;
}

export function loadProductFeatureConfig(
  source: Record<string, string | undefined> = process.env,
): ProductFeatureConfig {
  const flags = Object.fromEntries(
    Object.entries(PRODUCT_FEATURE_ENV).map(([feature, envKey]) => [
      feature,
      parseFeatureSwitch(source[envKey], envKey),
    ]),
  ) as Record<ProductFeatureKey, boolean>;

  return {
    cutoverAt: parseCutoverAt(source.PRODUCT_V2_CUTOVER_AT),
    flags,
  };
}

export const productFeatureConfig = loadProductFeatureConfig();

export function getProductFeatureSnapshot(config = productFeatureConfig) {
  return {
    cutoverAt: config.cutoverAt.toISOString(),
    timeZone: "Asia/Aqtobe",
    flags: { ...config.flags },
  };
}

export function rewardEconomyV2AppliesToEvent(
  eventAt: Date,
  config = productFeatureConfig,
) {
  return config.flags.rewardEconomyV2 && eventAt >= config.cutoverAt;
}
