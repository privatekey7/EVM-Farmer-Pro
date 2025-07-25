const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

// Функция для чтения приватных ключей из файла
function readPrivateKeys(filePath) {
  try {
    // Если путь не абсолютный, делаем его относительно корня проекта
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')) // Пропускаем пустые строки и комментарии
      .map(key => key.startsWith('0x') ? key : `0x${key}`); // Добавляем 0x если нет
  } catch (error) {
    console.error(`❌ Ошибка чтения ключей: ${error.message}`);
    return [];
  }
}

// Функция для получения адреса из приватного ключа
function getAddressFromPrivateKey(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  } catch (error) {
    return null;
  }
}

// Функция для проверки баланса в EVM сетях
async function checkBalance(address, browser) {
  const url = `https://debank.com/profile/${address}`;
  const balanceListResponses = [];
  
  console.log(`   📊 ${address}`);

  const page = await browser.newPage();
  
  // Перехват ответов
  page.on('response', async (response) => {
    const reqUrl = response.url();
    if (reqUrl.includes('balance_list')) {
      try {
        const json = await response.json();
        balanceListResponses.push({
          url: reqUrl,
          data: json
        });
      } catch (e) {
        // ignore non-json
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Ждем появления текста "Data updated"
  try {
    await page.waitForFunction(
      () => !!Array.from(document.querySelectorAll('body *')).find(el => el.textContent.includes('Data updated')),
      { timeout: 30000 }
    );
    console.log(`   ✅ Балансы получены`);
  } catch (error) {
    console.log(`   ⚠️  Частичные данные (таймаут)`);
  }

  // Ждем еще немного, чтобы все запросы успели завершиться
  await new Promise(resolve => setTimeout(resolve, 5000));

  await page.close();
  return balanceListResponses;
}

// Основная функция
async function main() {
  console.log('🔍 Запуск скрапера балансов\n');
  
  // Читаем приватные ключи из файла
  const privateKeys = readPrivateKeys('keys.txt');
  
  if (privateKeys.length === 0) {
    console.error('❌ Приватные ключи не найдены в keys.txt');
    return [];
  }
  
  console.log(`💼 Найдено ${privateKeys.length} кошельков для анализа\n`);
  
  const walletsData = [];
  
  // Запускаем браузер один раз для всех операций
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    // Обрабатываем каждый ключ последовательно
    for (let i = 0; i < privateKeys.length; i++) {
      const privateKey = privateKeys[i];
      const address = getAddressFromPrivateKey(privateKey);
      
      if (!address) {
        console.log(`   ❌ Некорректный приватный ключ\n`);
        continue;
      }
      
      console.log(`🔍 Кошелек ${i + 1}/${privateKeys.length}:`);
      
      // Проверяем баланс и получаем данные
      const balanceData = await checkBalance(address, browser);
      
      // Добавляем данные кошелька в массив
      walletsData.push({
        address: address,
        privateKey: privateKey,
        balances: balanceData
      });
      
      console.log(''); // Пустая строка для разделения
      
      // Делаем паузу между кошельками
      if (i < privateKeys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
  } finally {
    await browser.close();
  }
  
  return walletsData;
}

// Экспортируем функции
module.exports = { main, readPrivateKeys, getAddressFromPrivateKey, checkBalance };

// Запускаем основную функцию только если файл выполняется напрямую
if (require.main === module) {
main().catch(error => {
  console.error('❌ Необработанная ошибка:', error.message);
});
}
