export type MaterialKind = "video" | "image" | "pdf" | "audio" | "file" | "link";

export type MaterialLibraryItem = {
  id: string;
  kind: MaterialKind;
  title: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  badge: string;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
};

export type ShareableCourse = {
  id: string;
  title: string;
  lessons: Array<{ id: string; title: string; moduleTitle: string; hasVideo: boolean }>;
};

export type StudentLessonShare = {
  id: string;
  note: string | null;
  viewedAt: string | null;
  sharedAt: string;
  teacherName: string | null;
  lesson: { id: string; title: string; moduleTitle: string; courseTitle: string };
};

export type StudentLessonShareDetail = StudentLessonShare & {
  content: {
    description: string | null;
    videoUrl: string | null;
    materials: Array<{ id: string; type: string; title: string; url: string }>;
  };
};
