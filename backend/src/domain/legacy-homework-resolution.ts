import { BadRequestError, ConflictError } from "./errors.js";

export type LegacyDecision = "accepted" | "continue" | "obsolete";
export type LegacyDecisionEvent = {
  decision: LegacyDecision; comment: string; actorId: string; actorName: string;
  at: string; requestKey: string; expectedRevision: number;
};
export type LegacyResolution = {
  decision: string; comment: string; revision: number; history: unknown;
};

export function prepareLegacyDecision(current: LegacyResolution | null, event: LegacyDecisionEvent) {
  const history = Array.isArray(current?.history) ? current.history as LegacyDecisionEvent[] : [];
  const previous = history.find(item => item.requestKey === event.requestKey);
  if (previous) {
    if (previous.actorId !== event.actorId || previous.decision !== event.decision || previous.comment !== event.comment || previous.expectedRevision !== event.expectedRevision) {
      throw new ConflictError("Этот запрос уже использован для другого решения", "HOMEWORK_IDEMPOTENCY_CONFLICT");
    }
    return { idempotent: true, history, revision: current!.revision };
  }
  if (event.expectedRevision !== (current?.revision ?? 0)) {
    throw new ConflictError("Задание уже изменено. Обновите список перед сохранением", "HOMEWORK_STALE_VERSION");
  }
  if (event.decision !== "accepted" && !event.comment.trim()) {
    throw new BadRequestError("Укажите, что продолжить или почему задание неактуально");
  }
  return { idempotent: false, history: [...history, event], revision: (current?.revision ?? 0) + 1 };
}
