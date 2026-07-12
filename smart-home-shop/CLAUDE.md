# Smart Home Shop (local MVP)

## Состояние проекта (2026-07-12)

**Активное развитие**: Да, проект восстановлен и полностью функционален.

### Что работает ✅
- **Фронт**: каталог товаров с фильтрацией, карточка товара, галерея, характеристики
- **Корзина и оформление**: полный цикл покупки, кабинет заказов
- **Админка**: редактор товаров, категорий, заказов, брендов, характеристик
- **БД**: Turso (SQLite), все схемы инициализированы
- **Тесты**: 90% сценариев зелены (2 известных сбоя, см. ниже)
- **Качество**: кодировка UTF-8, TypeScript, ESLint, Playwright e2e
- **Интеграции**: парсеры для Hite, Larnitech, Loxone, WirenBoard каталогов

### Что нуждается в доделке ❌
1. **Admin products endpoint** — мешает тестам, нужна диагностика (возможно race condition)
2. **Catalog golden snapshot** — дб дрифтует, нужен механизм sync или update

### Ключевые файлы
- `server.js` — Express точка входа
- `routes/` — маршруты (admin, public, orders, session)
- `public/` — фронт (HTML, JS, CSS)
- `db/` — БД migrations и schemas
- `scripts/` — утилиты импорта, аудита, нормализации данных
- `test/` — Playwright e2e + node --test интеграционные тесты
- `AGENTS.md` — обязательное прочтение перед правками (encoding, UI safety)

## Быстрый старт

```bash
cd F:\Projects\smart-home-shop
npm install
npm run start
```

Сайт: `http://localhost:3030`
Админка: `http://localhost:3030/admin` (токен из `.env`)

## Архитектура

```
Frontend (público/)
  ├─ app.js — главная страница + фильтры
  ├─ brand-pages.js — страницы брендов
  ├─ cart.js — корзина и оформление
  ├─ admin-new.js/html — редактор админки
  └─ admin-styles.css

Express Server (server.js)
  ├─ Public API: GET /api/shop/* (catalog, filters, cart, orders)
  ├─ Admin API: /api/admin/* (requires token, see AGENTS.md)
  ├─ Session: /api/session/* (login, logout)
  └─ Page routes: / /product/:id /brand/:brand /admin

DB (Turso + better-sqlite3)
  ├─ products, variants, media, documents
  ├─ categories, brands, attributes
  ├─ orders, order items
  └─ audit logs

Services (services/)
  ├─ parsers: hite, larnitech, loxone, wirenboard
  ├─ db: query builders, migrations
  └─ utils: encoding, normalization
```

## Перед коммитом (обязательно!)

```bash
npm run encoding:check        # UTF-8 validation
npm run check:encoding-ui     # UI text sanity in browser
npm run verify                # full gate: encoding + lint + tests
```

Если что-то упадет:
```bash
npm run encoding:fix          # fix encoding issues
npm run lint:eslint -- --fix  # auto-fix style
```

## Запуск тестов

```bash
npm test                      # все тесты (unit + e2e)
npm run test:unit            # vitest только
npm run test:node            # node --test только (e2e)
npm run test:unit:allure     # с отчетом Allure
```

### Известные сбои тестов
- **admin products endpoint**: 10sec timeout, нужна диагностика в `test/admin.test.js`
- **catalog golden master**: БД обновлена, нужен `npm run snapshot:catalog:update`

## Деплой

### Локальный
```bash
npm run start
# или с live reload:
npm run dev
```

### Vercel (текущий)
`.vercelignore` исключает tmp файлы. Env vars в Vercel dashboard:
- `ADMIN_TOKEN` — секретный токен для админки
- `SENTRY_DSN` — для production ошибок
- `CORS_ALLOWED_ORIGINS` — допустимые origins

```bash
npx vercel deploy --prod
```

### Railway / Render
Есть конфиги `railway.toml` и `render.yaml`. Оба работают, но Vercel — основной.

## Кодировка (КРИТИЧНО!)

**ЗАПРЕЩЕНО:**
- Использовать PowerShell `>` / `>>` для правки JS/HTML
- Сохранять файлы в UTF-16 или Cyrillic-specific кодировках

**ОБЯЗАТЕЛЬНО:**
- Все текстовые файлы = UTF-8 BOM (default VSCode UTF-8)
- Перед финализацией: `npm run encoding:check`
- Если найдена mojibake (`Р`, `С`, `Ð`, `Ñ`), остановить работу и пересохранить

## Админ API

Требует `ADMIN_TOKEN` (по умолчанию `1`). Endpoints:
- `GET /api/admin/products` — список товаров (с фильтрацией)
- `POST /api/admin/products` — создать товар
- `PATCH /api/admin/products/:id` — обновить товар
- `DELETE /api/admin/products/:id` — удалить товар

Все админ-операции логируются в `audit_log`.

## БД команды

```bash
npm run db:init                    # инициализация схемы
npm run audit:catalog              # проверить целостность
npm run snapshot:catalog:update    # обновить golden snapshot
npm run clean:quality              # очистить известные issues
npm run db:normalize:catalog       # нормализация атрибутов
```

## Окружение

`.env.example` → `.env`:
- `PORT=3030`
- `ADMIN_TOKEN=1` (менять в production!)
- `DISABLE_ADMIN_AUTH=0` — require токен (1 = отключить)
- `CORS_ALLOWED_ORIGINS` — comma-separated origins
- `CSP_REPORT_ONLY=0` — enforce Content-Security-Policy (1 = report-only)

## Контакт

Проект: smart-home equipment shop
Автор: Александр
Git branch: `main` (release branch: `origin/release/catalog-prep-2026-03-17`)
Last update: 2026-07-12
