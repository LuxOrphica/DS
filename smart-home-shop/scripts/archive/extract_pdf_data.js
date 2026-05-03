const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const pdfPath = path.join(__dirname, 'larnitech_catalogue_04_23_web.pdf');

console.log('Извлечение данных из PDF каталога Larnitech...\n');

// Читаем PDF файл
const dataBuffer = fs.readFileSync(pdfPath);

// Парсим PDF
pdfParse(dataBuffer).then(function(data) {
  console.log('PDF успешно прочитан');
  console.log('Количество страниц:', data.numpages);
  console.log('');
  
  // Получаем текст
  const text = data.text;
  
  // Сохраняем полный текст для анализа
  const textPath = path.join(__dirname, 'data', 'larnitech_pdf_text.txt');
  fs.writeFileSync(textPath, text);
  console.log('Текст сохранен в:', textPath);
  
  // Ищем артикулы (обычно в формате DE-MG, DW-LS01 и т.д.)
  const articlePattern = /\b(DE-[A-Z0-9-]+|DW-[A-Z0-9-]+|CW-[A-Z0-9-]+|META-[A-Z0-9-]+)\b/g;
  const articles = [...text.matchAll(articlePattern)];
  const uniqueArticles = [...new Set(articles.map(a => a[0]))];
  
  console.log('\nНайдены артикулы:', uniqueArticles.length);
  uniqueArticles.slice(0, 20).forEach(a => console.log('  -', a));
  
  // Ищем названия товаров (обычно после артикула)
  const lines = text.split('\n').filter(l => l.trim());
  const products = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Проверяем, содержит ли строка артикул
    for (const article of uniqueArticles) {
      if (line.includes(article)) {
        // Следующие строки могут содержать название и описание
        const product = {
          article: article,
          rawLine: line,
          name: line.replace(article, '').trim(),
          context: lines.slice(i, i + 5).join(' | ')
        };
        products.push(product);
        break;
      }
    }
  }
  
  console.log('\nИзвлечено товаров:', products.length);
  
  // Сохраняем результат
  const resultPath = path.join(__dirname, 'data', 'larnitech_pdf_parsed.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    articles: uniqueArticles,
    products: products.slice(0, 50), // Первые 50 для проверки
    textLength: text.length
  }, null, 2));
  
  console.log('Результат сохранен в:', resultPath);
  console.log('\nПервые найденные товары:');
  products.slice(0, 10).forEach((p, i) => {
    console.log(`${i + 1}. ${p.article}: ${p.name.substring(0, 60)}...`);
  });
  
}).catch(err => {
  console.error('Ошибка при чтении PDF:', err.message);
});
