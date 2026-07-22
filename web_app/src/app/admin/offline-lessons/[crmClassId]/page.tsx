"use client";

import {
  AlertTriangle,
  BookCheck,
  Check,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  LoaderCircle,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { MediaPicker } from "@/components/media-picker";
import type { CmsMedia } from "@/types/cms";
import type {
  OfflineHomeworkReview,
  TeacherOfflineStudent,
  TrialLessonReport,
} from "@/types/teacher-offline";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  cancelled: "Отменён",
};

const REPORT_SUBMISSION_LEAD_MINUTES = 20;

const attendanceLabels: Record<string, string> = {
  unmarked: "Не отмечен",
  present: "Присутствовал",
  late: "Опоздал",
  excused_absence: "Уважительная причина",
  unexcused_absence: "Пропуск",
};

const attendanceClasses: Record<string, string> = {
  unmarked: "bg-stone-100 text-stone-600",
  present: "bg-emerald-50 text-emerald-800",
  late: "bg-amber-50 text-amber-900",
  excused_absence: "bg-sky-50 text-sky-900",
  unexcused_absence: "bg-red-50 text-red-800",
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
};

function studentLessonCheckDraft(student: TeacherOfflineStudent): StudentLessonCheckDraft {
  return {
    attendanceStatus: student.attendanceStatus ?? "unmarked",
    teacherNote: student.teacherNote ?? "",
    homeworkReview: normalizeHomeworkReview(student.homeworkReview),
  };
}

type FeedbackMessage = {
  title: string;
  description: string;
};

