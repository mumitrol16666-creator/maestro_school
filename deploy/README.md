# Деплой Maestro School на VPS

Автоматический деплой через **GitHub Actions** на сервер:

| Параметр | Значение |
|----------|----------|
| Host | `178.105.59.89` |
| SSH port | `14579` |
| User | `root` |
| App path | `/var/www/maestro_school` |
| Web | `http://178.105.59.89:3000` |
| API | `http://178.105.59.89:4000/api/v1` |

Workflow: `.github/workflows/deploy.yml` — срабатывает при push в `main`.

---

## 1. Подготовка сервера (один раз)

Подключитесь по SSH:

```bash
ssh -p 14579 root@178.105.59.89
```

Скопируйте и выполните (или после первого push — скрипт уже в репо):

```bash
curl -fsSL https://raw.githubusercontent.com/mumitrol16666-creator/maestro_school/main/deploy/setup-server.sh | bash
```

Или вручную: Docker, Node.js 20, PM2, порты `3000` и `4000` открыты в firewall.

---

## 2. SSH-ключ для GitHub Actions

**На своём Mac:**

```bash
ssh-keygen -t ed25519 -C "github-actions-maestro" -f ~/.ssh/maestro_deploy -N ""
cat ~/.ssh/maestro_deploy.pub
```

**На сервере** добавьте публичный ключ:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ВАШ_ПУБЛИЧНЫЙ_КЛЮЧ" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**В GitHub** → репозиторий → **Settings → Secrets and variables → Actions**:

| Secret | Обязательно | Пример |
|--------|-------------|--------|
| `SSH_PRIVATE_KEY` | ✅ | содержимое `~/.ssh/maestro_deploy` (приватный ключ) |
| `JWT_SECRET` | ✅ | длинная случайная строка (мин. 16 символов) |
| `POSTGRES_PASSWORD` | ✅ | надёжный пароль БД |
| `CORS_ORIGIN` | опционально | `http://178.105.59.89:3000` |
| `API_PUBLIC_URL` | опционально | `http://178.105.59.89:4000/api/v1` |
| `RUN_SEED` | опционально | `true` — только при **первом** деплое (демо-данные) |

---

## 3. Запуск деплоя

```bash
git add .
git commit -m "Add GitHub Actions deploy"
git push origin main
```

Или вручную: **Actions → Deploy to VPS → Run workflow**.

---

## 4. Что делает deploy.sh

1. Поднимает PostgreSQL (`docker-compose.prod.yml`)
2. Пишет `backend/.env` и `web_app/.env.local`
3. `npm ci` + Prisma migrate + build backend и frontend
4. Перезапуск через PM2 (`maestro-api`, `maestro-web`)
5. Health check: `/health` и порт `3000`

---

## 5. Проверка после деплоя

```bash
ssh -p 14579 root@178.105.59.89
pm2 status
curl http://127.0.0.1:4000/health
```

В браузере: http://178.105.59.89:3000/login

Демо (если был `RUN_SEED=true`):
- `admin@maestro.local` / `admin123`
- `student@maestro.local` / `student123`

---

## 6. Логи и перезапуск

```bash
pm2 logs maestro-api
pm2 logs maestro-web
pm2 restart all
```

---

## Безопасность

- Смените `POSTGRES_PASSWORD` и `JWT_SECRET` на уникальные значения
- SSH только по ключу, порт `14579`
- PostgreSQL слушает только `127.0.0.1:5432`
- Для продакшена позже: домен + Nginx + HTTPS
