const debankScraper = require('./src/debank_balance_checker');
const bridgeExecutor = require('./src/bridge_executor');
const { readPrivateKeys, getAddressFromPrivateKey } = debankScraper;
const { walletDelay } = require('./utils/delay');
const config = require('./src/bridge_executor').getConfig();

// Глобальная обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанная ошибка:', error.message);
  console.error('📍 Стек вызовов:', error.stack);
  
  // Если это сетевая ошибка, не завершаем процесс
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    console.log('🌐 Сетевая ошибка - продолжаем работу...');
    return;
  }
  
  // Для других ошибок завершаем процесс
  console.error('❌ Критическая ошибка - завершение процесса');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Необработанное отклонение промиса:', reason);
  
  // Если это сетевая ошибка, не завершаем процесс
  if (reason && reason.code === 'ECONNRESET' || reason.code === 'ENOTFOUND' || reason.code === 'ETIMEDOUT') {
    console.log('🌐 Сетевая ошибка в промиссе - продолжаем работу...');
    return;
  }
  
  // Проверяем ошибки RPC
  if (reason && reason.code === 19 && reason.message && reason.message.includes('Unable to perform request')) {
    console.log('⚠️ RPC временно недоступен - продолжаем работу...');
    return;
  }
  
  // Проверяем другие типы ошибок RPC
  if (reason && reason.message && (
    reason.message.includes('not found') || 
    reason.message.includes('Unknown block') ||
    reason.message.includes('timeout') ||
    reason.message.includes('network') ||
    reason.message.includes('Unable to perform request')
  )) {
    console.log('⚠️ Ошибка сети/RPC - продолжаем работу...');
    return;
  }
  
  // Для других ошибок завершаем процесс
  console.error('❌ Критическая ошибка в промиссе - завершение процесса');
  process.exit(1);
});

// Определяем описание режима для отображения
function getModeDescription() {
    const collectionMode = config.collection?.mode || 'collect_to_target';
    const targetNetwork = config.collection?.targetNetwork;
    
    switch (collectionMode) {
        case 'collect_to_target':
            if (targetNetwork === 'random') {
                return '🎲 Запуск автобриджера - сбор в случайные сети';
            } else if (targetNetwork) {
                return `🌉 Запуск автобриджера - сбор всех токенов в ${targetNetwork.toUpperCase()}`;
            } else {
                return '🌉 Запуск автобриджера - сбор в Base (по умолчанию)';
            }
        case 'swap_to_native':
            if (targetNetwork === 'all_chains') {
                return '💰 Запуск автобриджера - свапы во всех сетях';
            } else if (targetNetwork) {
                return `💰 Запуск автобриджера - свапы в сети ${targetNetwork.toUpperCase()}`;
            } else {
                return '💰 Запуск автобриджера - свапы в нативку';
            }
        default:
            return '🚀 Запуск автобриджера';
    }
}

console.log(getModeDescription());

async function main() {
    try {
        // Читаем приватные ключи
        const privateKeys = readPrivateKeys('keys.txt');
        
        if (privateKeys.length === 0) {
            console.error('❌ Приватные ключи не найдены в keys.txt');
            return;
        }
        
        console.log(`💼 Найдено ${privateKeys.length} кошельков для обработки\n`);
        
        // Обрабатываем каждый кошелек полностью: скрапинг → бриджинг
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const address = getAddressFromPrivateKey(privateKey);
            
            if (!address) {
                console.log(`❌ Кошелек ${i + 1}/${privateKeys.length}: Некорректный приватный ключ\n`);
                continue;
            }
            
            console.log(`🔄 Кошелек ${i + 1}/${privateKeys.length}: ${address}`);
            
            try {
                // Этап 1: Скрапинг баланса для этого кошелька
                console.log(`   📊 Получение балансов...`);
                
                const walletData = await scrapeWalletBalance(address, privateKey);
                
                if (!walletData || !walletData.balances || walletData.balances.length === 0) {
                    console.log(`   ❌ Балансы не получены\n`);
                    continue;
                }
                
                console.log(`   ✅ Балансы получены`);
                
                // Небольшая пауза между этапами
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Этап 2: Бриджинг для этого кошелька
                console.log(`   🌉 Запуск автобриджера...`);
                await bridgeExecutor.main([walletData]);
                
                console.log(`   ✅ Кошелек обработан\n`);
                
                // Пауза между кошельками
                if (i < privateKeys.length - 1) {
                    await walletDelay();
                    console.log('');
                }
                
            } catch (error) {
                console.log(`   ❌ Ошибка обработки кошелька: ${error.message}\n`);
                continue;
            }
        }
        
        console.log('🎉 Полный цикл автобриджера завершен успешно!');
        
    } catch (error) {
        console.log('\n💥 Ошибка в полном цикле:', error.message);
        process.exit(1);
    }
}

// Функция для скрапинга баланса одного кошелька
async function scrapeWalletBalance(address, privateKey) {
    const puppeteer = require('puppeteer');
    
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    try {
        const url = `https://debank.com/profile/${address}`;
        const balanceListResponses = [];
        
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
        } catch (error) {
            // Частичные данные
        }

        // Ждем еще немного, чтобы все запросы успели завершиться
        await new Promise(resolve => setTimeout(resolve, 5000));

        await page.close();
        
        return {
            address: address,
            privateKey: privateKey,
            balances: balanceListResponses
        };
        
    } finally {
        await browser.close();
    }
}

main(); 