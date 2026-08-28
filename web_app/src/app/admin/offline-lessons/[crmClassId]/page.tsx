"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Music,
  Plus,
  Sparkles,
  BookCheck,
  Check,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  LoaderCircle,
  Minus,
  Play,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Star,
  Target,
  UserX,
  UsersRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { SuccessModal } from "@/components/success-modal";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { isContentAdminRole, isOfflineCoordinatorRole } from "@/lib/role-labels";
import { adminOfflineApi } from "@/lib/admin-offline-api";
import { teacherOfflineApi } from "@/lib/teacher-offline-api";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import { MediaPicker } from "@/components/media-picker";
import type { CmsMedia } from "@/types/cms";
import type {
  OfflineHomeworkReview,
  TeacherOfflineClassStudents,
  TeacherOfflineStudent,
  TrialLessonReport,
} from "@/types/teacher-offline";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  not_filled: "Просрочен",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  cancelled: "Отменён",
};

const REPORT_SUBMISSION_LEAD_MINUTES = 20;

const summaryPresets = [
  "Разобрали вступление и аккорды",
  "Отработали ритм и бой",
  "Сыграли песню под метроном",
  "Закрепили переходы аккордов",
  "Поставили дыхание и распевки",
];

const homeworkPresets = [
  "Отработать песню под метроном",
  "Переходы аккордов 5 мин/день",
  "Доучить 1 куплет и припев",
  "Играть под оригинальный трек",
  "Упражнения на дыхание",
];

const teacherEditableLessonStatuses = new Set(["started", "not_filled"]);

const attendanceLabels: Record<string, string> = {
  unmarked: "Не отмечен",
  present: "Присутствовал",
  late: "Опоздал",
  excused_absence: "Уважительная причина",
  unexcused_absence: "Пропуск",
  emergency_freeze: "Экстренная заморозка",
};

const attendanceClasses: Record<string, string> = {
  unmarked: "bg-stone-100 text-stone-600",
  present: "bg-emerald-50 text-emerald-800",
  late: "bg-amber-50 text-amber-900",
  excused_absence: "bg-sky-50 text-sky-900",
  unexcused_absence: "bg-red-50 text-red-800",
  emergency_freeze: "bg-violet-50 text-violet-900",
};

const trialObjectionOptions = [
  ["price", "Цена"],
  ["schedule", "Расписание"],
  ["distance", "Далеко"],
  ["format", "Формат"],
  ["teacher", "Преподаватель"],
  ["child_interest", "Интерес ребенка"],
  ["thinking", "Думают"],
  ["other", "Другое"],
] as const;

type TrialSectionUpdater = <K extends keyof TrialLessonReport>(
  section: K,
  patch: NonNullable<TrialLessonReport[K]>,
) => void;

const defaultTrialReport: TrialLessonReport = {
  version: 2,
  attendance: { outcome: "attended", arrivedWith: "unknown", parentAccompanied: false, parentPresent: false },
  studentProfile: { priorExperience: "unknown", motivation: "unclear" },
  teacherAssessment: {
    interestLevel: null,
    contactLevel: null,
    focusLevel: null,
    rhythm: null,
    hearing: null,
    coordination: null,
    memory: null,
    techniqueBase: null,
    emotionalReadiness: null,
  },
  lessonFacts: {},
  recommendation: {
    recommendedFormat: "undecided",
    recommendedFrequency: "undecided",
    recommendedLevel: "beginner",
    nextStep: "manager_call",
  },
  salesSignals: {
    buyProbability: null,
    priceSensitivity: "unknown",
    scheduleFit: "unknown",
    parentObjections: [],
  },
  raw: {},
};

function mergeTrialReport(report?: TrialLessonReport | null): TrialLessonReport {
  return {
    ...defaultTrialReport,
    ...(report ?? {}),
    attendance: { ...defaultTrialReport.attendance, ...(report?.attendance ?? {}) },
    studentProfile: { ...defaultTrialReport.studentProfile, ...(report?.studentProfile ?? {}) },
    teacherAssessment: { ...defaultTrialReport.teacherAssessment, ...(report?.teacherAssessment ?? {}) },
    lessonFacts: { ...defaultTrialReport.lessonFacts, ...(report?.lessonFacts ?? {}) },
    recommendation: { ...defaultTrialReport.recommendation, ...(report?.recommendation ?? {}) },
    salesSignals: { ...defaultTrialReport.salesSignals, ...(report?.salesSignals ?? {}) },
    raw: { ...defaultTrialReport.raw, ...(report?.raw ?? {}) },
  };
}

function scoreFromInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function trialReportReady(report: TrialLessonReport) {
  // The teacher confirms only what was observed during the lesson. Sales
  // readiness, objections and follow-up belong to the manager and must not
  // block lesson submission.
  return Boolean(
    report.attendance?.outcome
      && report.teacherAssessment?.interestLevel
      && report.teacherAssessment?.contactLevel
      && report.lessonFacts?.whatWasTested?.trim()
      && report.lessonFacts?.whatWorkedWell?.trim()
  );
}

function lessonStartDateTime(date: string | Date, startTime: string) {
  const base = new Date(date);
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);
  base.setHours(hours, minutes, 0, 0);
  return base;
}

function lessonEndDateTime(date: string | Date, endTime: string) {
  const base = new Date(date);
  const [hours = 0, minutes = 0] = endTime.split(":").map(Number);
  base.setHours(hours, minutes, 0, 0);
  return base;
}

function formatClockTime(timestamp: number) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

type StudentLessonCheckDraft = {
  attendanceStatus: TeacherOfflineStudent["attendanceStatus"];
  teacherNote: string;
  homeworkReview: OfflineHomeworkReview;
  lessonPoints: number;
  monthlyPlanId: string | null;
  planTopicUpdates: Array<{ itemId: string; status: "in_progress" | "completed" }>;
};

type PreviousHomeworkSource = NonNullable<TeacherOfflineClassStudents["previousGroupHomework"]>;

function studentLessonCheckDraft(
  student: TeacherOfflineStudent,
  sourceOverride?: PreviousHomeworkSource | null,
): StudentLessonCheckDraft {
  const sourceLesson = sourceOverride === undefined ? previousHomeworkLesson(student) : sourceOverride;
  const review = normalizeHomeworkReview(student.homeworkReview);
  const isExactGroupSource = sourceOverride === undefined
    || !sourceLesson
    || review.sourceCrmClassId === sourceLesson.crmClassId;
  return {
    attendanceStatus: student.attendanceStatus ?? "unmarked",
    teacherNote: student.teacherNote ?? "",
    homeworkReview: {
      ...review,
      sourceCrmClassId: review.sourceCrmClassId ?? sourceLesson?.crmClassId ?? null,
      status: sourceLesson
        ? isExactGroupSource && review.status !== "not_assigned" ? review.status : "not_checked"
        : "not_assigned",
    },
    lessonPoints: student.lessonPoints ?? 100,
    monthlyPlanId: student.monthlyPlan?.id ?? student.monthlyPlanId ?? null,
    planTopicUpdates: student.planTopicUpdates ?? [],
  };
}

function previousHomeworkLesson(student: TeacherOfflineStudent) {
  return student.recentLessons?.find((lesson) => Boolean(lesson.homework?.trim())) ?? null;
}

function previousGroupHomeworkFromRoster(students: TeacherOfflineStudent[]): PreviousHomeworkSource | null {
  const byClassId = new Map<string, PreviousHomeworkSource>();
  for (const student of students) {
    for (const lesson of student.recentLessons ?? []) {
      const homework = lesson.homework?.trim();
      if (!homework || byClassId.has(lesson.crmClassId)) continue;
      byClassId.set(lesson.crmClassId, {
        crmClassId: lesson.crmClassId,
        date: lesson.date,
        title: lesson.title,
        topic: lesson.topic,
        homework,
        nextLessonFocus: lesson.nextLessonFocus,
      });
    }
  }
  return Array.from(byClassId.values()).sort((left, right) => (
    new Date(right.date).getTime() - new Date(left.date).getTime()
  ))[0] ?? null;
}

function alignDraftWithGroupHomework(
  draft: StudentLessonCheckDraft,
  source: PreviousHomeworkSource | null,
): StudentLessonCheckDraft {
  const review = normalizeHomeworkReview(draft.homeworkReview);
  if (!source) {
    return {
      ...draft,
      homeworkReview: {
        ...review,
        sourceCrmClassId: null,
        status: "not_assigned",
        completionPercent: null,
        difficulties: "",
        notCompletedReason: "",
      },
    };
  }
  const sameSource = review.sourceCrmClassId === source.crmClassId;
  return {
    ...draft,
    homeworkReview: {
      ...review,
      sourceCrmClassId: source.crmClassId,
      status: sameSource && review.status !== "not_assigned" ? review.status : "not_checked",
      completionPercent: sameSource ? review.completionPercent : null,
      difficulties: sameSource ? review.difficulties : "",
      notCompletedReason: sameSource ? review.notCompletedReason : "",
    },
  };
}

type FeedbackMessage = {
  title: string;
  description: string;
};

type LessonMaterialDraft = { type?: string; url: string; title?: string; description?: string | null };

type OfflineLessonFormDraft = {
  version: 1;
  lessonId: string;
  ownerId: string;
  updatedAt: number;
  form: {
    topic: string;
    lessonGoals: string;
    lessonSummary: string;
    homework: string;
    nextLessonFocus: string;
    materialsText: string;
    materialEntries: LessonMaterialDraft[];
    comment: string;
    trialReport: TrialLessonReport;
    studentCheckDrafts: Record<string, StudentLessonCheckDraft>;
    notHeldReason: string;
  };
};

type DraftSaveStatus =
  | { kind: "restored"; updatedAt: number }
  | { kind: "saved"; updatedAt: number }
  | { kind: "error" };

const OFFLINE_LESSON_DRAFT_PREFIX = "maestro:offline-lesson-report:v1";
const OFFLINE_LESSON_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readOfflineLessonDraft(
  key: string,
  lessonId: string,
  ownerId: string,
): OfflineLessonFormDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as OfflineLessonFormDraft;
    const isValid = draft?.version === 1
      && draft.lessonId === lessonId
      && draft.ownerId === ownerId
      && typeof draft.updatedAt === "number"
      && draft.form
      && typeof draft.form === "object";
    const isExpired = isValid && Date.now() - draft.updatedAt > OFFLINE_LESSON_DRAFT_TTL_MS;
    if (!isValid || isExpired) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // A blocked storage must never prevent the teacher from filling the lesson.
    }
    return null;
  }
}

