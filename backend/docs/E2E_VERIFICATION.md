# E2E Verification — главный сценарий Maestro

Проверка полного цикла: админ создаёт курс → ученик проходит уроки.

## Как запустить

```bash
# Terminal 1
cd backend
docker compose up -d
npm run db:migrate && npm run db:seed
npm run dev

# Terminal 2
npm run e2e      # полный цикл (admin CMS + student learning)
npm run smoke    # seed-сценарий (быстрая проверка)
```

## Матрица проверки

| # | Шаг | Backend API | Frontend UI | Статус |
|---|-----|-------------|-------------|--------|
| 1 | Админ создаёт курс | `POST /admin/courses` + modules/lessons/materials/homework + publish | `/admin/courses` | ✅ Работает |
| 2 | Ученик видит курс | `GET /courses` (опубликованные) | «Доступные курсы» / «Мои курсы» после зачисления | ✅ Работает |
| 3 | Уроки открываются правильно | Learning Engine: L1 `available`, L2 `locked` → после L1 `completed` → L2 `available` | Статусы на `/courses/:id` | ✅ Работает |
| 4 | Видео отображается | `GET /lessons/:id` → `videoUrl` в ответе | **Плейсхолдер** «Плеер будет подключен позднее» — `videoUrl` не используется | ⚠️ API да, UI нет |
| 5 | PDF открывается | `materials[].url` в ответе урока | Ссылка `<a href={url}>` открывает в новой вкладке | ✅ Работает при валидном URL |
| 6 | Домашка отправляется | `POST /homeworks/:id/submissions` → `submitted` | Форма на `/lessons/:id` | ✅ Работает |
| 7 | Админ принимает | `PATCH /homeworks/submissions/:id/review` | **Нет UI** — только API | ⚠️ API да, UI нет |
| 8 | Баллы начисляются | `points_transactions` + `calculateStudentPoints()` | Отображаются на dashboard/progress | ✅ Работает |
| 9 | Следующий урок открывается | `unlockNextLesson` после approve | Статус `available` на странице курса | ✅ Работает |

## Важные нюансы

### Зачисление на курс

После стабилизации: при первом обращении ученика к курсу (`GET /students/me/progress?courseId=...` или `POST /lessons/:id/start`) выполняется **auto-enroll** в опубликованный курс.

На странице «Курсы» новый курс сначала в «Доступные» (заблокированная карточка). После открытия `/courses/:id` (прямая ссылка) — зачисление → при обновлении списка курс переходит в «Мои курсы».

### Видео

Backend сохраняет и отдаёт `videoUrl` (YouTube/Vimeo/Cloudflare). Frontend показывает заглушку — подключение плеера отдельная задача.

### Проверка домашек админом

API готов (`homework.review`). UI для ревью в admin panel **не реализован** — использовать API, smoke/e2e скрипты, или следующий модуль «преподаватели».

### PDF

Работает как внешняя ссылка. Для seed: `example.com` — заглушка. В e2e используется реальный тестовый PDF: `w3.org/.../dummy.pdf`.

## Ручная проверка в браузере

1. `admin@maestro.local` / `admin123` → `/admin/courses` → создать и опубликовать курс
2. `student@maestro.local` / `student123` → открыть `/courses/<courseId>` напрямую
3. Урок 1 → «Начать урок» → отправить ДЗ
4. Admin: `PATCH /api/v1/homeworks/submissions/<id>/review` через curl/Postman
5. Student: обновить progress — баллы + урок 2 доступен
