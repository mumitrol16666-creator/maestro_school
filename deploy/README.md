# Деплой Maestro School на VPS

Автоматический деплой через **GitHub Actions** на сервер:

| Параметр | Значение |
|----------|----------|
| Host | `178.105.59.89` |
| SSH port | `14579` |
| User | `root` |
| App path | `/var/www/maestro_school` |
| **Домен** | `https://maestro-school.duckdns.org` |
| Web | `https://maestro-school.duckdns.org` |
| API | `https://maestro-school.duckdns.org/api/v1` |
| IP (fallback) | `http://178.105.59.89:3000` |

Workflow: `.github/workflows/deploy.yml` — срабатывает при push в `main`.

---

## 1. Подготовка сервера (один раз)

Подключитесь по SSH:

```bash
ssh -p 14579 root@178.105.59.89
```

`deploy.sh` **сам установит** Docker, Node.js 20 и PM2 при первом деплое (Ubuntu/Debian).

Опционально вручную: откройте порты `3000` и `4000` в firewall.

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
| `CORS_ORIGIN` | опционально | `https://maestro-school.duckdns.org` (дефолт в deploy.sh) |
| `API_PUBLIC_URL` | опционально | `https://maestro-school.duckdns.org/api/v1` (дефолт в deploy.sh) |
| `ADMIN_EMAIL` | ✅ (первый деплой) | email администратора, например `admin@your-school.ru` |
| `ADMIN_PASSWORD` | ✅ (первый деплой) | пароль, 8–72 символа |
| `ADMIN_FIRST_NAME` | ✅ (первый деплой) | имя, например `Анна` |
| `ADMIN_LAST_NAME` | ✅ (первый деплой) | фамилия, например `Иванова` |
| `VAPID_PUBLIC_KEY` | для push | `npx tsx backend/scripts/generate-vapid-keys.ts` |
| `VAPID_PRIVATE_KEY` | для push | пара к `VAPID_PUBLIC_KEY` |
| `VAPID_SUBJECT` | опционально | `mailto:admin@your-school.ru` |

После первого успешного деплоя значения сохраняются на сервере в `/var/lib/maestro/deploy.env` и могут не передаваться повторно.

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
3. `npm ci` + Prisma migrate + идемпотентный production seed
4. Создает постоянное хранилище файлов `/var/lib/maestro/uploads`
5. Собирает backend и frontend, затем перезапускает PM2
6. Проверяет API, PostgreSQL и frontend

---

## 5. Проверка после деплоя

```bash
ssh -p 14579 root@178.105.59.89
pm2 status
curl http://127.0.0.1:4000/health
```

В браузере: https://maestro-school.duckdns.org/login

Вход администратора выполняется с `ADMIN_EMAIL` и `ADMIN_PASSWORD`.
Ученики самостоятельно регистрируются на странице `/register`.

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
- Nginx: `deploy/nginx-maestro-school.conf` → `/etc/nginx/sites-available/maestro`
- HTTPS: `certbot --nginx -d maestro-school.duckdns.org`
- Второй поддомен для API **не нужен** — `/api/` на том же домене