type LessonMaterialDraft = { type?: string; url: string; title?: string; description?: string | null };

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
  const [clockNow, setClockNow] = useState(() => Date.now());

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
  const canEditTeacherReport = Boolean(
    lesson
      && lesson.status === "started"
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
      && (lesson?.classType === "individual" || (!lesson?.group && students.length === 1)),
  );
  const draftFor = (student: TeacherOfflineStudent) =>
    studentCheckDrafts[student.crmStudentId] ?? studentLessonCheckDraft(student);
  const unmarkedCount = students.filter((student) => draftFor(student).attendanceStatus === "unmarked").length;
  const homeworkReviewPendingCount = isIndividualLesson
    ? students.filter((student) =>
        ["present", "late"].includes(draftFor(student).attendanceStatus)
          && draftFor(student).homeworkReview.status === "not_checked",
      ).length
    : 0;
  const allStudentsAbsent = students.length > 0 && students.every((student) => (
    ["excused_absence", "unexcused_absence"].includes(draftFor(student).attendanceStatus)
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
        next[student.crmStudentId] = current[student.crmStudentId] ?? studentLessonCheckDraft(student);
      }
      return next;
    });
  }, [studentsResource.data, trialLeadFallback]);

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

    if (isIndividualLesson) {
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
    }

    if (isTrialLesson && !isTrialReportReady) {
      return "Заполните обязательные пункты анкеты пробного урока.";
    }
    if (!isTrialLesson && !topic.trim()) return "Укажите тему урока.";
    if (!isTrialLesson && !lessonSummary.trim()) return "Заполните итог урока.";
    return null;
  }

  async function saveStudentChecks() {
    const batchSize = 3;
    for (let index = 0; index < students.length; index += batchSize) {
      await Promise.all(students.slice(index, index + batchSize).map((student) => {
        const draft = draftFor(student);
        const attended = ["present", "late"].includes(draft.attendanceStatus);
        const homeworkReview = isIndividualLesson && attended ? draft.homeworkReview : undefined;
        return isAdmin
          ? adminOfflineApi.attendance(
              crmClassId,
              student.crmStudentId,
              draft.attendanceStatus,
              draft.teacherNote.trim() || undefined,
              homeworkReview,
            )
          : teacherOfflineApi.attendance(
              crmClassId,
              student.crmStudentId,
              draft.attendanceStatus,
              draft.teacherNote.trim() || undefined,
              homeworkReview,
            );
      }));
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
    const absenceOnly = allStudentsAbsent;
    const submitted = await runAction(absenceOnly ? "submit-absence" : "submit", async () => {
      await saveStudentChecks();
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
    if (submitted) setSubmitConfirmationOpen(false);
  }

  async function confirmNotHeld() {
    const reason = notHeldReason.trim();
    if (reason.length < 3) return;
    setNotHeldOpen(false);
    await runAction(
      "not-held",
      () => canActForTeacher
        ? adminOfflineApi.notHeldForTeacher(crmClassId, reason)
        : teacherOfflineApi.notHeld(crmClassId, reason),
    );
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
    await runAction("approve", async () => {
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

      {canActForTeacher && lesson.teacher?.name && ["scheduled", "started"].includes(lesson.status) ? (
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
          canManageAttendance={canManageAttendance}
          canEdit={canEditReport}
          showHomeworkReview={isIndividualLesson}
          drafts={studentCheckDrafts}
          studentsError={studentsResource.error}
          onRetryStudents={studentsResource.reload}
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
                <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Тема урока
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что проходили на занятии?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Цель урока
                  <textarea
                    value={lessonGoals}
                    onChange={(event) => setLessonGoals(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что планировали освоить?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Итог урока
                  <textarea
                    value={lessonSummary}
                    onChange={(event) => setLessonSummary(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что получилось, что разобрали, какой результат?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Домашнее задание
                  <textarea
                    value={homework}
                    onChange={(event) => setHomework(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-32 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что отработать до следующего урока?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Фокус следующего урока
                  <textarea
                    value={nextLessonFocus}
                    onChange={(event) => setNextLessonFocus(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="С чего продолжить на следующем занятии?"
                  />
                </label>
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Материалы и ссылки
              </label>
              <button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                disabled={!canEditReport}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:border-gold disabled:opacity-50"
              >
                Выбрать из медиатеки
              </button>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              <textarea
                value={materialsText}
                onChange={(event) => setMaterialsText(event.target.value)}
                disabled={!canEditReport}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Одна ссылка на строку или выберите файл из медиатеки"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий для админа
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={!canEditReport}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Замечания по ученикам, сложности, рекомендации — всё, что важно для администратора"
              />
            </label>
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
            <p className="text-sm font-bold text-stone-700">Урок не проводился?</p>
            <p className="mt-1 text-sm text-stone-500">
              Используйте это действие только если занятие действительно не состоялось.
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
          <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-stone-200 bg-paper p-6 shadow-2xl sm:p-8">
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
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  lesson: { title: string; date: string; startTime: string; endTime: string };
  studentsCount: number;
  absenceOnly: boolean;
  busy: boolean;
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
        <h2 id="not-held-title" className="font-display mt-5 text-3xl">Урок не состоялся?</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Отметка останется в истории. Занятие не будет отправлено как проведённое.
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
            placeholder="Например: ученик предупредил об отсутствии"
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
  canManageAttendance,
  canEdit,
  showHomeworkReview,
  drafts,
  studentsError,
  onRetryStudents,
  onDraftChange,
}: {
  students: TeacherOfflineStudent[];
  canManageAttendance: boolean;
  canEdit: boolean;
  showHomeworkReview: boolean;
  drafts: Record<string, StudentLessonCheckDraft>;
  studentsError: string | null;
  onRetryStudents: () => void;
  onDraftChange: (studentId: string, draft: StudentLessonCheckDraft) => void;
}) {
  return (
    <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">В начале урока</p>
          <h2 className="font-display mt-1 text-3xl">Посещаемость и прошлое ДЗ</h2>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-500">
        {canManageAttendance
          ? "Сначала зафиксируйте присутствие. Для индивидуального урока также отметьте выполнение домашнего задания."
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
      ) : (
        <div className="mt-6 space-y-3">
          {students.map((student) => (
            <StudentLessonCheckCard
              key={student.crmStudentId}
              student={student}
              canEdit={canEdit && canManageAttendance}
              showHomeworkReview={showHomeworkReview}
              draft={drafts[student.crmStudentId] ?? studentLessonCheckDraft(student)}
              onChange={(draft) => onDraftChange(student.crmStudentId, draft)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const attendanceOptions = [
  { value: "present", label: "Присутствовал", icon: Check, active: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "late", label: "Опоздал", icon: Clock3, active: "border-amber-500 bg-amber-50 text-amber-900" },
  { value: "excused_absence", label: "Нет, причина есть", icon: UserX, active: "border-sky-500 bg-sky-50 text-sky-900" },
  { value: "unexcused_absence", label: "Нет без причины", icon: CircleSlash2, active: "border-red-500 bg-red-50 text-red-800" },
] as const;

const homeworkOptions = [
  { value: "completed", label: "Выполнено" },
  { value: "partial", label: "Частично" },
  { value: "not_completed", label: "Не выполнено" },
  { value: "not_assigned", label: "Не задавалось" },
] as const;

function normalizeHomeworkReview(review?: OfflineHomeworkReview | null): OfflineHomeworkReview {
  return {
    status: review?.status ?? "not_checked",
    completionPercent: review?.completionPercent ?? null,
    difficulties: review?.difficulties ?? "",
    notCompletedReason: review?.notCompletedReason ?? "",
  };
}

function StudentLessonCheckCard({
  student,
  canEdit,
  showHomeworkReview,
  draft,
  onChange,
}: {
  student: TeacherOfflineStudent;
  canEdit: boolean;
  showHomeworkReview: boolean;
  draft: StudentLessonCheckDraft;
  onChange: (draft: StudentLessonCheckDraft) => void;
}) {
  const { attendanceStatus, teacherNote, homeworkReview } = draft;
  const attended = ["present", "late"].includes(attendanceStatus);
  const homeworkNeedsReason = homeworkReview.status === "not_completed";
  const homeworkNeedsDifficulties = homeworkReview.status === "partial";
  const disabled = !canEdit;

  function chooseHomeworkStatus(status: OfflineHomeworkReview["status"]) {
    onChange({
      ...draft,
      homeworkReview: {
        ...homeworkReview,
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
        difficulties: status === "partial" || status === "completed" ? homeworkReview.difficulties : "",
        notCompletedReason: status === "not_completed" ? homeworkReview.notCompletedReason : "",
      },
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{student.name}</p>
          {student.isLead ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-gold">
              Клиент из заявки · карточка ученика не создана
            </p>
          ) : null}
          {student.phone ? <p className="mt-1 text-xs text-stone-500">{student.phone}</p> : null}
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
            attendanceClasses[attendanceStatus] ?? attendanceClasses.unmarked
          }`}
        >
          {attendanceLabels[attendanceStatus] ?? attendanceLabels.unmarked}
        </span>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
          Посещаемость
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {attendanceOptions.map(({ value, label, icon: Icon, active }) => {
            const selected = attendanceStatus === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, attendanceStatus: value })}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${
                  selected ? active : "border-stone-200 bg-white text-stone-500"
                }`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {showHomeworkReview && attended ? (
        <fieldset className="mt-5 border-t border-stone-100 pt-5">
          <legend className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
            <BookCheck size={15} className="text-gold" />
            Выполнение прошлого ДЗ
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {homeworkOptions.map(({ value, label }) => {
              const selected = homeworkReview.status === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => chooseHomeworkStatus(value)}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${
                    selected
                      ? "border-gold bg-amber-50 text-amber-950"
                      : "border-stone-200 bg-white text-stone-500"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {["completed", "partial"].includes(homeworkReview.status) ? (
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`homework-percent-${student.crmStudentId}`} className="text-sm font-bold text-stone-700">
                  Выполнено примерно
                </label>
                <strong className="text-lg text-emerald-700">{homeworkReview.completionPercent ?? 0}%</strong>
              </div>
              <input
                id={`homework-percent-${student.crmStudentId}`}
                type="range"
                min={10}
                max={100}
                step={10}
                value={homeworkReview.completionPercent ?? 50}
                disabled={disabled}
                onChange={(event) => {
                  const completionPercent = Number(event.target.value);
                  onChange({
                    ...draft,
                    homeworkReview: {
                      ...homeworkReview,
                      status: completionPercent === 100 ? "completed" : "partial",
                      completionPercent,
                    },
                  });
                }}
                className="mt-3 w-full accent-emerald-700"
              />
              <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                Трудности или что осталось доделать
                <textarea
                  value={homeworkReview.difficulties ?? ""}
                  disabled={disabled}
                  onChange={(event) => onChange({
                    ...draft,
                    homeworkReview: { ...homeworkReview, difficulties: event.target.value },
                  })}
                  className="mt-2 min-h-20 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm normal-case tracking-normal"
                  placeholder="Например: не получается переход между аккордами"
                />
              </label>
              {homeworkNeedsDifficulties && !homeworkReview.difficulties?.trim() ? (
                <p className="mt-2 text-xs font-semibold text-amber-800">Укажите, что осталось доделать.</p>
              ) : null}
            </div>
          ) : null}

          {homeworkNeedsReason ? (
            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-red-700">
              Почему домашнее задание не выполнено
              <textarea
                value={homeworkReview.notCompletedReason ?? ""}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...draft,
                  homeworkReview: { ...homeworkReview, notCompletedReason: event.target.value },
                })}
                className="mt-2 min-h-20 w-full rounded-xl border border-red-200 bg-red-50/40 px-3 py-2 text-sm normal-case tracking-normal text-stone-800"
                placeholder="Причина обязательна"
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
        {attended ? "Комментарий по ученику" : "Комментарий или причина отсутствия"}
        <textarea
          value={teacherNote}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, teacherNote: event.target.value })}
          className="mt-2 min-h-16 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm normal-case tracking-normal"
          placeholder={attended ? "Необязательная заметка" : "Что произошло?"}
        />
      </label>

    </div>
  );
}
