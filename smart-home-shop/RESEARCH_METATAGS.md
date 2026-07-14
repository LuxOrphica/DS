# 🏷️ Исследование метатегов и SEO стратегии

**Дата:** 2026-07-14  
**Проект:** delaemseti.shop (Делаем сети)  
**Статус:** Метатеги отсутствуют, нужна полная реализация

---

## 1️⃣ ТЕКУЩЕЕ СОСТОЯНИЕ

### Что есть
```html
<!-- ТОЛЬКО ЭТО: -->
<title>Делаем сети</title>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### Что ОТСУТСТВУЕТ
- ❌ Meta description
- ❌ OG теги (Open Graph для соцсетей)
- ❌ Twitter Card
- ❌ Schema.org структурированные данные (JSON-LD)
- ❌ Canonical URL
- ❌ Language hreflang
- ❌ Robots директивы

**Проблема:** Товары не шарятся правильно в Telegram, VK, Facebook.

---

## 2️⃣ АНАЛИЗ КОНКУРЕНТОВ

### Larnitech (larnitech-rus.ru)
**Стратегия:**
- Фокус: "Умный дом" + "Сделано в Германии"
- Ключевые слова: функциональность (освещение, климат, управление)
- Интеграции: упоминают совместимость (Satel, KNX, Philips Hue)

**Примерный Title:** "Larnitech | Умный дом Made in Germany"  
**Примерный Description:** "Системы умного дома Larnitech. Управление освещением, климатом, безопасностью. Русская поддержка."

### Loxone (smart-port.ru)
**Стратегия:**
- Фокус: "Дистрибьютор" + "Интеграции"
- Ключевые слова: категории (Освещение, Климат, Безопасность)
- Ценность: консультация партнеров

**Примерный Title:** "SmartPort - Дистрибьютор Loxone | Умный дом и автоматизация"  
**Примерный Description:** "Официальный дистрибьютор Loxone в России. Системы автоматизации, освещение, климат-контроль. Консультация и поддержка."

### Hite Pro (hite-pro.ru)
**Стратегия:**
- Фокус: "Беспроводные технологии" + "Российское"
- Ключевые слова: технология (радиовыключатели, датчики)
- Ценность: инновация

**Примерный Title:** "HiTE PRO | Беспроводные решения для умного дома"  
**Примерный Description:** "Российские беспроводные технологии для автоматизации. Выключатели, датчики, контроллеры для умного дома."

---

## 3️⃣ КЛЮЧЕВЫЕ СЛОВА И АУДИТОРИЯ

### Поисковые запросы (логика)
```
Broad:
- "умный дом купить"
- "smart home"
- "автоматизация дома"
- "умная система освещения"

Конкретные (по брендам):
- "Loxone цена"
- "Wiren Board купить"
- "Hite Pro оборудование"
- "Larnitech каталог"

По категориям:
- "выключатель умный дом"
- "датчик движения с освещением"
- "контроллер LED ленты"
- "терморегулятор умный дом"

По случаям:
- "умное освещение для квартиры"
- "система безопасности умный дом"
- "управление климатом дома"
```

### Целевая аудитория
1. **Установщики/интеграторы** (B2B) ← ОСНОВНАЯ
   - Ищут "оптом", "дистрибьютор"
   - Нужны технические спецификации
   - Ценят быстрый заказ

2. **Домовладельцы** (B2C) ← ВТОРИЧНАЯ
   - Ищут "купить", "цена", "отзывы"
   - Нужны простые объяснения
   - Ценят удобство

3. **Дизайнеры/архитекторы** (B2B)
   - Ищут "каталог", "интеграция"
   - Нужны документы и спецификации

---

## 4️⃣ РЕКОМЕНДУЕМАЯ SEO СТРАТЕГИЯ

### Позиционирование
```
"Делаем сети" = Удобный каталог оборудования умного дома 
                для установщиков и домовладельцев
```

### Главное преимущество
- ✅ Все товары в одном месте (вместо разных каталогов)
- ✅ 4 основных бренда (Loxone, Wiren Board, Hite Pro, Larnitech)
- ✅ 643 товара, 8 категорий
- ✅ Быстрый поиск и фильтрация

### Целевые ключевые слова (по приоритету)
```
P1 (HIGH): "умный дом купить", "оборудование умного дома"
P2 (MEDIUM): "Loxone", "Wiren Board", "Hite Pro" + "каталог"
P3 (LOW): специфичные товары ("датчик движения", "контроллер")
```

---

## 5️⃣ ШАБЛОНЫ МЕТАТЕГОВ

### 🏠 Главная страница
```html
<title>Делаем сети | Умный дом, оборудование и автоматизация</title>
<meta name="description" content="Каталог оборудования для умного дома. 643 товара от Loxone, Wiren Board, Hite Pro, Larnitech. Освещение, климат, безопасность, управление.">

