// Глобальное состояние приложения
const state = {
  products: [],
  cart: [],
  lastOrder: null,
  favorites: [],
  search: "",
  catalogSort: "popular",
  currentCategorySlug: "",
  currentBrandRouteKey: "",
  filters: {
    brands: [],
    types: [],
    systemTypes: [],
    protocols: [],
    mountings: [],
    supplyVoltages: [],
    channels: [],
    nominalCurrents: [],
    nominalPowers: [],
    sensorTypes: [],
    indoorOutdoor: [],
    ipRatings: [],
    ioCounts: [],
    webInterfaces: [],
    scenarioSupports: [],
    loadTypes: [],
    maxLoads: [],
    minPrice: "",
    maxPrice: ""
  }
};

// DOM элементы
const appEl = document.getElementById("app");
const cartQtyEl = document.getElementById("cartQty");
const miniCartEl = document.getElementById("miniCart");
const cartOpenBtn = document.getElementById("cartOpenBtn");

// Заглушка для изображений
const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#eceff3"/><rect x="220" y="170" width="360" height="220" rx="16" fill="#d6dbe2"/><circle cx="330" cy="260" r="34" fill="#b8bfca"/><path d="M260 360l110-120 70 75 50-55 110 100z" fill="#a6aeba"/><text x="400" y="430" text-anchor="middle" fill="#6c7582" font-family="Arial" font-size="36">Нет фото</text></svg>'
)}`;

// Ключ для хранения избранного в localStorage
const FAVORITES_STORAGE_KEY = "smart-home-shop:favorites";

// Унифицированные подкатегории для брендов
const BRAND_STANDARD_SUBCATEGORIES = [
  'Контроллеры',
  'Реле и диммеры',
  'Датчики',
  'Термостаты',
  'Энергомониторинг',
  'Аудио и мультимедиа',
  'Аксессуары'
];

// Известные бренды для автоматического определения
const BRAND_COUNTRIES = {
  "Loxone": "Австрия",
  "Wiren Board": "Россия",
  "Larnitech": "Россия",
  "HiTE PRO": "Россия",
  "Hite Pro": "Россия",
  "Casambi": "Финляндия",
  "Tridonic": "Австрия",
  "Denkirs": "Россия",
  "SmartLum": "Россия",
  "Maytoni": "Германия",
  "Belimo": "Швейцария",
  "Froling": "Австрия",
  "Internorm": "Австрия",
  "Philips": "Нидерланды",
  "Osram": "Германия",
  "Arlight": "Россия",
  "IEK": "Россия",
  "TUYA": "Китай"
};

const KNOWN_BRANDS = [
  "Arlight",
  "TUYA", 
  "IEK",
  "Denkirs",
  "SmartLum",
  "Tridonic",
  "Maytoni",
  "HiTE PRO",
  "Casambi",
  "Philips",
  "Osram"
];

// Dictionary for automatic product type detection
const PRODUCT_TYPE_DICTIONARY = [
  "диммер",
  "контроллер",
  "выключатель",
  "блок питания",
  "источник питания",
  "датчик",
  "профиль",
  "пульт",
  "панель",
  "светильник",
  "лента",
  "реле",
  "термостат"
];

// Переводы ключей для характеристик
const SPEC_KEY_TRANSLATIONS = {
  spec: "Характеристика",
  power: "Мощность",
  voltage: "Напряжение",
  current: "Ток",
  dimensions: "Размеры",
  weight: "Вес",
  color: "Цвет",
  material: "Материал",
  warranty: "Гарантия",
  protocol: "Протокол",
  interface: "Интерфейс",
  range: "Диапазон",
  accuracy: "Точность",
  protection: "Защита"
};

// Экспорт для использования в других модулях
const FUNCTIONAL_CATEGORY_OVERRIDES = {
  byId: {
    LCP: "Аудио и мультимедиа"
  },
  byArticle: {
    LCP: "Аудио и мультимедиа"
  }
};

export {
  state,
  appEl,
  cartQtyEl,
  miniCartEl,
  cartOpenBtn,
  PLACEHOLDER_IMAGE,
  FAVORITES_STORAGE_KEY,
  BRAND_STANDARD_SUBCATEGORIES,
  KNOWN_BRANDS,
  BRAND_COUNTRIES,
  PRODUCT_TYPE_DICTIONARY,
  SPEC_KEY_TRANSLATIONS,
  FUNCTIONAL_CATEGORY_OVERRIDES
};
