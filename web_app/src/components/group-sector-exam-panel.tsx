"use client";

import { Award, CalendarClock, CheckCircle2, GraduationCap, LoaderCircle, Lock, UserCheck } from "lucide-react";
import { useState } from "react";
import { InProgress, PastResult, type ExamDecisionButton } from "@/components/sector-exam-panel";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { formatExamDate, sectorExamsApi, sectorExamStatusLabel } from "@/lib/sector-exams-api";
import type { SectorExam, TeacherGroupSectorExams } from "@/types/sector-exam";

const control = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

const memberDecisions: ExamDecisionButton[] = [
  { decision: "pass", label: "Сдал", primary: true },
  { decision: "retake", label: "Пересдача" },
];

type GroupSector = TeacherGroupSectorExams["sectors"][number];
type Member = GroupSector["members"][number];

/**
 * Plan 1.13: the group's sector exam. Every member sits their own exam (CRM books them into one
 * lesson); the teacher marks each member and decides "Сдал" or "Пересдача". A member can be
 * counted without an exam. The group moves on when its teacher closes the sector: the 250 Points
 * go only to members who passed, the rest sit a retake later.
 */
export function GroupSectorExamPanel({ crmGroupId, onSectorClosed }: { crmGroupId: string; onSectorClosed?: () => void }) {
  const resource = useApiResource(() => sectorExamsApi.forGroup(crmGroupId), [crmGroupId]);
  if (resource.loading && !resource.data) return null;
  if (resource.error) {
    return <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{resource.error}</p>;
  }
  if (!resource.data?.sectors.length) return null;
  return (
    <div className="mt-5 grid min-w-0 grid-cols-1 gap-4" data-testid="group-sector-exams">
      {resource.data.sectors.map((sector) => (
        <SectorCard
          key={sector.planId}
          crmGroupId={crmGroupId}
          sector={sector}
          onChanged={() => void resource.reload()}
          onClosed={() => { void resource.reload(); onSectorClosed?.(); }}
        />
      ))}
    </div>
  );
}

function SectorCard({ crmGroupId, sector, onChanged, onClosed }: {
  crmGroupId: string;
  sector: GroupSector;
  onChanged: () => void;
  onClosed: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passed = sector.members.filter((member) => member.pass).length;
  const active = sector.status === "active";

  async function close() {
    setBusy(true);
    setError(null);
    try {
      await sectorExamsApi.closeGroupSector(crmGroupId, sector.planId);
      setConfirmClose(false);
      onClosed();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось закрыть сектор");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50/40 p-4" data-testid="group-sector-exam-card">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-900">
          <GraduationCap size={14} className="shrink-0" />
          <span className="min-w-0 break-words">Экзамен сектора группы {sector.sequence} · {sector.direction.title}</span>
        </p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-sky-900">
          {active ? `Сдали ${passed} из ${sector.members.length}` : "Группа перешла дальше"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-600">
        {active
          ? `Темы: ${sector.progress.completed} из ${sector.progress.total}. Каждый ученик сдаёт свой экзамен; 250 баллов получает только сдавший.`
          : "Сектор закрыт. Ученики без зачёта сдают на пересдаче, баллы получают после сдачи."}
      </p>

      <ul className="mt-3 grid min-w-0 grid-cols-1 gap-2">
        {sector.members.map((member) => (
          <MemberRow key={member.crmStudentId} crmGroupId={crmGroupId} sector={sector} member={member} onChanged={onChanged} />
        ))}
      </ul>

      {active ? (
        <div className="mt-4 border-t border-sky-200 pt-3">
          {confirmClose ? (
            <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3" role="alertdialog" aria-label="Закрыть сектор группы">
              <p className="text-xs leading-5 text-amber-950">
                Группа перейдёт к следующему сектору. Сдали {passed} из {sector.members.length}; остальные сдадут на пересдаче.
                Само закрытие баллов не начисляет.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${control} bg-ink text-white`} disabled={busy} onClick={() => void close()}>
                  {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Lock size={14} />} Закрыть сектор группы
                </button>
                <button type="button" className={`${control} border border-stone-200 bg-white text-stone-700`} disabled={busy} onClick={() => setConfirmClose(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={`${control} border border-stone-300 bg-white text-ink`} onClick={() => setConfirmClose(true)}>
              <Lock size={14} /> Группа идёт дальше: закрыть сектор
            </button>
          )}
          {error ? <p className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function MemberRow({ crmGroupId, sector, member, onChanged }: {
  crmGroupId: string;
  sector: GroupSector;
  member: Member;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SectorExam | null>(null);
  const [confirmPass, setConfirmPass] = useState(false);
  const exam = current && member.exam && current.id === member.exam.id ? current : member.exam;

  async function run(key: string, action: () => Promise<SectorExam | void>, reload = false) {
    setBusy(key);
    setError(null);
    try {
      const result = await action();
      if (result) setCurrent(result);
      if (reload) onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  }

  const status = member.pass
    ? member.pass.method === "exam" ? "Сдал экзамен" : "Засчитан без экзамена"
    : exam
      ? `${exam.attempt > 1 ? `Пересдача ${exam.attempt - 1} · ` : ""}${sectorExamStatusLabel[exam.status]}`
      : "Экзамен не назначен";
  const canPassManually = !member.pass && exam?.status !== "in_progress";

  return (
    <li className="min-w-0 rounded-xl border border-stone-200 bg-white p-3" data-testid="group-sector-member">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-bold text-ink">
          {member.name}
          {!member.inGroup ? <span className="ml-1.5 text-[11px] font-semibold text-stone-500">не в группе</span> : null}
        </p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${member.pass ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>
          {member.pass ? <CheckCircle2 size={12} /> : null}{status}
          {member.pass?.points ? ` · +${member.pass.points}` : ""}
        </span>
      </div>

      {!member.pass && exam?.status === "scheduled" ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600">
            <CalendarClock size={13} /> {formatExamDate(exam.scheduledAt) || "Дата назначена"}
          </span>
          <button
            type="button"
            className={`${control} bg-ink text-white`}
            disabled={!member.canStart || busy !== null}
            onClick={() => void run("start", () => sectorExamsApi.start(exam.id))}
          >
            {busy === "start" ? <LoaderCircle size={14} className="animate-spin" /> : <GraduationCap size={14} />} Начать экзамен
          </button>
          {!member.canStart ? <span className="text-[11px] text-amber-900">Начать можно, когда все темы на 100 %.</span> : null}
        </div>
      ) : null}

      {exam?.status === "in_progress" ? <InProgress exam={exam} busy={busy} run={run} decisions={memberDecisions} /> : null}
      {exam?.status === "completed" ? <PastResult exam={exam} /> : null}

      {canPassManually ? (
        <div className="mt-2">
          {confirmPass ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone-600">Засчитать сектор без экзамена и начислить 250 баллов?</span>
              <button
                type="button"
                className={`${control} bg-emerald-700 text-white`}
                disabled={busy !== null}
                onClick={() => void run("pass", async () => { await sectorExamsApi.passMember(crmGroupId, sector.planId, member.crmStudentId); }, true)}
              >
                {busy === "pass" ? <LoaderCircle size={14} className="animate-spin" /> : <Award size={14} />} Засчитать
              </button>
              <button type="button" className={`${control} border border-stone-200 bg-white text-stone-700`} onClick={() => setConfirmPass(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <button type="button" className={`${control} min-h-9 border border-stone-200 bg-white text-stone-700`} onClick={() => setConfirmPass(true)}>
              <UserCheck size={14} /> Засчитать без экзамена
            </button>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
    </li>
  );
}