<meta property="og:title" content="Делаем сети | Оборудование умного дома">
<meta property="og:description" content="Все что нужно для умного дома в одном месте. Фильтры по брендам и категориям.">
<meta property="og:image" content="https://delaemseti.shop/og-image-main.png">
<meta property="og:url" content="https://delaemseti.shop/">
<meta property="og:type" content="website">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Делаем сети | Умный дом">
<meta name="twitter:description" content="Каталог оборудования для автоматизации дома">
<meta name="twitter:image" content="https://delaemseti.shop/og-image-main.png">

<link rel="canonical" href="https://delaemseti.shop/">
<meta name="robots" content="index, follow">
```

### 📦 Товар (пример)
```html
<title>Выключатель Loxone 10A 220V | Управление | delaemseti.shop</title>
<meta name="description" content="Выключатель Loxone 10A 220V для систем автоматизации. Цена: 2490 ₽. Характеристики, документы, доставка по России.">

<meta property="og:title" content="Выключатель Loxone 10A 220V">
<meta property="og:description" content="Цена: 2490 ₽. Управление освещением и электроприборами.">
<meta property="og:image" content="https://delaemseti.shop/products/loxone-switch.jpg">
<meta property="og:url" content="https://delaemseti.shop/product/loxone-switch-10a">
<meta property="og:type" content="product">
<meta property="product:price:amount" content="2490">
<meta property="product:price:currency" content="RUB">

<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Выключатель Loxone 10A 220V",
  "description": "Выключатель для систем умного дома Loxone",
  "brand": { "@type": "Brand", "name": "Loxone" },
  "image": "https://delaemseti.shop/products/loxone-switch.jpg",
  "price": "2490",
  "priceCurrency": "RUB",
  "availability": "https://schema.org/InStock",
  "category": "Управление",
  "aggregateRating": null
}
</script>

<link rel="canonical" href="https://delaemseti.shop/product/loxone-switch-10a">
```

### 🏷️ Категория (пример: Освещение)
```html
<title>Освещение | Выключатели, диммеры, контроллеры | delaemseti.shop</title>
<meta name="description" content="Оборудование для умного управления освещением. 96 товаров: выключатели, диммеры, LED контроллеры, датчики. Доставка по России.">

<meta property="og:title" content="Управление освещением | delaemseti.shop">
<meta property="og:description" content="96 товаров для автоматизации освещения: выключатели, диммеры, контроллеры.">
<meta property="og:url" content="https://delaemseti.shop/catalog?category=lighting">
<meta property="og:type" content="website">

<link rel="canonical" href="https://delaemseti.shop/catalog?category=lighting">
```

### 🏢 Бренд (пример: Loxone)
```html
<title>Loxone | Системы умного дома | delaemseti.shop</title>
<meta name="description" content="Loxone - австрийская система автоматизации. 345 товаров: освещение, климат, безопасность, управление. Русская поддержка, технические консультации.">

<meta property="og:title" content="Системы Loxone в каталоге delaemseti.shop">
<meta property="og:description" content="345 товаров от Loxone. Полный спектр оборудования для умного дома.">
<meta property="og:url" content="https://delaemseti.shop/brand/loxone">
<meta property="og:type" content="website">

