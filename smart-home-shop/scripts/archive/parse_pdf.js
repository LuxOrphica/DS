const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, 'larnitech_catalogue_04_23_web.pdf');

// Проверяем файл
if (!fs.existsSync(pdfPath)) {
  console.error('PDF файл не найден:', pdfPath);
  process.exit(1);
}

const stats = fs.statSync(pdfPath);
console.log('Найден PDF каталог Larnitech');
console.log('Размер:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
console.log('');
console.log('Для извлечения данных из PDF необходимо:');
console.log('1. Установить pdf-parse: npm install pdf-parse');
console.log('2. Или использовать Python с PyPDF2/pdfplumber');
console.log('');
console.log('Альтернативно можно:');
console.log('- Открыть PDF вручную и скопировать таблицу товаров');
console.log('- Использовать онлайн-конвертер PDF → Excel/CSV');
console.log('- Парсить веб-версию каталога по ссылкам товаров');
