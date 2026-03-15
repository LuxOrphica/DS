# Smart Home Shop (local MVP)

Локальный MVP интернет-магазина оборудования для умного дома.

## Что есть сейчас
- Каталог товаров по категориям.
- Корзина: добавление, удаление, изменение количества.
- Оформление заказа (имя, телефон, адрес, комментарий, способ оплаты).
- Сохранение заказов на сервере в `data/orders.json`.

## Запуск локально
```bash
cd f:\Projects\smart-home-shop
npm install
npm run start
```
Откройте `http://localhost:3030`.

## Куда смотреть заказы
- `f:\Projects\smart-home-shop\data\orders.json`

## AI-ретушь фото товаров (вариант 3)
- Скрипт: `scripts/ai_retouch_product_images.js`
- Результат картинок: `public/media/products/ai`
- Отчет: `data/import/ai-retouch-report.json`

Команды:
```bash
npm run images:retouch:dry
npm run images:retouch
```

Параметры вручную:
```bash
node scripts/ai_retouch_product_images.js 100 --offset=0 --quality=high --size=1024x1024
node scripts/ai_retouch_product_images.js 100 --dry-run
```

Важно:
- Для реальной генерации нужен `OPENAI_API_KEY`.
- После успешной обработки скрипт автоматически обновляет поле `image` у товаров в БД на локальные пути вида `/media/products/ai/<id>.png`.

## Что добавить дальше для боевого запуска
- Подключить онлайн-оплату (например, ЮKassa/CloudPayments/Тинькофф).
- Интеграцию с доставкой (СДЭК/Boxberry/Яндекс Доставка).
- Админку для статусов заказа и остатков.
- БД (PostgreSQL/MySQL) вместо JSON.
- Авторизацию и защиту API.
