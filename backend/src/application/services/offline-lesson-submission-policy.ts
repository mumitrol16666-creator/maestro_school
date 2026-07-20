type HomeworkReview = {
  status?: string | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
} | null;

type SubmissionStudent = {
  name?: string;
  attendanceStatus?: string | null;
  homeworkReview?: HomeworkReview;
};

type SubmissionLesson = {
  classType?: string | null;
  group?: unknown;
};

type SubmissionPayload = {
  topic?: string;
  lessonSummary?: string;
  trialReport?: Record<string, unknown>;
};

const presentStatuses = new Set(["present", "late"]);
const absentStatuses = new Set(["excused_absence", "unexcused_absence", "emergency_freeze"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function trialReportReady(report: Record<string, unknown> | undefined) {
  if (!report) return false;
  const studentProfile = object(report.studentProfile);
  const teacherAssessment = object(report.teacherAssessment);
  const lessonFacts = object(report.lessonFacts);
  const recommendation = object(report.recommendation);
  const salesSignals = object(report.salesSignals);

  return Boolean(
    text(studentProfile.priorExperience)
      && studentProfile.priorExperience !== "unknown"
      && text(studentProfile.motivation)
      && studentProfile.motivation !== "unclear"
      && teacherAssessment.interestLevel
      && teacherAssessment.contactLevel
      && text(lessonFacts.whatWasTested)
      && text(lessonFacts.whatWorkedWell)
      && text(recommendation.recommendedFormat)
      && recommendation.recommendedFormat !== "undecided"
      && salesSignals.buyProbability
      && text(salesSignals.teacherSalesComment),
  );
}

export function validateOfflineLessonSubmission(params: {
  lesson: SubmissionLesson;
  students: SubmissionStudent[];
  payload: SubmissionPayload;
}) {
  const { lesson, students, payload } = params;

  if (!students.length) {
    return {
      valid: false as const,
      message: "В уроке не найден ученик. Обновите страницу или обратитесь к администратору.",
      code: "LESSON_ROSTER_EMPTY",
    };
  }

  const unmarked = students.filter((student) => (
    !student.attendanceStatus || student.attendanceStatus === "unmarked"
  ));
  if (unmarked.length) {
    return {
      valid: false as const,
      message: `Отметьте посещаемость у всех учеников. Осталось: ${unmarked.length}.`,
      code: "LESSON_ATTENDANCE_INCOMPLETE",
    };
  }

  const allAbsent = students.every((student) => absentStatuses.has(student.attendanceStatus ?? ""));
  if (allAbsent) {
    return {
      valid: true as const,
      outcome: "no_submission" as const,
      requiresReport: false,
    };
  }

  const presentStudents = students.filter((student) => presentStatuses.has(student.attendanceStatus ?? ""));
  if (!presentStudents.length) {
    return {
      valid: false as const,
      message: "Проверьте отметки посещаемости перед отправкой.",
      code: "LESSON_ATTENDANCE_INVALID",
    };
  }

  const isTrial = lesson.classType === "trial";
  const isIndividual = !isTrial && (lesson.classType === "individual" || (!lesson.group && students.length === 1));
  if (isIndividual) {
    for (const student of presentStudents) {
      const homework = student.homeworkReview;
      if (!homework?.status || homework.status === "not_checked") {
        return {
          valid: false as const,
          message: "Укажите, как выполнено прошлое домашнее задание.",
          code: "LESSON_HOMEWORK_REVIEW_REQUIRED",
        };
      }
      if (homework.status === "partial" && !text(homework.difficulties)) {
        return {
          valid: false as const,
          message: `Укажите для ${student.name || "ученика"}, что осталось доделать по домашнему заданию.`,
          code: "LESSON_HOMEWORK_DIFFICULTIES_REQUIRED",
        };
      }
      if (homework.status === "not_completed" && !text(homework.notCompletedReason)) {
        return {
          valid: false as const,
          message: `Укажите причину невыполненного домашнего задания для ${student.name || "ученика"}.`,
          code: "LESSON_HOMEWORK_REASON_REQUIRED",
        };
      }
    }
  }

  if (isTrial && !trialReportReady(payload.trialReport)) {
    return {
      valid: false as const,
      message: "Заполните обязательные пункты анкеты пробного урока.",
      code: "TRIAL_REPORT_INCOMPLETE",
    };
  }
  if (!isTrial && !text(payload.topic)) {
    return {
      valid: false as const,
      message: "Укажите тему урока.",
      code: "LESSON_TOPIC_REQUIRED",
    };
  }
  if (!isTrial && !text(payload.lessonSummary)) {
    return {
      valid: false as const,
      message: "Заполните итог урока.",
      code: "LESSON_SUMMARY_REQUIRED",
    };
  }

  return {
    valid: true as const,
    outcome: "held" as const,
    requiresReport: true,
  };
}