export default function AdminOfflineLessonDetailPage() {
  const params = useParams<{ crmClassId: string }>();
  const crmClassId = params.crmClassId;
  const { user } = useAuth();
  const isAdmin = isOfflineCoordinatorRole(user?.role);
  const canActForTeacher = isContentAdminRole(user?.role);

  const lessonResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.classCard(crmClassId) : teacherOfflineApi.classCard(crmClassId)),
    [crmClassId, isAdmin],
  );
  const studentsResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.students(crmClassId) : teacherOfflineApi.students(crmClassId)),
    [crmClassId, isAdmin],
  );

  const [topic, setTopic] = useState("");
  const [lessonGoals, setLessonGoals] = useState("");
  const [lessonSummary, setLessonSummary] = useState("");
  const [homework, setHomework] = useState("");
  const [nextLessonFocus, setNextLessonFocus] = useState("");
  const [materialsText, setMaterialsText] = useState("");
  const [materialEntries, setMaterialEntries] = useState<LessonMaterialDraft[]>([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [trialReport, setTrialReport] = useState<TrialLessonReport>(() => mergeTrialReport());
  const [studentCheckDrafts, setStudentCheckDrafts] = useState<Record<string, StudentLessonCheckDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<FeedbackMessage | null>(null);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [notHeldOpen, setNotHeldOpen] = useState(false);
  const [notHeldReason, setNotHeldReason] = useState("");
  const [extraDetailsOpen, setExtraDetailsOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [submissionProgress, setSubmissionProgress] = useState<string | null>(null);
  const [hydratedLessonDraftKey, setHydratedLessonDraftKey] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus | null>(null);
  const submissionLock = useRef(false);
  const lastSavedDraftForm = useRef<string | null>(null);
  const lessonDraftKey = useMemo(
    () => user?.id
      ? `${OFFLINE_LESSON_DRAFT_PREFIX}:${user.id}:${crmClassId}`
      : null,
    [crmClassId, user?.id],
  );

  const lesson = lessonResource.data;
  const loadedStudents = studentsResource.data?.students ?? [];
  const isTrialLesson = lesson?.classType === "trial" || Boolean(lesson?.trialParticipant || lesson?.trialBooking);
  const hasLinkedStudent = Boolean(lesson?.crmIndividualStudentId);
  const trialLeadFallback = useMemo(() => {
    if (!lesson || !isTrialLesson || hasLinkedStudent) return null;
    return {
        crmStudentId: lesson.trialParticipant?.crmStudentId || `trial:${crmClassId}`,
        appUserId: lesson.trialParticipant?.appUserId ?? null,
        name: lesson.trialParticipant?.name
          || [lesson.trialBooking?.lastName, lesson.trialBooking?.name, lesson.trialBooking?.middleName]
            .filter(Boolean)
            .join(" ")
          || lesson.title?.replace(/^Пробный урок\s*[—-]\s*/i, "").trim()
          || "Клиент из заявки",
        firstName: lesson.trialParticipant?.firstName || lesson.trialBooking?.name || "",
        lastName: lesson.trialParticipant?.lastName || lesson.trialBooking?.lastName || "",
        middleName: lesson.trialParticipant?.middleName || lesson.trialBooking?.middleName || "",
        phone: lesson.trialParticipant?.phone || lesson.trialBooking?.phone || "",
        direction: lesson.trialParticipant?.direction || lesson.trialBooking?.direction || null,
        isLead: true,
        attended: null,
        attendanceStatus: "unmarked" as const,
    };
  }, [crmClassId, hasLinkedStudent, isTrialLesson, lesson]);
  const students = loadedStudents.length ? loadedStudents : trialLeadFallback ? [trialLeadFallback] : loadedStudents;
  const hasTrialRosterFallback = Boolean(trialLeadFallback);
  const isTrialReportReady = isTrialLesson ? trialReportReady(trialReport) : true;
  const availablePlanTopics = useMemo(() => {
    const list = [
      ...students.flatMap((s) => ("monthlyPlan" in s && s.monthlyPlan?.items ? s.monthlyPlan.items.map((i: { title: string }) => i.title) : [])),
      ...students.flatMap((s) => ("recentLessons" in s && s.recentLessons ? s.recentLessons.map((l: { topic?: string | null }) => l.topic || "") : [])),
    ].map((t) => t.trim()).filter(Boolean);
    return Array.from(new Set(list));
  }, [students]);
  const canEditTeacherReport = Boolean(
    lesson
      && teacherEditableLessonStatuses.has(lesson.status)
      && (!isAdmin || canActForTeacher),
  );
  const canEditAdminReview = isAdmin && lesson?.status === "pending_admin_review";
  const canEditReport = Boolean(canEditTeacherReport || canEditAdminReview);
  const canManageAttendance = canEditReport;
  const canApprove = isAdmin && lesson?.status === "pending_admin_review";
  const isNotHeld = lesson?.teacherOutcomeHint === "not_held";
  const isSubmittedAbsence = lesson?.teacherOutcomeHint === "no_submission";
  const isIndividualLesson = Boolean(
    !isTrialLesson
      && (
        lesson?.classType === "individual"
        || lesson?.crmIndividualStudentId
        || (!lesson?.group && students.length === 1)
      ),
  );
  const isCompactGroupLesson = Boolean(
    !isTrialLesson
      && !isIndividualLesson
      && (lesson?.group || studentsResource.data?.group),
  );
  const previousGroupHomework = useMemo(
    () => isCompactGroupLesson
      ? studentsResource.data?.previousGroupHomework ?? previousGroupHomeworkFromRoster(students)
      : null,
    [isCompactGroupLesson, students, studentsResource.data?.previousGroupHomework],
  );
  const draftFor = (student: TeacherOfflineStudent) => {
    const draft = studentCheckDrafts[student.crmStudentId]
      ?? studentLessonCheckDraft(student, isCompactGroupLesson ? previousGroupHomework : undefined);
    return isCompactGroupLesson ? alignDraftWithGroupHomework(draft, previousGroupHomework) : draft;
  };
  const unmarkedCount = students.filter((student) => draftFor(student).attendanceStatus === "unmarked").length;
  const hasPreviousHomework = isCompactGroupLesson
    ? Boolean(previousGroupHomework)
    : students.some((student) => Boolean(previousHomeworkLesson(student)));
  const homeworkReviewPendingCount = students.filter((student) =>
    (isCompactGroupLesson ? Boolean(previousGroupHomework) : Boolean(previousHomeworkLesson(student)))
      && ["present", "late"].includes(draftFor(student).attendanceStatus)
      && draftFor(student).homeworkReview.status === "not_checked",
  ).length;
  const allStudentsAbsent = students.length > 0 && students.every((student) => (
    ["excused_absence", "unexcused_absence", "emergency_freeze"].includes(draftFor(student).attendanceStatus)
  ));
  const isAbsenceOnly = Boolean(isSubmittedAbsence || (canEditTeacherReport && allStudentsAbsent));
  const requiresLessonReport = !isNotHeld && !isAbsenceOnly;
  const lessonEndsAt = lesson
    ? lessonEndDateTime(lesson.date, lesson.endTime).getTime()
    : null;
  const reportAvailableAt = lessonEndsAt == null
    ? null
    : lessonEndsAt - REPORT_SUBMISSION_LEAD_MINUTES * 60 * 1000;
  const submissionTimingIssue = canEditTeacherReport && lessonEndsAt != null && reportAvailableAt != null
    ? requiresLessonReport && clockNow < reportAvailableAt
      ? `Полный отчёт можно отправить с ${formatClockTime(reportAvailableAt)} — за ${REPORT_SUBMISSION_LEAD_MINUTES} минут до окончания урока.`
      : !requiresLessonReport && clockNow < lessonEndsAt
        ? `Отметку об отсутствии можно передать после окончания урока в ${formatClockTime(lessonEndsAt)}.`
        : null
    : null;
  const canShowStartPrompt = Boolean(
    !isAdmin
      && lesson?.status === "scheduled"
      && lessonStartDateTime(lesson.date, lesson.startTime).getTime() - Date.now() <= 15 * 60 * 1000,
  );

  useEffect(() => {
    if (!lesson) return;
    if (lesson.topic) setTopic(lesson.topic);
    if (lesson.lessonGoals) setLessonGoals(lesson.lessonGoals);
    if (lesson.lessonSummary) setLessonSummary(lesson.lessonSummary);
    if (lesson.homeworkDraft) setHomework(lesson.homeworkDraft);
    if (lesson.nextLessonFocus) setNextLessonFocus(lesson.nextLessonFocus);
    if (lesson.materials) {
      setMaterialsText(lesson.materials.map((item) => item.url || item.title || "").filter(Boolean).join("\n"));
      setMaterialEntries(lesson.materials.filter((item) => item.url).map((item) => ({
        type: item.type,
        url: item.url!,
        title: item.title,
      })));
    }
    if (lesson.teacherComment) setComment(lesson.teacherComment);
    if (isTrialLesson) {
      setTrialReport(mergeTrialReport(lesson.trialReport));
    }
  }, [isTrialLesson, lesson]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadedStudents = studentsResource.data?.students;
    if (!loadedStudents?.length && !trialLeadFallback) return;
    const roster = loadedStudents?.length ? loadedStudents : trialLeadFallback ? [trialLeadFallback] : [];
    setStudentCheckDrafts((current) => {
      const next: Record<string, StudentLessonCheckDraft> = {};
      for (const student of roster) {
        const draft = current[student.crmStudentId]
          ?? studentLessonCheckDraft(student, isCompactGroupLesson ? previousGroupHomework : undefined);
        next[student.crmStudentId] = isCompactGroupLesson
          ? alignDraftWithGroupHomework(draft, previousGroupHomework)
          : draft;
      }
      return next;
    });
  }, [isCompactGroupLesson, previousGroupHomework, studentsResource.data, trialLeadFallback]);

  useEffect(() => {
    if (
      !lesson
      || !user?.id
      || !lessonDraftKey
      || studentsResource.loading
      || hydratedLessonDraftKey === lessonDraftKey
    ) {
      return;
    }

    if (!canEditReport) {
      try {
        window.localStorage.removeItem(lessonDraftKey);
      } catch {
        // Storage can be unavailable in a restricted WebView.
      }
      lastSavedDraftForm.current = null;
      setDraftSaveStatus(null);
      setHydratedLessonDraftKey(lessonDraftKey);
      return;
    }

    const savedDraft = readOfflineLessonDraft(lessonDraftKey, crmClassId, user.id);
    if (savedDraft) {
      const saved = savedDraft.form;
      setTopic(saved.topic ?? "");
      setLessonGoals(saved.lessonGoals ?? "");
      setLessonSummary(saved.lessonSummary ?? "");
      setHomework(saved.homework ?? "");
      setNextLessonFocus(saved.nextLessonFocus ?? "");
      setMaterialsText(saved.materialsText ?? "");
      setMaterialEntries(Array.isArray(saved.materialEntries) ? saved.materialEntries : []);
      setComment(saved.comment ?? "");
      setTrialReport(mergeTrialReport(saved.trialReport));
      setNotHeldReason(saved.notHeldReason ?? "");
      setStudentCheckDrafts((current) => {
        const next = { ...current };
        for (const student of students) {
          const storedStudent = saved.studentCheckDrafts?.[student.crmStudentId];
          if (!storedStudent) continue;
          const baseline = studentLessonCheckDraft(
            student,
            isCompactGroupLesson ? previousGroupHomework : undefined,
          );
          const storedReview = normalizeHomeworkReview(storedStudent.homeworkReview);
          const restoredSourceClassId = isCompactGroupLesson
            ? storedReview.sourceCrmClassId ?? null
            : storedReview.sourceCrmClassId ?? baseline.homeworkReview.sourceCrmClassId ?? null;
          const restoredDraft: StudentLessonCheckDraft = {
            ...baseline,
            ...storedStudent,
            homeworkReview: {
              ...storedReview,
              sourceCrmClassId: restoredSourceClassId,
              status: restoredSourceClassId
                && !storedReview.sourceCrmClassId
                && storedReview.status === "not_assigned"
                ? "not_checked"
                : storedReview.status,
            },
            planTopicUpdates: Array.isArray(storedStudent.planTopicUpdates)
              ? storedStudent.planTopicUpdates
              : [],
          };
          next[student.crmStudentId] = isCompactGroupLesson
            ? alignDraftWithGroupHomework(restoredDraft, previousGroupHomework)
            : restoredDraft;
        }
        return next;
      });
      lastSavedDraftForm.current = JSON.stringify(saved);
      setDraftSaveStatus({ kind: "restored", updatedAt: savedDraft.updatedAt });
    } else {
      setTopic(lesson.topic ?? "");
      setLessonGoals(lesson.lessonGoals ?? "");
      setLessonSummary(lesson.lessonSummary ?? "");
      setHomework(lesson.homeworkDraft ?? "");
      setNextLessonFocus(lesson.nextLessonFocus ?? "");
      setMaterialsText(
        lesson.materials?.map((item) => item.url || item.title || "").filter(Boolean).join("\n") ?? "",
      );
      setMaterialEntries(
        lesson.materials?.filter((item) => item.url).map((item) => ({
          type: item.type,
          url: item.url!,
          title: item.title,
        })) ?? [],
      );
      setComment(lesson.teacherComment ?? "");
      setTrialReport(isTrialLesson ? mergeTrialReport(lesson.trialReport) : mergeTrialReport());
      setNotHeldReason("");
      setStudentCheckDrafts(Object.fromEntries(
        students.map((student) => [
          student.crmStudentId,
          studentLessonCheckDraft(student, isCompactGroupLesson ? previousGroupHomework : undefined),
        ]),
      ));
      lastSavedDraftForm.current = null;
      setDraftSaveStatus(null);
    }
    setHydratedLessonDraftKey(lessonDraftKey);
  }, [
    canEditReport,
    crmClassId,
    hydratedLessonDraftKey,
    lesson,
    lessonDraftKey,
    isTrialLesson,
    isCompactGroupLesson,
    previousGroupHomework,
    students,
    studentsResource.loading,
    user?.id,
  ]);

  useEffect(() => {
    if (
      !lesson
      || !user?.id
      || !lessonDraftKey
      || !canEditReport
      || hydratedLessonDraftKey !== lessonDraftKey
    ) {
      return;
    }

    const form: OfflineLessonFormDraft["form"] = {
      topic,
      lessonGoals,
      lessonSummary,
      homework,
      nextLessonFocus,
      materialsText,
      materialEntries,
      comment,
      trialReport,
      studentCheckDrafts,
      notHeldReason,
    };
    const serializedForm = JSON.stringify(form);
    if (serializedForm === lastSavedDraftForm.current) return;

    const updatedAt = Date.now();
    const draft: OfflineLessonFormDraft = {
      version: 1,
      lessonId: crmClassId,
      ownerId: user.id,
      updatedAt,
      form,
    };
    try {
      window.localStorage.setItem(lessonDraftKey, JSON.stringify(draft));
      lastSavedDraftForm.current = serializedForm;
      setDraftSaveStatus({ kind: "saved", updatedAt });
    } catch {
      setDraftSaveStatus({ kind: "error" });
    }
  }, [
    canEditReport,
    comment,
    crmClassId,
    homework,
    hydratedLessonDraftKey,
    lesson,
    lessonDraftKey,
    lessonGoals,
    lessonSummary,
    materialEntries,
    materialsText,
    nextLessonFocus,
    notHeldReason,
    studentCheckDrafts,
    topic,
    trialReport,
    user?.id,
  ]);

  function clearOfflineLessonDraft() {
    if (lessonDraftKey) {
      try {
        window.localStorage.removeItem(lessonDraftKey);
      } catch {
        // The report is already on the server; a storage cleanup failure is harmless.
      }
    }
    lastSavedDraftForm.current = null;
    setDraftSaveStatus(null);
  }

  const updateTrialSection: TrialSectionUpdater = function updateTrialSection<K extends keyof TrialLessonReport>(
    section: K,
    patch: NonNullable<TrialLessonReport[K]>,
  ) {
    setTrialReport((current) => ({
      ...current,
      [section]: {
        ...((current[section] ?? {}) as object),
        ...(patch as object),
      },
    }));
  };

  function toggleTrialObjection(value: string) {
    setTrialReport((current) => {
      const selected = new Set(current.salesSignals?.parentObjections ?? []);
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }
      return {
        ...current,
        salesSignals: {
          ...current.salesSignals,
          parentObjections: Array.from(selected),
        },
      };
    });
  }

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      await Promise.allSettled([lessonResource.reload(), studentsResource.reload()]);
      if (action === "submit") {
        setSuccess({
          title: "Урок отправлен на проверку",
          description: canActForTeacher
            ? "Отчёт сохранён за назначенного преподавателя. Теперь урок можно проверить и подтвердить."
            : "Посещаемость, результат домашнего задания и отчёт сохранены. Администратор проверит урок и опубликует новое задание ученику.",
        });
      } else if (action === "submit-absence") {
        setSuccess({
          title: "Отсутствие передано администратору",
          description: "Отметка посещаемости сохранена. Отчёт по уроку и домашнее задание заполнять не нужно.",
        });
      } else if (action === "not-held") {
        setSuccess({
          title: "Урок отмечен как несостоявшийся",
          description: "Причина сохранена в истории. Администратор увидит отметку и проверит её.",
        });
      } else if (action === "start") {
        setSuccess({
          title: "Урок начат",
          description: "Теперь можно отметить посещаемость, проверить прошлое домашнее задание и заполнить итог урока.",
        });
      } else if (action === "approve") {
        setSuccess({
          title: "Урок подтверждён",
          description: "Итоги опубликованы для ученика. Черновик сообщения готовится в разделе WhatsApp-напоминаний CRM.",
        });
      } else if (action === "return") {
        setSuccess({
          title: "Урок возвращён преподавателю",
          description: "Преподаватель сможет исправить отчёт и снова отправить его на проверку.",
        });
      } else if (action === "withdraw") {
        setSuccess({
          title: "Урок снова доступен для редактирования",
          description: "Исправьте данные и повторно отправьте урок на проверку.",
        });
      } else if (action === "reopen") {
        setSuccess({
          title: "Урок открыт повторно",
          description: "Теперь его можно проверить и оформить заново.",
        });
      }
      return true;
    } catch (reason) {
      if (action === "submit" || action === "submit-absence") {
        const refreshedLesson = await (isAdmin
          ? adminOfflineApi.classCard(crmClassId)
          : teacherOfflineApi.classCard(crmClassId)
        ).catch(() => null);
        if (refreshedLesson?.status === "pending_admin_review") {
          lessonResource.setData(refreshedLesson);
          await studentsResource.reload();
          setSuccess({
            title: action === "submit-absence" ? "Отсутствие передано администратору" : "Урок отправлен на проверку",
            description: "Ответ сервера прервался, но CRM подтвердила, что данные сохранены.",
          });
          return true;
        }
      }
      setError(reason instanceof ApiError ? reason.message : "Не удалось выполнить действие");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function submissionValidationError() {
    if (studentsResource.error && !hasTrialRosterFallback) {
      return "Не удалось загрузить учеников. Обновите список перед отправкой.";
    }
    if (!students.length) {
      return "В уроке не найден ученик. Обновите страницу или обратитесь к администратору.";
    }
    if (unmarkedCount > 0) {
      return `Отметьте посещаемость у всех учеников. Осталось: ${unmarkedCount}.`;
    }
    if (allStudentsAbsent) return null;
    if (homeworkReviewPendingCount > 0) {
      return "Укажите, как выполнено прошлое домашнее задание.";
    }

    for (const student of students) {
      const draft = draftFor(student);
      if (!["present", "late"].includes(draft.attendanceStatus)) continue;
      if (draft.homeworkReview.status === "partial" && !draft.homeworkReview.difficulties?.trim()) {
        return `Укажите для ${student.name}, что осталось доделать по домашнему заданию.`;
      }
      if (
        draft.homeworkReview.status === "not_completed"
        && !draft.homeworkReview.notCompletedReason?.trim()
      ) {
        return `Укажите причину невыполненного домашнего задания для ${student.name}.`;
      }
    }

    if (isTrialLesson && !isTrialReportReady) {
      return "Заполните обязательные пункты анкеты пробного урока.";
    }
    if (!isTrialLesson && !topic.trim()) return "Укажите тему урока.";
    if (!isTrialLesson && !lessonSummary.trim()) return "Заполните итог урока.";
    return null;
  }

  async function saveStudentChecks({ showProgress = false }: { showProgress?: boolean } = {}) {
    if (!isAdmin) {
      const checks = students.map((student) => {
        const draft = draftFor(student);
        const attended = ["present", "late"].includes(draft.attendanceStatus);
        return {
          studentId: student.crmStudentId,
          attendanceStatus: draft.attendanceStatus,
          teacherNote: draft.teacherNote.trim() || undefined,
          homeworkReview: !isTrialLesson && attended ? draft.homeworkReview : undefined,
          lessonPoints: attended ? draft.lessonPoints : 0,
          monthlyPlanId: attended ? draft.monthlyPlanId : null,
          planTopicUpdates: attended ? draft.planTopicUpdates : [],
        };
      });
      if (showProgress) {
        setSubmissionProgress(`Последовательно сохраняем данные ${checks.length} ученик(ов)…`);
      }
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await teacherOfflineApi.attendanceBatch(crmClassId, checks);
          return;
        } catch (reason) {
          const retryable = reason instanceof ApiError
            && [0, 408, 429, 502, 503, 504].includes(reason.status);
          if (!retryable || attempt === 2) throw reason;
          if (showProgress) setSubmissionProgress("Связь нестабильна. Повторяем сохранение…");
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
      }
      return;
    }

    for (let index = 0; index < students.length; index += 1) {
      const student = students[index];
      const draft = draftFor(student);
      const attended = ["present", "late"].includes(draft.attendanceStatus);
      const homeworkReview = !isTrialLesson && attended ? draft.homeworkReview : undefined;
      const saveAttendance = () => adminOfflineApi.attendance(
            crmClassId,
            student.crmStudentId,
            draft.attendanceStatus,
            draft.teacherNote.trim() || undefined,
            homeworkReview,
            {
              lessonPoints: attended ? draft.lessonPoints : 0,
              monthlyPlanId: attended ? draft.monthlyPlanId : null,
              planTopicUpdates: attended ? draft.planTopicUpdates : [],
            },
          );

      if (showProgress) {
        setSubmissionProgress(`Сохраняем ученика ${index + 1} из ${students.length}: ${student.name}`);
      }

      let saved = false;
      for (let attempt = 1; attempt <= 2 && !saved; attempt += 1) {
        try {
          await saveAttendance();
          saved = true;
        } catch (reason) {
          const retryable = reason instanceof ApiError
            && [0, 408, 429, 502, 503, 504].includes(reason.status);
          if (!retryable || attempt === 2) {
            throw new ApiError(
              `Не удалось сохранить данные ученика ${student.name}. Нажмите «Отправить» ещё раз — уже сохранённые отметки не потеряются.`,
              reason instanceof ApiError ? reason.status : 0,
              reason instanceof ApiError ? reason.code : "ATTENDANCE_SAVE_FAILED",
            );
          }
          if (showProgress) {
            setSubmissionProgress(`Связь нестабильна. Повторяем сохранение для ${student.name}…`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 900));
        }
      }
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = submissionValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitConfirmationOpen(true);
  }

  async function confirmSubmit() {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmissionProgress("Подготавливаем отправку…");
    const absenceOnly = allStudentsAbsent;
    try {
      const submitted = await runAction(absenceOnly ? "submit-absence" : "submit", async () => {
        await saveStudentChecks({ showProgress: true });
        setSubmissionProgress("Отметки сохранены. Отправляем отчёт администратору…");
        const payload = {
          topic: isTrialLesson || absenceOnly ? undefined : topic.trim(),
          lessonGoals: absenceOnly ? undefined : lessonGoals.trim() || undefined,
          lessonSummary: isTrialLesson || absenceOnly ? undefined : lessonSummary.trim(),
          homeworkDraft: isTrialLesson || absenceOnly ? undefined : homework.trim(),
          nextLessonFocus: isTrialLesson || absenceOnly ? undefined : nextLessonFocus.trim() || undefined,
          materials: absenceOnly ? undefined : materialsText
            .split("\n")
            .map((url) => url.trim())
            .filter(Boolean)
            .map((url) => materialEntries.find((item) => item.url === url) ?? ({ type: "link", url, title: url })),
          comment: absenceOnly ? undefined : comment.trim() || undefined,
          trialReport: isTrialLesson && !absenceOnly
            ? { ...trialReport, capturedAt: new Date().toISOString() }
            : undefined,
          teacherOutcomeHint: absenceOnly ? "no_submission" as const : "held" as const,
        };
        return canActForTeacher
          ? adminOfflineApi.submitForTeacher(crmClassId, payload)
          : teacherOfflineApi.submit(crmClassId, payload);
      });
      if (submitted) {
        clearOfflineLessonDraft();
        setSubmitConfirmationOpen(false);
      }
    } finally {
      submissionLock.current = false;
      setSubmissionProgress(null);
    }
  }

  async function confirmNotHeld() {
    const reason = notHeldReason.trim();
    if (reason.length < 3) return;
    setNotHeldOpen(false);
    const submitted = await runAction(
      "not-held",
      () => canActForTeacher
        ? adminOfflineApi.notHeldForTeacher(crmClassId, reason)
        : teacherOfflineApi.notHeld(crmClassId, reason),
    );
    if (submitted) clearOfflineLessonDraft();
    setNotHeldReason("");
  }

  async function handleApprove() {
    if (requiresLessonReport && unmarkedCount > 0) {
      setError(`Отметьте посещаемость у всех учеников (осталось: ${unmarkedCount})`);
      return;
    }
    if (requiresLessonReport && homeworkReviewPendingCount > 0) {
      setError("Зафиксируйте выполнение прошлого домашнего задания");
      return;
    }
    const approved = await runAction("approve", async () => {
      if (!isNotHeld) await saveStudentChecks();
      return adminOfflineApi.approve(crmClassId, {
        deduct: !isNotHeld,
        topic: topic.trim() || undefined,
        lessonGoals: lessonGoals.trim() || undefined,
        lessonSummary: lessonSummary.trim() || undefined,
        homeworkDraft: homework.trim() || undefined,
        nextLessonFocus: nextLessonFocus.trim() || undefined,
        teacherComment: comment.trim() || undefined,
        trialReport: isTrialLesson
          ? { ...trialReport, capturedAt: trialReport.capturedAt ?? new Date().toISOString() }
          : undefined,
        materials: materialsText
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => materialEntries.find((item) => item.url === url) ?? ({ type: "link", url, title: url })),
      });
    });
    if (approved) clearOfflineLessonDraft();
  }

  function askReason(message: string) {
    if (!window.confirm(message)) return null;
    const reason = window.prompt("Коротко объясните причину:")?.trim();
    if (!reason || reason.length < 3) {
      setError("Напишите причину изменения");
      return null;
    }
    return reason;
  }

  if (lessonResource.loading || studentsResource.loading) {
    return <LoadingState label="Загружаем карточку урока" />;
  }

  if (lessonResource.error || !lesson) {
    return <ErrorState message={lessonResource.error ?? "Урок не найден"} retry={lessonResource.reload} />;
  }
  const teacherSubmissionIssue = canEditTeacherReport
    ? submissionTimingIssue ?? submissionValidationError()
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-урок"
        title={lesson.title}
        description={`${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(lesson.date))} · ${lesson.startTime}–${lesson.endTime}`}
        action={
          <Link href="/admin/offline-lessons" className="text-sm font-bold text-gold hover:underline">
            ← К расписанию
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <span className="rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-stone-700">
          {isSubmittedAbsence ? "Отсутствие отмечено" : (statusLabels[lesson.status] ?? lesson.status)}
        </span>
        {lesson.group?.name ? (
          <span className="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
            {lesson.group.name}
          </span>
        ) : null}
        {lesson.room?.name ? (
          <span className="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold text-sky-900">
            {lesson.room.name}
          </span>
        ) : null}
        {lesson.teacher?.name ? (
          <span className="rounded-full bg-violet-50 px-4 py-2 text-xs font-bold text-violet-900">
            Преподаватель: {lesson.teacher.name}
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-800">
            Преподаватель не назначен
          </span>
        )}
      </div>

      {canActForTeacher && lesson.teacher?.name && ["scheduled", ...teacherEditableLessonStatuses].includes(lesson.status) ? (
        <div className="mb-6 rounded-[24px] border border-violet-200 bg-violet-50 p-5">
          <p className="text-sm font-bold text-violet-950">
            Вы работаете за преподавателя: {lesson.teacher.name}
          </p>
          <p className="mt-2 text-sm leading-6 text-violet-900/75">
            Отчёт и посещаемость будут записаны в этот урок. Преподаватель урока и его начисления не изменятся.
          </p>
        </div>
      ) : null}

      {isNotHeld ? (
        <div className="mb-6 rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-900">Преподаватель отметил: урок не состоялся</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-800/80">
            {lesson.teacherComment || "Причина не указана."}
          </p>
          <p className="mt-2 text-xs font-semibold text-red-700">
            С ученика не будет списано занятие. Если отметка ошибочна, верните урок преподавателю.
          </p>
        </div>
      ) : null}

      {isSubmittedAbsence ? (
        <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-bold text-amber-950">Преподаватель отметил отсутствие ученика</p>
          <p className="mt-2 text-sm leading-6 text-amber-900/75">
            Обычный отчёт по уроку не требуется. Проверьте посещаемость и подтвердите отметку.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mb-7">
        <StudentRoster
          students={students}
          compactGroup={isCompactGroupLesson}
          previousGroupHomework={previousGroupHomework}
          canManageAttendance={canManageAttendance}
          canSetExcusedAbsence={isAdmin}
          canEdit={canEditReport}
          showHomeworkReview={hasPreviousHomework}
          showLearningResult={!isTrialLesson}
          drafts={Object.fromEntries(students.map((student) => [student.crmStudentId, draftFor(student)]))}
          studentsError={studentsResource.error}
          onRetryStudents={studentsResource.reload}
          onSelectTopic={(selected) => {
            setTopic(selected);
            if (!lessonSummary) setLessonSummary(`Разобрали тему «${selected}»`);
          }}
          onDraftChange={(studentId, draft) => {
            setStudentCheckDrafts((current) => ({ ...current, [studentId]: draft }));
          }}
        />
      </div>

      <div className="grid gap-7 xl:grid-cols-[1fr_420px]">
        <section className="order-last xl:order-none space-y-7">
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-3xl">
              {isAbsenceOnly ? "Отметка отсутствия" : "Отчёт по уроку"}
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              {isAbsenceOnly
                ? "Все ученики отмечены отсутствующими. Тему, итог и домашнее задание заполнять не нужно."
                : isTrialLesson
                ? "Заполните диагностическую анкету пробного. Ответы помогут подготовить анализ и план обучения."
                : isAdmin
                ? "Проверьте отчёт преподавателя, при необходимости отредактируйте и подтвердите урок."
                : "Заполните тему, итог и домашнее задание. Ученик увидит материалы после подтверждения администратором."}
            </p>

            {canEditReport && hydratedLessonDraftKey === lessonDraftKey ? (
              <div
                className={`mt-4 flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${
                  draftSaveStatus?.kind === "error"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-100 bg-emerald-50 text-emerald-800"
                }`}
              >
                {draftSaveStatus?.kind === "error"
                  ? <AlertTriangle size={15} className="shrink-0" />
                  : <Save size={15} className="shrink-0" />}
                <span>
                  {draftSaveStatus?.kind === "restored"
                    ? "Черновик восстановлен. Новые изменения сохраняются автоматически."
                    : draftSaveStatus?.kind === "saved"
                      ? `Черновик сохранён автоматически в ${formatClockTime(draftSaveStatus.updatedAt)}.`
                      : draftSaveStatus?.kind === "error"
                        ? "Не удалось сохранить черновик на устройстве. Не закрывайте приложение до отправки."
                        : "Автосохранение черновика включено."}
                </span>
              </div>
            ) : null}

            {isAbsenceOnly ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                Администратор получит только отметку о том, что ученик не пришёл. Обычный отчёт по уроку не создаётся.
              </div>
            ) : null}

            <div className={isAbsenceOnly ? "hidden" : ""}>
            {isTrialLesson ? (
              <TrialReportEditor
                report={trialReport}
                disabled={!canEditReport}
                isAdmin={isAdmin}
                updateSection={updateTrialSection}
                toggleObjection={toggleTrialObjection}
              />
            ) : (
              <>
                {availablePlanTopics.length > 0 ? (
                  <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-violet-900">
                      <Sparkles size={14} className="text-violet-600" />
                      Быстрый выбор темы из плана месяца:
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {availablePlanTopics.map((item) => (
                        <button
                          key={item}
                          type="button"
                          disabled={!canEditReport}
                          onClick={() => {
                            setTopic(item);
                            if (!lessonSummary) {
                              setLessonSummary(`Разобрали тему «${item}»`);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                            topic === item
                              ? "bg-violet-700 text-white shadow-xs"
                              : "border border-violet-200 bg-white text-violet-900 hover:bg-violet-100/80"
                          }`}
                        >
                          <Music size={12} />
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Тема урока
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    disabled={!canEditReport}
                    rows={2}
                    className="mt-2 min-h-16 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    placeholder="Какую песню или тему разбирали сегодня?"
                  />
                </label>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                      Что сделали на уроке (Итог)
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summaryPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!canEditReport}
                        onClick={() => {
                          setLessonSummary((curr) => curr ? `${curr}. ${preset}` : preset);
                        }}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={lessonSummary}
                    onChange={(event) => setLessonSummary(event.target.value)}
                    disabled={!canEditReport}
                    rows={3}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    placeholder="Что получилось, что разобрали, какой результат занятия?"
                  />
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                      Домашнее задание
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {homeworkPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!canEditReport}
                        onClick={() => {
                          setHomework((curr) => curr ? `${curr}. ${preset}` : preset);
                        }}
                        className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={homework}
                    onChange={(event) => setHomework(event.target.value)}
                    disabled={!canEditReport}
                    rows={3}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    placeholder="Что отработать дома до следующего урока?"
                  />
                </div>

                <div className="mt-6 border-t border-stone-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setExtraDetailsOpen(!extraDetailsOpen)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 transition hover:text-ink"
                  >
                    {extraDetailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {extraDetailsOpen
                      ? "Скрыть дополнительные поля"
                      : "+ Дополнительные детали (Цели, фокус следующего, материалы, комментарий админу)"}
                  </button>

                  {extraDetailsOpen ? (
                    <div className="mt-4 space-y-4 rounded-2xl border border-stone-100 bg-stone-50/60 p-4">
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                        Цель урока
                        <textarea
                          value={lessonGoals}
                          onChange={(event) => setLessonGoals(event.target.value)}
                          disabled={!canEditReport}
                          rows={2}
                          className="mt-2 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="Что планировали освоить?"
                        />
                      </label>

                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                        Фокус следующего урока
                        <textarea
                          value={nextLessonFocus}
                          onChange={(event) => setNextLessonFocus(event.target.value)}
                          disabled={!canEditReport}
                          rows={2}
                          className="mt-2 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="С чего продолжить на следующем занятии?"
                        />
                      </label>

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                            Материалы и ссылки
                          </label>
                          <button
                            type="button"
                            onClick={() => setMediaPickerOpen(true)}
                            disabled={!canEditReport}
                            className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-gold disabled:opacity-50"
                          >
                            Выбрать из медиатеки
                          </button>
                        </div>
                        <textarea
                          value={materialsText}
                          onChange={(event) => setMaterialsText(event.target.value)}
                          disabled={!canEditReport}
                          rows={2}
                          className="mt-2 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="Одна ссылка на строку или выберите файл из медиатеки"
                        />
                      </div>

                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                        Комментарий для админа
                        <textarea
                          value={comment}
                          onChange={(event) => setComment(event.target.value)}
                          disabled={!canEditReport}
                          rows={2}
                          className="mt-2 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="Замечания по ученикам, сложности, рекомендации — всё, что важно для администратора"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </>
            )}
            </div>

            {canEditTeacherReport ? (
              <div className="mt-6">
                <button
                  type="submit"
                  disabled={!canEditTeacherReport || busy != null || Boolean(teacherSubmissionIssue)}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
                >
                  {["submit", "submit-absence"].includes(busy ?? "") ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                  {allStudentsAbsent
                    ? "Передать отметку об отсутствии"
                    : canActForTeacher
                      ? "Сдать за преподавателя"
                      : "Отправить на проверку"}
                </button>
                {teacherSubmissionIssue ? (
                  <p className="mt-3 max-w-xl text-sm font-semibold text-amber-800">{teacherSubmissionIssue}</p>
                ) : null}
              </div>
            ) : null}
          </form>

        </section>

        <aside className="order-first xl:order-none space-y-4">
          {lesson.status === "scheduled" && (!isAdmin || canActForTeacher) ? (
            <button
              disabled={busy != null || !lesson.teacher?.crmTeacherId}
              onClick={() => void runAction(
                "start",
                () => canActForTeacher
                  ? adminOfflineApi.startForTeacher(crmClassId)
                  : teacherOfflineApi.start(crmClassId),
              )}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "start" ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}
              {canActForTeacher ? "Начать за преподавателя" : "Начать урок"}
            </button>
          ) : null}

          {canApprove ? (
            <button
              disabled={
                busy != null
                  || (requiresLessonReport && (
                    unmarkedCount > 0
                      || homeworkReviewPendingCount > 0
                      || (isTrialLesson ? !isTrialReportReady : (!topic.trim() || !lessonSummary.trim()))
                  ))
              }
              onClick={() => void handleApprove()}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "approve" ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              {isSubmittedAbsence ? "Подтвердить отсутствие" : "Подтвердить урок"}
            </button>
          ) : null}

          {canApprove ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason("Вернуть урок преподавателю для исправления?");
                if (reason) void runAction("return", () => adminOfflineApi.returnToTeacher(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 disabled:opacity-50"
            >
              {busy === "return" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Вернуть преподавателю
            </button>
          ) : null}

          {!isAdmin && lesson.status === "pending_admin_review" ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason("Отозвать отправленный урок и снова открыть редактирование?");
                if (reason) void runAction("withdraw", () => teacherOfflineApi.withdraw(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 disabled:opacity-50"
            >
              {busy === "withdraw" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Отозвать и исправить
            </button>
          ) : null}

          {isAdmin && ["completed", "cancelled"].includes(lesson.status) ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason(
                  lesson.status === "cancelled"
                    ? "Восстановить отменённый урок в расписании?"
                    : "Открыть подтверждённый урок повторно? Все списания будут возвращены.",
                );
                if (reason) void runAction("reopen", () => adminOfflineApi.reopen(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-violet-300 bg-violet-50 px-5 py-4 text-sm font-bold text-violet-900 disabled:opacity-50"
            >
              {busy === "reopen" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              {lesson.status === "cancelled" ? "Восстановить урок" : "Пересмотреть урок"}
            </button>
          ) : null}

          {canApprove && !isNotHeld && unmarkedCount > 0 ? (
            <p className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Перед подтверждением отметьте посещаемость у {unmarkedCount} ученик(ов).
            </p>
          ) : null}

          {lesson.status === "pending_admin_review" ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
                <CheckCircle2 size={16} />
                {isSubmittedAbsence ? "Отсутствие отмечено" : isNotHeld ? "Урок не состоялся" : "Отправлено на проверку"}
              </p>
              <p className="mt-2 text-sm text-amber-800/80">
                {isSubmittedAbsence
                  ? isAdmin
                    ? "Проверьте отметку посещаемости. Тема, итог и домашнее задание не требуются."
                    : "Администратор получил отметку об отсутствии. Отчёт по уроку заполнять не нужно."
                  : isAdmin
                  ? "Проверьте посещаемость и результат прошлого ДЗ, затем подтвердите урок."
                  : "Посещаемость и проверка прошлого ДЗ сохранены. Администратор подтвердит урок и опубликует новое задание."}
              </p>
            </div>
          ) : null}

          {lesson.status === "completed" && lesson.topic ? (
            <div className="rounded-[24px] border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Опубликовано</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">{lesson.topic}</p>
              {lesson.homeworkDraft ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-600">{lesson.homeworkDraft}</p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {canEditTeacherReport ? (
        <section className="mt-8 flex flex-col gap-4 border-t border-stone-200 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-stone-700">Урок не проводился по причине школы или преподавателя?</p>
            <p className="mt-1 text-sm text-stone-500">
              Если ученик не пришёл, отметьте «Не пришёл» в посещаемости. Это действие для других причин отмены.
            </p>
          </div>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => setNotHeldOpen(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
          >
            {busy === "not-held" ? <LoaderCircle className="animate-spin" size={16} /> : <XCircle size={16} />}
            Урок не состоялся
          </button>
        </section>
      ) : null}

      <SubmitLessonConfirmation
        open={submitConfirmationOpen}
        lesson={lesson}
        studentsCount={students.length}
        absenceOnly={allStudentsAbsent}
        busy={["submit", "submit-absence"].includes(busy ?? "")}
        progress={submissionProgress}
        error={error}
        onClose={() => setSubmitConfirmationOpen(false)}
        onConfirm={() => void confirmSubmit()}
      />

      <NotHeldConfirmation
        open={notHeldOpen}
        lesson={lesson}
        reason={notHeldReason}
        busy={busy === "not-held"}
        onReasonChange={setNotHeldReason}
        onClose={() => {
          setNotHeldOpen(false);
          setNotHeldReason("");
        }}
        onConfirm={() => void confirmNotHeld()}
      />

      {canShowStartPrompt && lesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-md">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-stone-200 bg-paper p-6 shadow-2xl sm:p-8">
            <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Play className="fill-emerald-600 text-emerald-600" size={32} />
              </div>
              <h3 className="font-display text-2xl font-bold text-stone-900">Начать урок</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">
                Вы собираетесь начать офлайн-урок <strong className="text-stone-700">{lesson.title}</strong>.
                {lesson.group?.name ? ` Группа: ${lesson.group.name}.` : ""}
              </p>
              
              <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-xs text-stone-600 w-full text-left space-y-2 border border-stone-100">
                <div className="flex justify-between">
                  <span className="font-medium text-stone-400">Дата урока:</span>
                  <span className="font-bold text-stone-700">
                    {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(lesson.date))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-stone-400">Время начала:</span>
                  <span className="font-bold text-stone-700">{lesson.startTime}</span>
                </div>
              </div>

              <div className="mt-5 w-full space-y-3 text-left">
                {students.map((student) => (
                  <StudentPreviousContext key={student.crmStudentId} student={student} compact />
                ))}
              </div>

              {error ? (
                <div className="mt-5 w-full rounded-2xl border border-red-100 bg-red-50 p-3 text-left text-xs font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 w-full">
                <button
                  disabled={busy != null}
                  onClick={() => void runAction("start", () => teacherOfflineApi.start(crmClassId))}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-bold text-white transition-all hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy === "start" ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  Начать урок
                </button>
                <Link
                  href="/admin/offline-lessons"
                  className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 px-5 py-3.5 text-sm font-bold text-stone-600 transition-all hover:bg-stone-100"
                >
                  Вернуться в расписание
                </Link>
              </div>

              <p className="mt-5 text-xs text-stone-400 leading-normal">
                Начать урок можно не ранее чем за 15 минут до его начала.
              </p>
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        readOnly
        title="Добавить материал к итогу урока"
        onSelect={(media: CmsMedia) => {
          setMaterialsText((current) => [...current.split("\n").map((value) => value.trim()).filter(Boolean), media.url].filter((value, index, all) => all.indexOf(value) === index).join("\n"));
          setMaterialEntries((current) => [...current.filter((item) => item.url !== media.url), {
            type: media.mimeType?.startsWith("video/") ? "video" : media.mimeType?.startsWith("image/") ? "image" : media.folder === "pdf" ? "pdf" : "file",
            url: media.url,
            title: media.title,
            description: media.description,
          }]);
        }}
      />

      <SuccessModal
        open={Boolean(success)}
        title={success?.title ?? ""}
        description={success?.description ?? ""}
        onClose={() => setSuccess(null)}
      />
    </>
  );
}

function SubmitLessonConfirmation({
  open,
  lesson,
  studentsCount,
  absenceOnly,
  busy,
  progress,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  lesson: { title: string; date: string; startTime: string; endTime: string };
  studentsCount: number;
  absenceOnly: boolean;
  busy: boolean;
  progress: string | null;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-lesson-title"
        className="w-full max-w-md rounded-[28px] border border-stone-200 bg-paper p-6 shadow-2xl"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-800">
          <AlertTriangle size={22} />
        </span>
        <h2 id="submit-lesson-title" className="font-display mt-5 text-3xl">
          {absenceOnly ? "Передать отметку об отсутствии?" : "Отправить урок на проверку?"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {absenceOnly
            ? "Администратор увидит посещаемость без обычного отчёта по уроку. Тема, итог и домашнее задание не нужны."
            : "Проверьте отметки перед отправкой. Администратор увидит отчёт и после проверки опубликует итог ученику."}
        </p>
        <div className="mt-5 border-y border-stone-200 py-4 text-sm">
          <p className="font-bold text-ink">{lesson.title}</p>
          <p className="mt-1 text-stone-500">
            {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(lesson.date))}
            {" · "}{lesson.startTime}–{lesson.endTime}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-emerald-800">
            <CheckCircle2 size={16} />
            Отмечено учеников: {studentsCount}
          </p>
        </div>
        {error ? (
          <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {busy && progress ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {progress}
            <span className="mt-1 block text-xs font-normal text-amber-800/80">
              Не закрывайте приложение. На слабом интернете отправка может занять немного больше времени.
            </span>
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-600 disabled:opacity-50"
          >
            Ещё проверить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            {absenceOnly ? "Передать" : "Отправить"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NotHeldConfirmation({
  open,
  lesson,
  reason,
  busy,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  lesson: { title: string; date: string; startTime: string };
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="not-held-title"
        className="w-full max-w-md rounded-[28px] border border-red-100 bg-paper p-6 shadow-2xl"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-700">
          <XCircle size={22} />
        </span>
        <h2 id="not-held-title" className="font-display mt-5 text-3xl">Урок не проводился?</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Это действие не списывает занятие ученику и не начисляет ставку преподавателю. Если ученик не пришёл, закройте окно и выберите «Не пришёл» в посещаемости.
        </p>
        <p className="mt-4 text-sm font-bold text-ink">{lesson.title}</p>
        <p className="mt-1 text-sm text-stone-500">
          {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(lesson.date))}
          {" · "}{lesson.startTime}
        </p>
        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
          Что произошло?
          <textarea
            autoFocus
            value={reason}
            disabled={busy}
            onChange={(event) => onReasonChange(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-xl border border-stone-200 px-3 py-3 text-sm normal-case tracking-normal"
            placeholder="Например: преподаватель заболел или школа отменила занятие"
          />
        </label>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-600 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || reason.trim().length < 3}
            onClick={onConfirm}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-700 px-3 text-sm font-bold text-white disabled:opacity-45"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <XCircle size={16} />}
            Подтвердить
          </button>
        </div>
      </section>
    </div>
  );
}

function TrialReportEditor({
  report,
  disabled,
  isAdmin,
  updateSection,
  toggleObjection,
}: {
  report: TrialLessonReport;
  disabled: boolean;
  isAdmin: boolean;
  updateSection: TrialSectionUpdater;
  toggleObjection: (value: string) => void;
}) {
  const assessment = report.teacherAssessment ?? {};
  const facts = report.lessonFacts ?? {};
  const profile = report.studentProfile ?? {};
  const recommendation = report.recommendation ?? {};
  const sales = report.salesSignals ?? {};
  const raw = report.raw ?? {};
  const selectedObjections = new Set(sales.parentObjections ?? []);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-bold text-amber-950">Пробный урок: диагностическая анкета</p>
        <p className="mt-2 text-sm leading-6 text-amber-900/80">
          Здесь только педагогические наблюдения по занятию. Коммерческие решения и следующий контакт заполняет менеджер отдельно.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Итог посещения
          <select
            value={report.attendance?.outcome ?? "attended"}
            onChange={(event) => updateSection("attendance", { outcome: event.target.value as any })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="attended">Пришел и занимался</option>
            <option value="late">Опоздал, но занимался</option>
            <option value="no_show">Не пришел</option>
            <option value="rescheduled">Перенесли</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Сопровождение взрослого
          <select
            value={report.attendance?.arrivedWith ?? "unknown"}
            onChange={(event) => updateSection("attendance", { arrivedWith: event.target.value as any, parentAccompanied: event.target.value === "parent", parentPresent: false })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="unknown">Не указано</option>
            <option value="parent">Родитель сопровождал</option>
            <option value="alone">Самостоятельно</option>
            <option value="other">Другое</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Опыт до пробного
          <select
            value={profile.priorExperience ?? "unknown"}
            onChange={(event) => updateSection("studentProfile", { priorExperience: event.target.value as any })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="unknown">Не понял</option>
            <option value="none">С нуля</option>
            <option value="basic">Базовый</option>
            <option value="medium">Средний</option>
            <option value="strong">Сильный</option>
          </select>
        </label>
        {isAdmin ? (
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Мотивация (со слов семьи)
            <select
              value={profile.motivation ?? "unclear"}
              onChange={(event) => updateSection("studentProfile", { motivation: event.target.value as any })}
              disabled={disabled}
              className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
            >
              <option value="unclear">Не ясно</option>
              <option value="student">Хочет ученик</option>
              <option value="parent">Хочет родитель</option>
              <option value="both">Оба заинтересованы</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TrialScore label="Интерес" value={assessment.interestLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { interestLevel: value })} />
        <TrialScore label="Контакт" value={assessment.contactLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { contactLevel: value })} />
        <TrialScore label="Фокус" value={assessment.focusLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { focusLevel: value })} />
        <TrialScore label="Ритм" value={assessment.rhythm} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { rhythm: value })} />
        <TrialScore label="Слух" value={assessment.hearing} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { hearing: value })} />
        <TrialScore label="Координация" value={assessment.coordination} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { coordination: value })} />
        <TrialScore label="Память" value={assessment.memory} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { memory: value })} />
        <TrialScore label="Техника" value={assessment.techniqueBase} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { techniqueBase: value })} />
        <TrialScore label="Готовность" value={assessment.emotionalReadiness} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { emotionalReadiness: value })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isAdmin ? (
          <TrialTextarea label="Цель родителя (со слов семьи)" value={profile.goalFromParent} disabled={disabled} onChange={(value) => updateSection("studentProfile", { goalFromParent: value })} />
        ) : null}
        <TrialTextarea label="Цель ученика" value={profile.goalFromStudent} disabled={disabled} onChange={(value) => updateSection("studentProfile", { goalFromStudent: value })} />
        <TrialTextarea label="Что проверили" value={facts.whatWasTested} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { whatWasTested: value })} />
        <TrialTextarea label="Что получилось" value={facts.whatWorkedWell} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { whatWorkedWell: value })} />
        <TrialTextarea label="Трудности" value={facts.difficulties} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { difficulties: value })} />
        <TrialTextarea label="Реакция на задания" value={facts.reactionToTasks} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { reactionToTasks: value })} />
        {isAdmin ? (
          <TrialTextarea label="Комментарий семьи (служебно)" value={facts.parentReaction} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { parentReaction: value })} />
        ) : null}
        <TrialTextarea label="Дали домой" value={facts.homeworkGiven} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { homeworkGiven: value })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Рекомендованный формат
          <select value={recommendation.recommendedFormat ?? "undecided"} onChange={(event) => updateSection("recommendation", { recommendedFormat: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="undecided">Пока не ясно</option>
            <option value="group">Группа</option>
            <option value="individual">Индивидуально</option>
            <option value="hybrid">Гибрид</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Частота
          <select value={recommendation.recommendedFrequency ?? "undecided"} onChange={(event) => updateSection("recommendation", { recommendedFrequency: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="undecided">Пока не ясно</option>
            <option value="1_per_week">1 раз в неделю</option>
            <option value="2_per_week">2 раза в неделю</option>
            <option value="3_per_week">3 раза в неделю</option>
            <option value="custom">Индивидуально</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Уровень
          <select value={recommendation.recommendedLevel ?? "beginner"} onChange={(event) => updateSection("recommendation", { recommendedLevel: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="beginner">Новичок</option>
            <option value="basic">База</option>
            <option value="intermediate">Средний</option>
            <option value="advanced">Сильный</option>
          </select>
        </label>
        {isAdmin ? (
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Следующий шаг (для менеджера)
            <select value={recommendation.nextStep ?? "manager_call"} onChange={(event) => updateSection("recommendation", { nextStep: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
              <option value="manager_call">Созвон менеджера</option>
              <option value="sell_membership">Предложить абонемент</option>
              <option value="second_trial">Второй пробный</option>
              <option value="wait">Подождать решение</option>
              <option value="reject">Не продолжать</option>
            </select>
          </label>
        ) : null}
        <TrialTextarea label="Фокус первого месяца" value={recommendation.firstMonthFocus} disabled={disabled} onChange={(value) => updateSection("recommendation", { firstMonthFocus: value })} />
        {isAdmin ? (
          <TrialTextarea label="Наблюдение для менеджера (служебно)" value={sales.teacherSalesComment} disabled={disabled} onChange={(value) => updateSection("salesSignals", { teacherSalesComment: value })} />
        ) : null}
      </div>

      {isAdmin ? <div className="rounded-[24px] border border-violet-200 bg-violet-50 p-5">
        <p className="text-sm font-bold text-violet-950">Коммерческий блок — только менеджеру</p>
        <p className="mt-2 text-sm leading-6 text-violet-900/80">
          Эти данные не участвуют в педагогическом отчёте для семьи и не требуются преподавателю для отправки урока.
        </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <TrialScore label="Вероятность покупки" value={sales.buyProbability} disabled={disabled} onChange={(value) => updateSection("salesSignals", { buyProbability: value })} />
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Чувствительность к цене
          <select value={sales.priceSensitivity ?? "unknown"} onChange={(event) => updateSection("salesSignals", { priceSensitivity: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="unknown">Не ясно</option>
            <option value="low">Низкая</option>
            <option value="medium">Средняя</option>
            <option value="high">Высокая</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Подходит расписание
          <select value={sales.scheduleFit ?? "unknown"} onChange={(event) => updateSection("salesSignals", { scheduleFit: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="unknown">Не ясно</option>
            <option value="good">Да</option>
            <option value="medium">Нужно подбирать</option>
            <option value="bad">Плохо подходит</option>
          </select>
        </label>
      </div>

      <fieldset className="rounded-[24px] border border-stone-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-stone-500">Возражения родителя</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {trialObjectionOptions.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-bold text-stone-600">
              <input type="checkbox" checked={selectedObjections.has(value)} disabled={disabled} onChange={() => toggleObjection(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      </div> : null}

      <TrialTextarea label="Свободный комментарий преподавателя" value={raw.teacherFreeComment} disabled={disabled} onChange={(value) => updateSection("raw", { teacherFreeComment: value })} />
    </div>
  );
}

function TrialScore({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
      {label}
      <input
        type="number"
        min={1}
        max={5}
        step={1}
        value={value ?? ""}
        onChange={(event) => onChange(scoreFromInput(event.target.value))}
        disabled={disabled}
        className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
        placeholder="1-5"
      />
    </label>
  );
}

function TrialTextarea({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
      {label}
      <textarea
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
      />
    </label>
  );
}

function StudentRoster({
  students,
  compactGroup,
  previousGroupHomework,
  canManageAttendance,
  canSetExcusedAbsence,
  canEdit,
  showHomeworkReview,
  showLearningResult,
  drafts,
  studentsError,
  onRetryStudents,
  onSelectTopic,
  onDraftChange,
}: {
  students: TeacherOfflineStudent[];
  compactGroup: boolean;
  previousGroupHomework: PreviousHomeworkSource | null;
  canManageAttendance: boolean;
  canSetExcusedAbsence: boolean;
  canEdit: boolean;
  showHomeworkReview: boolean;
  showLearningResult: boolean;
  drafts: Record<string, StudentLessonCheckDraft>;
  studentsError: string | null;
  onRetryStudents: () => void;
  onSelectTopic?: (topic: string) => void;
  onDraftChange: (studentId: string, draft: StudentLessonCheckDraft) => void;
}) {
  return (
    <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          {compactGroup ? <UsersRound size={20} /> : <CheckCircle2 size={20} />}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            {compactGroup ? "Групповой урок" : "По каждому ученику"}
          </p>
          <h2 className="font-display mt-1 text-3xl">
            {compactGroup ? "Группа и проверка ДЗ" : "Посещаемость и результат"}
          </h2>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-500">
        {canManageAttendance
          ? compactGroup
            ? "Общее задание проверяется по каждому присутствующему ученику."
            : "Отметьте посещаемость, проверку прошлого ДЗ и освоенные темы из плана месяца."
          : "Отметки доступны во время урока и сохраняются в его истории."}
      </p>

      {studentsError ? (
        <div className="mt-4"><ErrorState message={studentsError} retry={onRetryStudents} /></div>
      ) : null}

      {!students.length ? (
        <div className="mt-6">
          <EmptyState
            title="Список учеников пуст"
            description="Ученики появятся после записи в группу или назначения индивидуального урока."
          />
        </div>
      ) : compactGroup ? (
        <GroupLessonRoster
          students={students}
          canEdit={canEdit && canManageAttendance}
          canSetExcusedAbsence={canSetExcusedAbsence}
          showLearningResult={showLearningResult}
          previousHomework={previousGroupHomework}
          drafts={drafts}
          onSelectTopic={onSelectTopic}
          onDraftChange={onDraftChange}
        />
      ) : (
        <div className="mt-6 space-y-4">
          {students.map((student) => (
            <StudentLessonCheckCard
              key={student.crmStudentId}
              student={student}
              canEdit={canEdit && canManageAttendance}
              canSetExcusedAbsence={canSetExcusedAbsence}
              showHomeworkReview={showHomeworkReview && Boolean(previousHomeworkLesson(student))}
              showLearningResult={showLearningResult}
              draft={drafts[student.crmStudentId] ?? studentLessonCheckDraft(student)}
              onSelectTopic={onSelectTopic}
              onChange={(draft) => onDraftChange(student.crmStudentId, draft)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const teacherGroupAttendanceExceptions = [
  { value: "late", label: "Опоздал" },
  { value: "unexcused_absence", label: "Не пришёл" },
] as const;

const adminGroupAttendanceExceptions = [
  { value: "late", label: "Опоздал" },
  { value: "excused_absence", label: "Уважительная — без списания" },
  { value: "unexcused_absence", label: "Неуважительная — списать" },
] as const;

const groupHomeworkOptions = [
  { value: "completed", label: "Выполнено", icon: Check },
  { value: "partial", label: "Частично", icon: Minus },
  { value: "not_completed", label: "Нет", icon: XCircle },
] as const;

function draftWithHomeworkStatus(
  draft: StudentLessonCheckDraft,
  status: OfflineHomeworkReview["status"],
  sourceCrmClassId?: string | null,
): StudentLessonCheckDraft {
  const homeworkReview = normalizeHomeworkReview(draft.homeworkReview);
  return {
    ...draft,
    homeworkReview: {
      ...homeworkReview,
      sourceCrmClassId: sourceCrmClassId === undefined
        ? homeworkReview.sourceCrmClassId
        : sourceCrmClassId,
      status,
      completionPercent:
        status === "completed"
          ? 100
          : status === "partial"
            ? homeworkReview.completionPercent && homeworkReview.completionPercent < 100
              ? homeworkReview.completionPercent
              : 50
            : status === "not_completed"
              ? 0
              : null,
      difficulties: status === "partial" ? homeworkReview.difficulties : "",
      notCompletedReason: status === "not_completed" ? homeworkReview.notCompletedReason : "",
    },
  };
}

function GroupLessonRoster({
  students,
  canEdit,
  canSetExcusedAbsence,
  showLearningResult,
  previousHomework,
  drafts,
  onSelectTopic,
  onDraftChange,
}: {
  students: TeacherOfflineStudent[];
  canEdit: boolean;
  canSetExcusedAbsence: boolean;
  showLearningResult: boolean;
  previousHomework: PreviousHomeworkSource | null;
  drafts: Record<string, StudentLessonCheckDraft>;
  onSelectTopic?: (topic: string) => void;
  onDraftChange: (studentId: string, draft: StudentLessonCheckDraft) => void;
}) {
  const attendedStudents = students.filter((student) => (
    ["present", "late"].includes(drafts[student.crmStudentId].attendanceStatus)
  ));
  const completedHomeworkCount = previousHomework
    ? attendedStudents.filter((student) => drafts[student.crmStudentId].homeworkReview.status === "completed").length
    : 0;
  const pendingHomeworkCount = previousHomework
    ? attendedStudents.filter((student) => drafts[student.crmStudentId].homeworkReview.status === "not_checked").length
    : 0;
  const attentionCount = previousHomework
    ? attendedStudents.filter((student) => (
      ["partial", "not_completed"].includes(drafts[student.crmStudentId].homeworkReview.status)
    )).length
    : 0;

  function markEveryonePresent() {
    for (const student of students) {
      onDraftChange(student.crmStudentId, {
        ...drafts[student.crmStudentId],
        attendanceStatus: "present",
      });
    }
  }

  function markHomeworkCompleted() {
    if (!previousHomework) return;
    for (const student of attendedStudents) {
      onDraftChange(
        student.crmStudentId,
        draftWithHomeworkStatus(
          drafts[student.crmStudentId],
          "completed",
          previousHomework.crmClassId,
        ),
      );
    }
  }

  const sourceTitle = previousHomework?.topic?.trim() || previousHomework?.title;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {previousHomework ? (
        <div className="border-b border-amber-200 bg-amber-50/70 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">
                <BookCheck size={15} />
                Общее ДЗ с прошлого группового урока
              </p>
              <p className="mt-1.5 text-sm font-black text-ink">{sourceTitle}</p>
              <p className="mt-1 text-sm leading-6 text-stone-700">{previousHomework.homework}</p>
              <p className="mt-1 text-xs font-semibold text-stone-500">
                {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(previousHomework.date))}
              </p>
            </div>
            {onSelectTopic && sourceTitle ? (
              <button
                type="button"
                onClick={() => onSelectTopic(sourceTitle)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-100"
              >
                <Music size={14} />
                Продолжить тему
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-600 sm:px-5">
          На прошлых групповых уроках домашнее задание не найдено.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
        <p className="text-sm font-bold text-stone-700">
          Присутствовали {attendedStudents.length}/{students.length}
          {previousHomework && attendedStudents.length
            ? ` · ДЗ выполнено ${completedHomeworkCount}/${attendedStudents.length}`
            : ""}
          {pendingHomeworkCount ? ` · не проверено ${pendingHomeworkCount}` : ""}
          {attentionCount ? ` · требуют уточнения ${attentionCount}` : ""}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markEveryonePresent}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100"
            >
              <Check size={14} />
              Все присутствуют
            </button>
            {previousHomework ? (
              <button
                type="button"
                disabled={!attendedStudents.length}
                onClick={markHomeworkCompleted}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BookCheck size={14} />
                ДЗ выполнено у присутствующих
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="hidden grid-cols-[minmax(190px,1fr)_190px_minmax(260px,360px)_44px] gap-3 border-b border-stone-200 bg-stone-50/80 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 lg:grid">
        <span>Ученик</span>
        <span>Исключение</span>
        <span>{previousHomework ? "Проверка ДЗ" : "Домашнее задание"}</span>
        <span className="sr-only">Детали</span>
      </div>

      <div className="divide-y divide-stone-200">
        {students.map((student) => (
          <GroupStudentRow
            key={student.crmStudentId}
            student={student}
            canEdit={canEdit}
            canSetExcusedAbsence={canSetExcusedAbsence}
            showLearningResult={showLearningResult}
            previousHomework={previousHomework}
            draft={drafts[student.crmStudentId]}
            onSelectTopic={onSelectTopic}
            onChange={(draft) => onDraftChange(student.crmStudentId, draft)}
          />
        ))}
      </div>
    </div>
  );
}

function GroupStudentRow({
  student,
  canEdit,
  canSetExcusedAbsence,
  showLearningResult,
  previousHomework,
  draft,
  onSelectTopic,
  onChange,
}: {
  student: TeacherOfflineStudent;
  canEdit: boolean;
  canSetExcusedAbsence: boolean;
  showLearningResult: boolean;
  previousHomework: PreviousHomeworkSource | null;
  draft: StudentLessonCheckDraft;
  onSelectTopic?: (topic: string) => void;
  onChange: (draft: StudentLessonCheckDraft) => void;
}) {
  const [learningOpen, setLearningOpen] = useState(false);
  const attended = ["present", "late"].includes(draft.attendanceStatus);
  const attendanceExceptions = canSetExcusedAbsence
    ? adminGroupAttendanceExceptions
    : teacherGroupAttendanceExceptions;
  const exceptionStatus = attendanceExceptions.some((item) => item.value === draft.attendanceStatus)
    ? draft.attendanceStatus
    : "";
  const needsHomeworkDetails = attended
    && ["partial", "not_completed"].includes(draft.homeworkReview.status);
  const needsAbsenceNote = ["excused_absence", "unexcused_absence"].includes(draft.attendanceStatus);

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="grid items-center gap-3 lg:grid-cols-[minmax(190px,1fr)_190px_minmax(260px,360px)_44px]">
        <label className="flex min-w-0 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={attended}
            disabled={!canEdit}
            onChange={(event) => onChange({
              ...draft,
              attendanceStatus: event.target.checked ? "present" : "unmarked",
            })}
            className="h-5 w-5 shrink-0 accent-emerald-600"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-ink">{student.name}</span>
            <span className={`mt-0.5 block text-xs font-semibold ${
              draft.attendanceStatus === "unmarked" ? "text-stone-400" : "text-stone-600"
            }`}>
              {attendanceLabels[draft.attendanceStatus] ?? attendanceLabels.unmarked}
            </span>
          </span>
        </label>

        <select
          value={exceptionStatus}
          disabled={!canEdit}
          aria-label={`Особый статус посещаемости для ${student.name}`}
          onChange={(event) => onChange({
            ...draft,
            attendanceStatus: event.target.value
              ? event.target.value as StudentLessonCheckDraft["attendanceStatus"]
              : attended ? "present" : "unmarked",
          })}
          className="h-10 min-w-0 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 outline-none focus:border-amber-400"
        >
          <option value="">{attended ? "Без исключений" : "Другой статус"}</option>
          {attendanceExceptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {previousHomework ? (
          attended ? (
            <div className="grid min-h-10 grid-cols-3 overflow-hidden rounded-xl border border-stone-200" role="group" aria-label={`Проверка ДЗ для ${student.name}`}>
              {groupHomeworkOptions.map(({ value, label, icon: Icon }) => {
                const selected = draft.homeworkReview.status === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onChange(draftWithHomeworkStatus(draft, value, previousHomework.crmClassId))}
                    className={`inline-flex min-h-10 items-center justify-center gap-1 border-r border-stone-200 px-1.5 text-xs font-bold transition last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? value === "completed"
                          ? "bg-emerald-600 text-white"
                          : value === "partial"
                            ? "bg-amber-100 text-amber-950"
                            : "bg-red-100 text-red-800"
                        : "bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs font-semibold text-stone-400">После отметки присутствия</span>
          )
        ) : (
          <span className="text-xs font-semibold text-stone-400">—</span>
        )}

        <button
          type="button"
          disabled={!attended || !showLearningResult}
          onClick={() => setLearningOpen((current) => !current)}
          aria-expanded={learningOpen}
          aria-label={`Учебный результат: ${student.name}`}
          title="Учебный результат"
          className="grid h-10 w-10 place-items-center justify-self-end rounded-xl border border-stone-200 text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35 lg:justify-self-auto"
        >
          {learningOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {needsHomeworkDetails ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 lg:ml-[202px]">
          {draft.homeworkReview.status === "partial" ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`group-homework-percent-${student.crmStudentId}`} className="text-xs font-bold text-stone-700">
                  Выполнено примерно
                </label>
                <strong className="text-sm font-black text-amber-900">{draft.homeworkReview.completionPercent ?? 50}%</strong>
              </div>
              <input
                id={`group-homework-percent-${student.crmStudentId}`}
                type="range"
                min={10}
                max={90}
                step={10}
                value={draft.homeworkReview.completionPercent ?? 50}
                disabled={!canEdit}
                onChange={(event) => onChange({
                  ...draft,
                  homeworkReview: {
                    ...draft.homeworkReview,
                    completionPercent: Number(event.target.value),
                  },
                })}
                className="mt-2 w-full accent-amber-600"
              />
              <label className="mt-2 block text-xs font-bold text-stone-600">
                Что осталось доделать
                <textarea
                  value={draft.homeworkReview.difficulties ?? ""}
                  disabled={!canEdit}
                  onChange={(event) => onChange({
                    ...draft,
                    homeworkReview: { ...draft.homeworkReview, difficulties: event.target.value },
                  })}
                  rows={2}
                  className="mt-1.5 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs"
                />
              </label>
            </>
          ) : (
            <label className="block text-xs font-bold text-red-700">
              Причина невыполнения
              <textarea
                value={draft.homeworkReview.notCompletedReason ?? ""}
                disabled={!canEdit}
                onChange={(event) => onChange({
                  ...draft,
                  homeworkReview: { ...draft.homeworkReview, notCompletedReason: event.target.value },
                })}
                rows={2}
                className="mt-1.5 min-h-16 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-stone-800"
              />
            </label>
          )}
        </div>
      ) : null}

      {needsAbsenceNote ? (
        <label className="mt-3 block text-xs font-bold text-stone-600 lg:ml-[202px]">
          Причина отсутствия
          <textarea
            value={draft.teacherNote}
            disabled={!canEdit}
            onChange={(event) => onChange({ ...draft, teacherNote: event.target.value })}
            rows={1}
            className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs"
            placeholder="Что произошло?"
          />
        </label>
      ) : null}

      {learningOpen && attended && showLearningResult ? (
        <div className="mt-3 border-t border-stone-200 pt-3 lg:ml-[202px]">
          <StudentLearningResultFields
            student={student}
            canEdit={canEdit}
            draft={draft}
            onSelectTopic={onSelectTopic}
            onChange={onChange}
          />
          <label className="mt-3 block text-xs font-bold text-stone-600">
            Заметка по ученику
            <textarea
              value={draft.teacherNote}
              disabled={!canEdit}
              onChange={(event) => onChange({ ...draft, teacherNote: event.target.value })}
              rows={1}
              className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs"
              placeholder="Индивидуальная заметка для себя или школы"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

const teacherAttendanceOptions = [
  { value: "present", label: "Присутствовал", icon: Check, active: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "late", label: "Опоздал", icon: Clock3, active: "border-amber-500 bg-amber-50 text-amber-900" },
  { value: "unexcused_absence", label: "Не пришёл", icon: CircleSlash2, active: "border-red-500 bg-red-50 text-red-800" },
] as const;

const adminAttendanceOptions = [
  { value: "present", label: "Присутствовал", icon: Check, active: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "late", label: "Опоздал", icon: Clock3, active: "border-amber-500 bg-amber-50 text-amber-900" },
  { value: "excused_absence", label: "Уважительная", icon: UserX, active: "border-sky-500 bg-sky-50 text-sky-900" },
  { value: "unexcused_absence", label: "Неуважительная", icon: CircleSlash2, active: "border-red-500 bg-red-50 text-red-800" },
] as const;

const homeworkOptions = [
  { value: "completed", label: "Выполнено" },
  { value: "partial", label: "Частично" },
  { value: "not_completed", label: "Не выполнено" },
  { value: "not_assigned", label: "Не задавалось" },
] as const;

function normalizeHomeworkReview(review?: OfflineHomeworkReview | null): OfflineHomeworkReview {
  return {
    sourceCrmClassId: review?.sourceCrmClassId ?? null,
    status: review?.status ?? "not_checked",
    completionPercent: review?.completionPercent ?? null,
    difficulties: review?.difficulties ?? "",
    notCompletedReason: review?.notCompletedReason ?? "",
  };
}

function StudentLearningResultFields({
  student,
  canEdit,
  draft,
  onSelectTopic,
  onChange,
}: {
  student: TeacherOfflineStudent;
  canEdit: boolean;
  draft: StudentLessonCheckDraft;
  onSelectTopic?: (topic: string) => void;
  onChange: (draft: StudentLessonCheckDraft) => void;
}) {
  const [quickTopicTitle, setQuickTopicTitle] = useState("");
  const [addingQuickTopic, setAddingQuickTopic] = useState(false);
  const [quickTopicError, setQuickTopicError] = useState<string | null>(null);
  const planItems = (student.monthlyPlan?.items ?? []).filter((item) => item.status !== "moved");

  function choosePlanTopicStatus(itemId: string, status: "in_progress" | "completed") {
    const selected = draft.planTopicUpdates.find((item) => item.itemId === itemId);
    const next = draft.planTopicUpdates.filter((item) => item.itemId !== itemId);
    onChange({
      ...draft,
      monthlyPlanId: student.monthlyPlan?.id ?? draft.monthlyPlanId,
      planTopicUpdates: selected?.status === status ? next : [...next, { itemId, status }],
    });
  }

  async function handleAddQuickTopic() {
    if (!quickTopicTitle.trim() || !student.crmStudentId) return;
    setAddingQuickTopic(true);
    setQuickTopicError(null);
    try {
      const currentItems = (student.monthlyPlan?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
      }));
      const newItem = {
        id: crypto.randomUUID(),
        title: quickTopicTitle.trim(),
        status: "in_progress" as const,
      };
      const month = student.monthlyPlan?.month || currentAqtobeMonth();
      const saved = await teacherStudentsApi.saveMonthlyPlan(student.crmStudentId, {
        month,
        goal: student.monthlyPlan?.goal || `Освоить «${quickTopicTitle.trim()}»`,
        expectedResult: "",
        skills: "",
        checkpoint: "",
        note: "",
        items: [...currentItems, newItem],
      });
      student.monthlyPlan = {
        id: saved.id || crypto.randomUUID(),
        month: saved.month,
        goal: saved.goal,
        items: saved.items.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status as "planned" | "in_progress" | "completed" | "moved",
        })),
      };
      choosePlanTopicStatus(newItem.id, "in_progress");
      onSelectTopic?.(newItem.title);
      setQuickTopicTitle("");
    } catch {
      setQuickTopicError("Не удалось добавить тему в план. Проверьте интернет.");
    } finally {
      setAddingQuickTopic(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-900">
            <Target size={15} />
            План на {student.monthlyPlan?.month || currentAqtobeMonth()}
          </p>
          {student.monthlyPlan?.goal ? (
            <span className="text-xs font-semibold text-violet-800">Цель: {student.monthlyPlan.goal}</span>
          ) : null}
        </div>

        {planItems.length ? (
          <div className="mt-3 space-y-2">
            {planItems.map((item) => {
              const selectedStatus = draft.planTopicUpdates.find((update) => update.itemId === item.id)?.status;
              const isDone = item.status === "completed" || selectedStatus === "completed";
              const isInProgress = selectedStatus === "in_progress"
                || (item.status === "in_progress" && !selectedStatus);
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white p-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                      isDone
                        ? "bg-emerald-100 text-emerald-800"
                        : isInProgress ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-500"
                    }`}>
                      {isDone ? <Check size={13} /> : <Clock3 size={13} />}
                    </span>
                    <p className="min-w-0 truncate text-sm font-bold text-ink">{item.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => choosePlanTopicStatus(item.id, "in_progress")}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        selectedStatus === "in_progress"
                          ? "border-amber-300 bg-amber-100 text-amber-900"
                          : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      В работе
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => choosePlanTopicStatus(item.id, "completed")}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        selectedStatus === "completed" || (item.status === "completed" && !selectedStatus)
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      Освоено
                    </button>
                    {onSelectTopic ? (
                      <button
                        type="button"
                        onClick={() => onSelectTopic(item.title)}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-violet-200 bg-violet-50 text-violet-800 transition hover:bg-violet-100"
                        title="Использовать тему в отчёте"
                        aria-label={`Использовать тему «${item.title}» в отчёте`}
                      >
                        <Music size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-stone-500">В плане месяца пока нет тем.</p>
        )}

        {canEdit ? (
          <div className="mt-3 border-t border-violet-100 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={quickTopicTitle}
                onChange={(event) => setQuickTopicTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAddQuickTopic();
                  }
                }}
                placeholder="Новая тема или песня в план"
                className="h-10 min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-violet-200"
              />
              <button
                type="button"
                disabled={addingQuickTopic || !quickTopicTitle.trim()}
                onClick={() => void handleAddQuickTopic()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-3.5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-50"
              >
                {addingQuickTopic ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
                Добавить
              </button>
            </div>
            {quickTopicError ? <p className="mt-1.5 text-xs font-semibold text-red-600">{quickTopicError}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
              <Star size={16} className="text-gold" />
              Учебные баллы
            </span>
            <span className="mt-0.5 block text-[11px] text-amber-900/70">От 0 до 100 XP за работу на уроке</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex gap-1">
              {[100, 80, 50, 0].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onChange({ ...draft, lessonPoints: value })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    draft.lessonPoints === value
                      ? "bg-amber-600 text-white"
                      : "border border-amber-200 bg-white text-amber-950 hover:bg-amber-100"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={draft.lessonPoints}
              disabled={!canEdit}
              onChange={(event) => onChange({
                ...draft,
                lessonPoints: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
              })}
              className="h-10 w-20 rounded-xl border border-amber-300 bg-white px-2.5 text-center text-base font-black text-ink outline-none"
              aria-label={`Учебные баллы для ${student.name}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentLessonCheckCard({
  student,
  canEdit,
  canSetExcusedAbsence,
  showHomeworkReview,
  showLearningResult,
  draft,
  onSelectTopic,
  onChange,
}: {
  student: TeacherOfflineStudent;
  canEdit: boolean;
  canSetExcusedAbsence: boolean;
  showHomeworkReview: boolean;
  showLearningResult: boolean;
  draft: StudentLessonCheckDraft;
  onSelectTopic?: (topic: string) => void;
  onChange: (draft: StudentLessonCheckDraft) => void;
}) {
  const { attendanceStatus, teacherNote, homeworkReview } = draft;
  const attended = ["present", "late"].includes(attendanceStatus);
  const homeworkNeedsReason = homeworkReview.status === "not_completed";
  const homeworkNeedsDifficulties = homeworkReview.status === "partial";
  const disabled = !canEdit;
  const availableAttendanceOptions = canSetExcusedAbsence
    ? adminAttendanceOptions
    : teacherAttendanceOptions;
  function chooseHomeworkStatus(status: OfflineHomeworkReview["status"]) {
    onChange(draftWithHomeworkStatus(draft, status));
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
        <div>
          <p className="font-semibold text-ink sm:text-lg">{student.name}</p>
          {student.phone ? <p className="mt-0.5 text-xs text-stone-500">{student.phone}</p> : null}
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
            attendanceClasses[attendanceStatus] ?? attendanceClasses.unmarked
          }`}
        >
          {attendanceLabels[attendanceStatus] ?? attendanceLabels.unmarked}
        </span>
      </div>

      <StudentPreviousContext
        student={student}
        onSelectTopic={onSelectTopic}
      />

      {/* Посещаемость */}
      <fieldset className="mt-4">
        <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
          Посещаемость
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availableAttendanceOptions.map(({ value, label, icon: Icon, active }) => {
            const selected = attendanceStatus === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, attendanceStatus: value })}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${
                  selected ? active : "border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100"
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {!canSetExcusedAbsence && canEdit ? (
          <p className="mt-2 text-xs font-semibold text-stone-500">
            «Не пришёл» — неуважительный пропуск: занятие списывается ученику, преподавателю начисляется ставка.
          </p>
        ) : null}
      </fieldset>

      {/* Проверка прошлого ДЗ */}
      {showHomeworkReview ? (
        <fieldset className="mt-4 border-t border-stone-100 pt-4">
          <legend className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
            <BookCheck size={15} className="text-gold" />
            Выполнение прошлого ДЗ
          </legend>
          {!attended ? (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Сначала отметьте присутствие ученика.
            </p>
          ) : null}
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {homeworkOptions.map(({ value, label }) => {
              const selected = homeworkReview.status === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled || !attended}
                  onClick={() => chooseHomeworkStatus(value)}
                  className={`min-h-10 rounded-xl border px-2 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${
                    selected
                      ? "border-gold bg-amber-50 text-amber-950 font-black shadow-xs"
                      : "border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {attended && homeworkReview.status === "completed" ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>Домашнее задание полностью отработано (100%)</span>
            </div>
          ) : null}

          {attended && homeworkReview.status === "partial" ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`homework-percent-${student.crmStudentId}`} className="text-xs font-bold text-stone-700">
                  Выполнено примерно:
                </label>
                <strong className="text-base font-black text-amber-900">{homeworkReview.completionPercent ?? 50}%</strong>
              </div>
              <input
                id={`homework-percent-${student.crmStudentId}`}
                type="range"
                min={10}
                max={90}
                step={10}
                value={homeworkReview.completionPercent ?? 50}
                disabled={disabled || !attended}
                onChange={(event) => {
                  const completionPercent = Number(event.target.value);
                  onChange({
                    ...draft,
                    homeworkReview: {
                      ...homeworkReview,
                      status: "partial",
                      completionPercent,
                    },
                  });
                }}
                className="mt-2 w-full accent-amber-600"
              />
              <label className="mt-3 block text-xs font-bold text-stone-600">
                Что осталось доделать или где были сложности:
                <textarea
                  value={homeworkReview.difficulties ?? ""}
                  disabled={disabled || !attended}
                  onChange={(event) => onChange({
                    ...draft,
                    homeworkReview: { ...homeworkReview, difficulties: event.target.value },
                  })}
                  rows={2}
                  className="mt-1.5 min-h-16 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs"
                  placeholder="Например: переходы между аккордами в припеве"
                />
              </label>
            </div>
          ) : null}

          {attended && homeworkNeedsReason ? (
            <label className="mt-3 block text-xs font-bold text-red-700">
              Причина невыполнения домашнего задания:
              <textarea
                value={homeworkReview.notCompletedReason ?? ""}
                disabled={disabled || !attended}
                onChange={(event) => onChange({
                  ...draft,
                  homeworkReview: { ...homeworkReview, notCompletedReason: event.target.value },
                })}
                rows={2}
                className="mt-1.5 min-h-16 w-full rounded-xl border border-red-200 bg-red-50/40 px-3 py-2 text-xs text-stone-800"
                placeholder="Укажите причину (обязательно)"
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {showLearningResult && attended ? (
        <fieldset className="mt-4 border-t border-stone-100 pt-4">
          <legend className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">
            <Target size={15} />
            План месяца и учебные баллы
          </legend>
          <div className="mt-3">
            <StudentLearningResultFields
              student={student}
              canEdit={canEdit}
              draft={draft}
              onSelectTopic={onSelectTopic}
              onChange={onChange}
            />
          </div>
        </fieldset>
      ) : null}

      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
        {attended ? "Заметка по ученику (необязательно)" : "Причина отсутствия"}
        <textarea
          value={teacherNote}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, teacherNote: event.target.value })}
          rows={1}
          className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs normal-case tracking-normal"
          placeholder={attended ? "Индивидуальные заметки для себя или школы" : "Что произошло?"}
        />
      </label>
    </div>
  );
}

const homeworkReviewLabels: Record<string, string> = {
  not_checked: "Не проверено",
  completed: "Выполнено",
  partial: "Частично",
  not_completed: "Не выполнено",
  not_assigned: "Не задавалось",
};

function StudentPreviousContext({
  student,
  compact = false,
  onSelectTopic,
}: {
  student: TeacherOfflineStudent;
  compact?: boolean;
  onSelectTopic?: (topic: string) => void;
}) {
  const lessons = student.recentLessons ?? [];
  const latest = lessons[0];
  if (!latest) {
    return (
      <div className={`${compact ? "mt-0" : "mt-3.5"} rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Перед уроком</p>
        <p className="mt-1 text-xs text-stone-500">Предыдущих уроков и домашнего задания в системе пока нет.</p>
      </div>
    );
  }

  const review = latest.homeworkReview;
  const topicTitle = latest.topic || latest.title;

  return (
    <div className={`${compact ? "mt-0" : "mt-3.5"} rounded-2xl border border-gold/25 bg-amber-50/50 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-gold">
            {compact ? student.name : "Контекст прошлого урока"}
          </span>
          <span className="text-xs text-stone-500 font-semibold">
            · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(latest.date))}
          </span>
        </div>
        {onSelectTopic && topicTitle ? (
          <button
            type="button"
            onClick={() => onSelectTopic(topicTitle)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 hover:text-amber-700 underline"
          >
            <Music size={12} />
            Продолжить тему «{topicTitle}»
          </button>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm font-bold text-ink">
        {topicTitle}
      </p>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-white/80 p-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">Было задано на дом:</span>
          <strong className="mt-1 block text-stone-800 leading-snug">{latest.homework || "Не задавалось"}</strong>
        </div>
        <div className="rounded-xl bg-white/80 p-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">Статус выполнения:</span>
          <strong className="mt-1 block text-stone-800 leading-snug">
            {homeworkReviewLabels[review?.status || "not_checked"]}
            {review?.completionPercent != null ? ` · ${review.completionPercent}%` : ""}
          </strong>
          {review?.difficulties ? <p className="mt-1 text-stone-600">Сложности: {review.difficulties}</p> : null}
        </div>
      </div>
      {latest.nextLessonFocus || latest.teacherNote ? (
        <p className="mt-2.5 text-xs leading-5 text-stone-600">
          <strong>Фокус с прошлого раза:</strong> {latest.nextLessonFocus || latest.teacherNote}
        </p>
      ) : null}
    </div>
  );
}
