import type { HomeworkTestQuestion } from "./homework-test.js";

export interface PreparedTestTemplate {
  id: string;
  title: string;
  description: string;
  questions: HomeworkTestQuestion[];
}

/** Built-in starter tests. Applying one copies its questions into the homework as an editable snapshot. */
export const preparedTestTemplates: PreparedTestTemplate[] = [
  {
    id: "music-literacy-basics",
    title: "Музыкальная грамота: основы",
    description: "Ноты, длительности и базовые обозначения.",
    questions: [
      { id: "mlb-1", prompt: "Сколько долей содержит целая нота в размере 4/4?", correctOptionId: "mlb-1-a", options: [{ id: "mlb-1-a", text: "4" }, { id: "mlb-1-b", text: "2" }, { id: "mlb-1-c", text: "1" }] },
      { id: "mlb-2", prompt: "Как называется знак, который повышает ноту на полтона?", correctOptionId: "mlb-2-b", options: [{ id: "mlb-2-a", text: "Бемоль" }, { id: "mlb-2-b", text: "Диез" }, { id: "mlb-2-c", text: "Бекар" }] },
      { id: "mlb-3", prompt: "Какой ключ обычно используют для записи высоких звуков?", correctOptionId: "mlb-3-a", options: [{ id: "mlb-3-a", text: "Скрипичный" }, { id: "mlb-3-b", text: "Басовый" }, { id: "mlb-3-c", text: "Альтовый" }] },
      { id: "mlb-4", prompt: "Чему равна длительность половинной ноты в размере 4/4?", correctOptionId: "mlb-4-c", options: [{ id: "mlb-4-a", text: "4 доли" }, { id: "mlb-4-b", text: "1 доля" }, { id: "mlb-4-c", text: "2 доли" }] },
      { id: "mlb-5", prompt: "Что показывает размер такта?", correctOptionId: "mlb-5-b", options: [{ id: "mlb-5-a", text: "Только темп" }, { id: "mlb-5-b", text: "Количество и длительность долей" }, { id: "mlb-5-c", text: "Высоту звука" }] },
    ],
  },
  {
    id: "music-instruments-basics",
    title: "Музыкальные инструменты",
    description: "Семейства инструментов и способы звукоизвлечения.",
    questions: [
      { id: "mib-1", prompt: "К какому семейству относится скрипка?", correctOptionId: "mib-1-c", options: [{ id: "mib-1-a", text: "Духовые" }, { id: "mib-1-b", text: "Ударные" }, { id: "mib-1-c", text: "Струнные" }] },
      { id: "mib-2", prompt: "Какой инструмент относится к клавишным?", correctOptionId: "mib-2-a", options: [{ id: "mib-2-a", text: "Фортепиано" }, { id: "mib-2-b", text: "Труба" }, { id: "mib-2-c", text: "Скрипка" }] },
      { id: "mib-3", prompt: "Как извлекают звук из флейты?", correctOptionId: "mib-3-b", options: [{ id: "mib-3-a", text: "Ударом по мембране" }, { id: "mib-3-b", text: "Потоком воздуха" }, { id: "mib-3-c", text: "Щипком струны" }] },
      { id: "mib-4", prompt: "Какой инструмент имеет струны и смычок?", correctOptionId: "mib-4-a", options: [{ id: "mib-4-a", text: "Виолончель" }, { id: "mib-4-b", text: "Кларнет" }, { id: "mib-4-c", text: "Ксилофон" }] },
      { id: "mib-5", prompt: "К какой группе относится барабан?", correctOptionId: "mib-5-b", options: [{ id: "mib-5-a", text: "Струнные" }, { id: "mib-5-b", text: "Ударные" }, { id: "mib-5-c", text: "Клавишные" }] },
    ],
  },
];

export function listPreparedTestTemplates() {
  return preparedTestTemplates;
}
