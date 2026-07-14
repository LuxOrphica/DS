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

## 2️⃣ ПОЗИЦИОНИРОВАНИЕ И ЦЕННОСТЬ

**Мы НЕ конкурируем с производителями** (они первые в поиске по своим брендам).

**Наша ниша:** Удобный каталог для конечного пользователя, где можно:
- Сравнить товары 4 разных производителей
- Найти нужное оборудование быстро (по категориям, цене)
- Купить всё в одном месте (вместо прыганья по каталогам)

**Целевая аудитория:**
- Домовладельцы, которые хотят автоматизировать дом
- Люди, которые не знают какой бренд выбрать
- Ищут удобство и ясный выбор

**Наше преимущество:**
✅ 643 товара от 4 брендов в одном месте  
✅ Удобные фильтры (по категориям, ценам, параметрам)  
✅ Быстрый поиск и сравнение  
✅ Прямая покупка  

---

## 3️⃣ КЛЮЧЕВЫЕ СЛОВА И АУДИТОРИЯ

### Поисковые запросы (B2C focused)

**Broad (основные):**
```
- "умный дом купить"
- "оборудование для умного дома"
- "система автоматизации дома"
- "умное управление домом"
- "купить систему умного дома"
```

**По категориям/функциям:**
```
- "выключатель умный дом купить"
- "датчик движения умный дом"
- "контроллер LED ленты"
- "терморегулятор для дома"
- "датчик климата"
- "система безопасности дома"
- "умное освещение для квартиры"
- "управление температурой дома"
```

**По параметрам (comparison intent):**
```
- "датчик движения какой выбрать"
- "выключатель для умного дома цена"
- "система умного дома для квартиры"
- "какое оборудование умного дома выбрать"
```

**Не ловим (это доля производителей):**
```
- "Loxone купить" → они в топе
- "Wiren Board официальный" → они в топе
- "Hite Pro каталог" → они в топе
```

### Целевая аудитория (B2C)
1. **Домовладельцы** ← ОСНОВНАЯ
   - Хотят автоматизировать дом
   - Не знают какой бренд выбрать
   - Ищут удобство и цену
   - Ценят сравнение в одном месте

2. **Технические специалисты/интеграторы** ← ВТОРИЧНАЯ
   - Хотят быстро найти оборудование
   - Ценят наличие спецификаций и документов
   - Нужна широкая линейка (все бренды)

---

## 4️⃣ РЕКОМЕНДУЕМАЯ SEO СТРАТЕГИЯ (B2C)

### Позиционирование
```
"Делаем сети" = Один каталог для удобного выбора оборудования 
                умного дома от проверенных брендов
```

### Главное преимущество
- ✅ Все товары в одном месте (не нужно искать по разным сайтам)
- ✅ Сравни товары 4 основных брендов рядом
- ✅ 643 товара, 8 категорий, быстрый поиск
- ✅ Ясная структура по функциям (освещение, климат, безопасность)
- ✅ Можешь купить сразу

### Целевые ключевые слова (по приоритету)

**P1 (HIGH) — основные фразы:**
```
"умный дом купить"
"оборудование для умного дома"
"система автоматизации дома"
```

**P2 (MEDIUM) — по категориям:**
```
"выключатель умный дом"
"датчик движения купить"
"контроллер для LED"
"система управления домом"
```

**P3 (LOW) — специфичные товары:**
```
"датчик климата", "терморегулятор", "сирена", итд
```

**НЕ ловим (это бренд-доля):**
```
"Loxone купить", "Wiren Board официально", итд → пусть производитель
```

---

## 5️⃣ ШАБЛОНЫ МЕТАТЕГОВ (B2C)

### 🏠 Главная страница
```html
<title>Делаем сети | Оборудование умного дома купить</title>
<meta name="description" content="Каталог оборудования для умного дома: 643 товара от Loxone, Wiren Board, Hite Pro, Larnitech. Выключатели, датчики, контроллеры. Выбери и купи онлайн.">

<meta property="og:title" content="Делаем сети — умный дом в одном месте">
<meta property="og:description" content="Выбери оборудование для своего дома: 4 проверенных бренда, сравни характеристики и цены.">
<meta property="og:image" content="https://delaemseti.shop/og-image-main.png">
<meta property="og:url" content="https://delaemseti.shop/">
<meta property="og:type" content="website">

<meta name="twitter:card" content="summary_large_image">

<link rel="canonical" href="https://delaemseti.shop/">
<meta name="robots" content="index, follow">
```

### 📦 Товар (пример)
```html
<title>Выключатель Loxone 10A 220V — 2490 ₽ | Делаем сети</title>
<meta name="description" content="Выключатель Loxone 10A 220V для управления освещением. Цена: 2490 ₽. Характеристики, документы, доставка по России.">

<meta property="og:title" content="Выключатель Loxone 10A 220V — 2490 ₽">
<meta property="og:description" content="Управляй освещением с помощью умного выключателя. Совместим с системой Loxone.">
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
  "description": "Умный выключатель для управления освещением и электроприборами",
  "brand": { "@type": "Brand", "name": "Loxone" },
  "image": "https://delaemseti.shop/products/loxone-switch.jpg",
  "price": "2490",
  "priceCurrency": "RUB",
  "availability": "https://schema.org/InStock",
  "url": "https://delaemseti.shop/product/loxone-switch-10a"
}
</script>

<link rel="canonical" href="https://delaemseti.shop/product/loxone-switch-10a">
```

