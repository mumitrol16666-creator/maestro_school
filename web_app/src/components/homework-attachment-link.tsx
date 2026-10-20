"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { isPrivateHomeworkFile, learningHomeworkApi } from "@/lib/learning-homework-api";

/**
 * Plan 2.5: the attachment of a course homework answer — a link, or a private file that is
 * downloaded with the session.
 */
export function HomeworkAttachmentLink({ url, className }: { url: string; className: string }) {
  const [error, setError] = useState<string | null>(null);
  if (!isPrivateHomeworkFile(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className}>
        <ExternalLink size={14} /> Открыть материал
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setError(null);
          void learningHomeworkApi
            .downloadMaterial({ type: "file", url, title: "Файл ученика" })
            .catch((reason) => setError(reason instanceof ApiError ? reason.message : "Не удалось скачать файл"));
        }}
      >
        <Download size={14} /> Скачать файл
      </button>
      {error ? <span className="ml-2 text-xs font-bold text-red-700">{error}</span> : null}
    </>
  );
}