<link rel="canonical" href="https://delaemseti.shop/brand/loxone">
```

---

## 6️⃣ РЕАЛИЗАЦИЯ (АРХИТЕКТУРА)

### Вариант A: Полностью auto-generate (Рекомендуется)
```javascript
// На сервере (Express)
app.get('/product/:id', (req, res) => {
  const product = getProductById(req.params.id);
  
  const title = `${product.name} :: ${product.brand} | delaemseti.shop`;
  const desc = truncate(product.description, 155);
  const image = product.mainImage;
  
  // Генерируем <head> с метатегами
  const head = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <meta property="og:title" content="${escapeHtml(product.name)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    <meta property="og:image" content="${image}">
    <meta property="og:url" content="https://delaemseti.shop/product/${product.id}">
    <meta property="og:type" content="product">
    <meta property="product:price:amount" content="${product.price}">
    <meta property="product:price:currency" content="RUB">
    <script type="application/ld+json">${JSON.stringify({...})}</script>
  `;
  
  res.send(renderPageWithHead(head, ...));
});
```

**Плюсы:** Все автоматически, не нужно ручное заполнение  
**Минусы:** Сложнее реализовать (нужен SSR или API)

### Вариант B: Auto-generate + Manual override (Гибридный)
```
БД таблица: product_seo
├── product_id
├── title (NULL = используй auto)
├── description (NULL = используй auto)
├── og_image (NULL = используй product.mainImage)
├── focus_keyword (для SEO анализа)
└── created_at, updated_at

Админка:
- Показывает auto-generated версию
- Позволяет override для top товаров
```

**Плюсы:** Гибкость, можно улучшить top товары  
**Минусы:** Требует работы владельца

### Вариант C: Только управление через админку (Простой)
```
Админка форма:
- SEO Title (обязательно)
- SEO Description (обязательно)
- OG Image (опционально)
- Focus Keyword (опционально)

Владелец заполняет вручную.
```

**Плюсы:** Просто реализовать, полный контроль  
**Минусы:** Долго (643 товара), может быть ошибки

---

## 7️⃣ ПРИОРИТИЗАЦИЯ

### 🔴 MUST HAVE (Неделя 1)
1. **Главная** (Title + OG теги)
2. **Товары** (auto-generate Title + Description + OG)
3. **Категории** (Title + Description)
4. **Бренды** (Title + Description)

### 🟡 SHOULD HAVE (Неделя 2)
1. **Schema.org JSON-LD** для товаров (для Google Rich Results)
2. **Robots/Sitemap** для SEO индексирования
3. **Canonical URL** для дублей

### 🟢 NICE TO HAVE (Позже)
1. **hreflang** для многоязычности (если будет)
2. **Breadcrumbs** структурированные данные
3. **FAQ Schema** (для популярных вопросов)

---

## 8️⃣ ПРОЦЕСС РЕАЛИЗАЦИИ

### День 1-2: Разработка
```
1. Добавить функции генерации метатегов
2. Редактировать шаблоны (главная, товар, категория, бренд)
3. Добавить Schema.org JSON-LD
4. Протестировать (10-15 товаров)
```

### День 3: Ручное заполнение (опционально)
```
1. Admin UI для SEO редактирования
2. Владелец заполняет top 50-100 товаров
3. Остальные используют auto-generate
```

### День 4: Верификация
```
1. Facebook Sharing Debugger (проверка OG)
2. Google Rich Result Test (проверка Schema)
3. Telegram preview (проверка шаринга)
4. Google Search Console (проверка индексации)
```

---

## 9️⃣ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

### До
```
Делаем сети
[картинка]
```

### После (в Telegram, VK, Facebook)
```
╔════════════════════════════════════════╗
║  Выключатель Loxone 10A 220V          ║
║  ────────────────────────────────────  ║
║  Цена: 2490 ₽                          ║
║  Управление освещением и приборами     ║
║  [КРАСИВОЕ ИЗОБРАЖЕНИЕ]                ║
║  delaemseti.shop                       ║
╚════════════════════════════════════════╝
```

---

## 🔟 СМЕТА

### Разработка
- Auto-generate метатегов: **8-16 часов**
- Schema.org JSON-LD: **4-8 часов**
- Admin UI для override: **4-8 часов** (опционально)
- Тестирование: **2-4 часа**
- **Итого:** 18-36 часов разработки

### Владелец (опционально)
- Заполнение top 50 товаров: **5-10 часов**

---

## 📋 ВЫВОДЫ

1. **Метатегов вообще нет** — это критичная проблема для соцсетей
2. **Конкурентная стратегия:** Фокус на "удобство" + "все в одном месте"
3. **Реализация:** Вариант B (auto-generate + manual override) — лучше баланс времени и качества
4. **Сроки:** 2-3 дня разработки, 1 неделя на владельца
5. **Важно:** Schema.org обязателен для Google (Rich Results)

---

**Рекомендуемый путь:**

```
Неделя 1:
✅ VPS настройка (параллельно)
✅ Auto-generate метатегов (главная, товары, категории)
✅ Schema.org JSON-LD для товаров

Неделя 2:
✅ Admin UI для SEO редактирования
✅ Владелец заполняет top товары
✅ Верификация в Google/Facebook/Telegram
```

---

**Автор:** Claude (исследование)  
**Дата:** 2026-07-14