### 🏷️ Категория (пример: Освещение)
```html
<title>Умное освещение для дома — выключатели, диммеры, контроллеры</title>
<meta name="description" content="Оборудование для умного управления освещением: 96 товаров. Выключатели, диммеры, LED контроллеры, датчики движения. Сравни по цене и характеристикам.">

<meta property="og:title" content="Умное управление освещением — 96 товаров">
<meta property="og:description" content="Выключатели, диммеры, контроллеры для автоматизации света в доме. Выбери и купи онлайн.">
<meta property="og:url" content="https://delaemseti.shop/catalog?category=lighting">
<meta property="og:type" content="website">

<link rel="canonical" href="https://delaemseti.shop/catalog?category=lighting">
```

### 🏢 Бренд (пример: Loxone) — ВТОРИЧНАЯ ценность
```html
<title>Товары Loxone в каталоге — 345 позиций</title>
<meta name="description" content="345 товаров австрийского бренда Loxone в каталоге. Системы управления домом: освещение, климат, безопасность, автоматизация.">

<meta property="og:title" content="Loxone — 345 товаров для умного дома">
<meta property="og:description" content="Выбери оборудование Loxone: все категории в одном месте.">
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

### 🔴 MUST HAVE (в первую очередь)
1. **Главная** (Title + OG теги)
2. **Товары** (auto-generate Title + Description + OG)
3. **Категории** (Title + Description)
4. **Бренды** (Title + Description)

### 🟡 SHOULD HAVE (следом)
1. **Schema.org JSON-LD** для товаров (для Google Rich Results)
2. **Robots/Sitemap** для SEO индексирования
3. **Canonical URL** для дублей

### 🟢 NICE TO HAVE (Позже)
1. **hreflang** для многоязычности (если будет)
2. **Breadcrumbs** структурированные данные
3. **FAQ Schema** (для популярных вопросов)

---

## 8️⃣ ПРОЦЕСС РЕАЛИЗАЦИИ (ПО ПОРЯДКУ)

### Шаг 1: Разработка
```
1. Добавить функции генерации метатегов
2. Редактировать шаблоны (главная, товар, категория, бренд)
3. Добавить Schema.org JSON-LD
4. Протестировать (10-15 товаров)
```

### Шаг 2: Ручное заполнение (опционально)
```
1. Admin UI для SEO редактирования
2. Владелец заполняет top 50-100 товаров
3. Остальные используют auto-generate
```

### Шаг 3: Верификация
```
1. Facebook Sharing Debugger (проверка OG)
2. Google Rich Result Test (проверка Schema)
3. Telegram preview (проверка шаринга)
4. Google Search Console (проверка индексации)
```

---

## 9️⃣ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

### До (сейчас)
```
Делаем сети
[картинка не видна]
Нет description, нет цены, нет деталей
```

### После (в Telegram, VK, Facebook)
```
╔════════════════════════════════════════╗
║  Выключатель Loxone 10A 220V — 2490 ₽ ║
║  ────────────────────────────────────  ║
║  Управляй освещением с умным           ║
║  выключателем. Совместим с Loxone.     ║
║  [КРАСИВОЕ ИЗОБРАЖЕНИЕ]                ║
║  Делаем сети — delaemseti.shop         ║
╚════════════════════════════════════════╝
```

### В поиске Google
```
Выключатель Loxone 10A 220V — 2490 ₽ | Делаем сети
Управляй освещением с умным выключателем. Совместим с Loxone.
delaemseti.shop › product › loxone-switch-10a
```

---

## 🔟 ОБЪЁМ РАБОТ

### Разработка
- Auto-generate метатегов
- Schema.org JSON-LD
- Admin UI для override (опционально)
- Тестирование

### Владелец (опционально)
- Заполнение top товаров вручную

---

## 📋 ВЫВОДЫ

1. **Метатегов нет** — критичная проблема для соцсетей (товары не шарятся)
2. **Стратегия:** B2C фокус на "удобство" + "выбирай между брендами" (не на конкуренцию с производителями)
3. **Ключевые слова:** "умный дом купить", "оборудование для автоматизации", категории (не названия брендов)
4. **Реализация:** Вариант B (auto-generate + manual override) — лучше баланс
5. **Важно:** Schema.org обязателен для Google Rich Results

---

**Рекомендуемый путь:**

```
Сначала (параллельно с VPS):
✅ Auto-generate метатегов (главная, товары, категории)
✅ Schema.org JSON-LD для товаров
✅ Проверка в Google Search Console и Facebook Debugger

Опционально следом:
✅ Admin UI для SEO редактирования
✅ Ручное заполнение top 50-100 товаров (если владелец согласен)
```

---

**Автор:** Claude (исследование)  
**Дата:** 2026-07-14
