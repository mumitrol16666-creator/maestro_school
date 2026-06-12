import type { LessonFormValues } from "@/components/lesson-editor-form";
import type { CmsLesson } from "@/types/cms";

export const emptyLessonForm: LessonFormValues = {
  title: "",
  description: "",
  videoUrl: "",
  pointsReward: 0,
  sortOrder: 0,
  enableAskTeacher: false,
  enableLessonSignup: false,
  signupMode: "course",
  signupCourseId: "",
  signupExternalUrl: "",
  signupLabel: "Записаться на урок",
};

export function lessonFormFromCms(lesson: CmsLesson): LessonFormValues {
  return {
    title: lesson.title,
    description: lesson.description ?? "",
    videoUrl: lesson.videoUrl ?? "",
    pointsReward: lesson.pointsReward,
    sortOrder: lesson.sortOrder,
    enableAskTeacher: lesson.enableAskTeacher,
    enableLessonSignup: lesson.enableLessonSignup,
    signupMode: lesson.signupExternalUrl ? "external" : "course",
    signupCourseId: lesson.signupCourseId ?? "",
    signupExternalUrl: lesson.signupExternalUrl ?? "",
    signupLabel: lesson.signupLabel ?? "Записаться на урок",
  };
}

export function serializeLessonForm(form: LessonFormValues, moduleId: string) {
  const signupCourseId = form.enableLessonSignup && form.signupMode === "course"
    ? form.signupCourseId || null
    : null;
  const signupExternalUrl = form.enableLessonSignup && form.signupMode === "external"
    ? form.signupExternalUrl.trim() || null
    : null;

  return {
    moduleId,
    title: form.title,
    description: form.description || null,
    videoUrl: form.videoUrl || null,
    pointsReward: form.pointsReward,
    sortOrder: form.sortOrder,
    enableAskTeacher: form.enableAskTeacher,
    enableLessonSignup: form.enableLessonSignup,
    signupCourseId,
    signupExternalUrl,
    signupLabel: form.enableLessonSignup ? form.signupLabel.trim() || "Записаться на урок" : null,
  };
}
