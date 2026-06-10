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
npm run smoke    # регистрация и быстрая проверка production API
```

## Матрица проверки

| # | Шаг | Backend API | Frontend UI | Статус |
|---|-----|-------------|-------------|--------|
| 1 | Админ создаёт курс | `POST /admin/courses` + modules/lessons/materials/homework + publish | `/admin/courses` | ✅ Работает |
| 2 | Ученик видит курс | `GET /courses` (опубликованные) | «Доступные курсы» / «Мои курсы» после зачисления | ✅ Работает |
| 3 | Уроки открываются правильно | Learning Engine: L1 `available`, L2 `locked` → после L1 `completed` → L2 `available` | Статусы на `/courses/:id` | ✅ Работает |
| 4 | Видео отображается | защищенный `GET /lessons/:id` → `videoUrl` | Встроенный Lesson Video Player | ✅ Работает |
| 5 | PDF открывается | `materials[].url` в ответе урока | Ссылка `<a href={url}>` открывает в новой вкладке | ✅ Работает при валидном URL |
| 6 | Домашка отправляется | `POST /homeworks/:id/submissions` → `submitted` | Форма на `/lessons/:id` | ✅ Работает |
| 7 | Админ принимает | `PATCH /homeworks/submissions/:id/review` | `/admin/homework-review` | ✅ Работает |
| 8 | Баллы начисляются | `points_transactions` + `calculateStudentPoints()` | Отображаются на dashboard/progress | ✅ Работает |
| 9 | Следующий урок открывается | `unlockNextLesson` после approve | Статус `available` на странице курса | ✅ Работает |

## Важные нюансы

### Зачисление на курс

Ученик просматривает опубликованный курс без зачисления и нажимает
«Начать обучение». Только `POST /courses/:courseId/enroll` создает
`StudentCourse`; повторный запрос не создает дубликат.

### Видео

Backend сохраняет `videoUrl` (YouTube/Vimeo/Cloudflare), а frontend показывает
его через общий Lesson Video Player только зачисленному ученику.

### Проверка домашек админом

Проверка выполняется в существующем разделе `/admin/homework-review`.

### PDF

Работает как внешняя ссылка. Для seed: `example.com` — заглушка. В e2e используется реальный тестовый PDF: `w3.org/.../dummy.pdf`.

## Ручная проверка в браузере

1. Войти администратором из `ADMIN_*` → `/admin/courses` → создать и опубликовать курс.
2. Зарегистрировать нового ученика → открыть курс → нажать «Начать обучение».
3. Урок 1 → «Начать урок» → отправить ДЗ.
4. Администратор принимает работу в `/admin/homework-review`.
5. Ученик видит баллы и доступный урок 2.
