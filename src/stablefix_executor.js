const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const axios = require('axios');

// Обработка необработанных ошибок промисов
process.on('unhandledRejection', (reason, promise) => {
  console.log('⚠️ Ошибка сети/RPC - продолжаем работу...');
  // Не завершаем процесс, а продолжаем работу
});

process.on('uncaughtException', (error) => {
  console.log('❌ Критическая ошибка в промиссе - завершение процесса');
  process.exit(1);
});

// Импорт утилит
const { RelayBridge } = require('../utils/relay');
const chainMapper = require('../utils/chainMapper');
const rpcConfig = require('../utils/RPC.json');
const fallbackRpcConfig = require('../utils/fallbackRPC.json');
const { transactionDelay } = require('../utils/delay');

// Конфигурация стейблкойнов
const STABLECOIN_CONFIG = {
  optimism: {
    usdt: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85'
  },
  arbitrum: {
    usdt: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
  },
  base: {
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  }
};

// Логотипы токенов
const TOKEN_LOGOS = {
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  USDT: 'https://coin-images.coingecko.com/coins/images/39963/large/usdt.png',
  USDC: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png'
};

// Создание экземпляра Relay Bridge
const relayBridge = new RelayBridge();

// Функция для получения конфигурации StableFix
function getStableFixConfig() {
  if (typeof global !== 'undefined' && global.stableFixConfig) {
    return global.stableFixConfig;
  }
  
  // Настройки по умолчанию
  return {
    enabled: false,
    percentage: 50,
    targetStablecoin: 'random',
    networks: ['optimism', 'arbitrum', 'base'],
    excludedNetworks: []
  };
}

// Функция для получения RPC URL
function getRpcUrl(chainId) {
  const config = rpcConfig.rpc.find(item => item.chainId === chainId);
  return config ? config.httpRpcUrl : null;
}

// Получаем все доступные RPC URL для сети (основной + fallback)
function getAllRpcUrls(chainId) {
  const urls = [];
  
  // Добавляем основной RPC
  const mainConfig = rpcConfig.rpc.find(item => item.chainId === chainId);
  if (mainConfig) {
    urls.push(mainConfig.httpRpcUrl);
  }
  
  // Добавляем fallback RPC
  const fallbackConfig = fallbackRpcConfig.fallbackRPC.find(item => item.chainId === chainId);
  if (fallbackConfig && fallbackConfig.fallbackUrls) {
    urls.push(...fallbackConfig.fallbackUrls);
  }
  
  return urls;
}

// Получаем имя сети
function getChainName(chainId) {
  const config = rpcConfig.rpc.find(item => item.chainId === chainId);
  return config ? config.name.toUpperCase() : `Chain ${chainId}`;
}

// Создаем провайдер с fallback логикой
async function createProviderWithFallback(chainId) {
  const urls = getAllRpcUrls(chainId);
  const chainName = getChainName(chainId);
  
  if (urls.length === 0) {
    console.log(`   ❌ RPC URL не найден для ${chainName}`);
    return null;
  }
  
  console.log(`   🔍 Попытка подключения к ${chainName} (${urls.length} RPC доступно)`);
  
  // Получаем основной RPC (первый в списке)
  const mainRpcUrl = urls[0];
  const fallbackUrls = urls.slice(1);
  
  // 3 попытки к основному RPC
  console.log(`\n Тестирование основного RPC: ${mainRpcUrl}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`   🔄 Попытка ${attempt}/3 основного RPC`);
      
      const provider = new ethers.JsonRpcProvider(mainRpcUrl, undefined, {
        staticNetwork: true, // Используем статическую сеть для избежания проблем с определением
        timeout: 10000 // Увеличиваем таймаут до 10 секунд
      });
      
      // Проверяем подключение с таймаутом
      const networkPromise = provider.getNetwork();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );
      
      await Promise.race([networkPromise, timeoutPromise]);
      
      console.log(`   ✅ Основной RPC работает! Подключение к ${chainName} установлено`);
      return provider;
      
    } catch (error) {
      // Определяем тип ошибки для лучшего логирования
      let errorType = 'неизвестная';
      if (error.code === 'SERVER_ERROR' || error.message.includes('Bad Request')) {
        errorType = 'серверная ошибка';
      } else if (error.code === 'TIMEOUT' || error.message.includes('Timeout')) {
        errorType = 'таймаут';
      } else if (error.code === 'NETWORK_ERROR' || error.message.includes('network')) {
        errorType = 'сетевая ошибка';
      } else if (error.message.includes('jsonrpc')) {
        errorType = 'неправильный формат JSON-RPC';
      }
      
      console.log(`   ❌ Попытка ${attempt}/3 основного RPC неудачна (${errorType}): ${error.message}`);
      
      if (attempt < 3) {
        console.log(`   ⏳ Ожидание 2 секунды перед следующей попыткой...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Если основной RPC не работает, пробуем fallback RPC
  if (fallbackUrls.length > 0) {
    console.log(`\n🔄 Основной RPC недоступен, переходим к fallback RPC (${fallbackUrls.length} доступно)`);
    
    for (let i = 0; i < fallbackUrls.length; i++) {
      const fallbackUrl = fallbackUrls[i];
      
      try {
        console.log(`   📡 Попытка ${i + 1}/${fallbackUrls.length}: fallback RPC`);
        
        const provider = new ethers.JsonRpcProvider(fallbackUrl, undefined, {
          staticNetwork: true, // Используем статическую сеть для избежания проблем с определением
          timeout: 10000 // Увеличиваем таймаут до 10 секунд
        });
        
        // Проверяем подключение с таймаутом
        const networkPromise = provider.getNetwork();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        await Promise.race([networkPromise, timeoutPromise]);
        
        console.log(`   ✅ Fallback RPC работает! Подключение к ${chainName} установлено`);
        return provider;
        
      } catch (error) {
        // Определяем тип ошибки для лучшего логирования
        let errorType = 'неизвестная';
        if (error.code === 'SERVER_ERROR' || error.message.includes('Bad Request')) {
          errorType = 'серверная ошибка';
        } else if (error.code === 'TIMEOUT' || error.message.includes('Timeout')) {
          errorType = 'таймаут';
        } else if (error.code === 'NETWORK_ERROR' || error.message.includes('network')) {
          errorType = 'сетевая ошибка';
        } else if (error.message.includes('jsonrpc')) {
          errorType = 'неправильный формат JSON-RPC';
        }
        
        console.log(`   ❌ Fallback RPC ${i + 1}/${fallbackUrls.length} недоступен (${errorType}): ${error.message}`);
        
        // Если это последний fallback RPC, логируем пропуск сети
        if (i === fallbackUrls.length - 1) {
          console.log(`   ⚠️  Все RPC для ${chainName} недоступны, пропускаем сеть`);
          return null;
        }
      }
    }
  } else {
    console.log(`   ⚠️  Fallback RPC не настроены для ${chainName}, пропускаем сеть`);
    return null;
  }
  
  return null;
}

// Общая функция для обработки ошибок Relay API
function handleRelayError(error, tokenSymbol, operationType = 'операции', chainName = '') {
  // Обработка сетевых ошибок
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    console.log(`   ⚠️  Сетевая ошибка при ${operationType} ${tokenSymbol}: соединение прервано`);
    
    // Отправляем лог в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: operationType.includes('свап') ? 'swap' : 'bridge',
        data: {
          token: {
            symbol: tokenSymbol,
            logo_url: null
          },
          chain: chainName.toUpperCase(),
          target: operationType.includes('бридж') ? 'Base' : 'нативный',
          status: 'skipped',
          reason: 'Сетевая ошибка'
        }
      }, 'warning');
    }
    return;
  }
  
  if (error.response && error.response.data) {
    const errorCode = error.response.data.errorCode;
    const errorMessage = error.response.data.message || '';
    
    // Карта ошибок Relay API с понятными сообщениями на русском
    const errorMap = {
      // Expected Errors (ожидаемые ошибки)
      'AMOUNT_TOO_LOW': `Сумма ${tokenSymbol} слишком мала для ${operationType}`,
      'CHAIN_DISABLED': `Сеть ${chainName} временно отключена`,
      'EXTRA_TXS_NOT_SUPPORTED': `Дополнительные транзакции не поддерживаются`,
      'FORBIDDEN': `Недостаточно прав для выполнения операции`,
      'INSUFFICIENT_FUNDS': `Недостаточно ${tokenSymbol} на балансе`,
      'INSUFFICIENT_LIQUIDITY': `Недостаточно ликвидности для ${operationType} ${tokenSymbol}`,
      'INVALID_ADDRESS': `Неверный адрес кошелька`,
      'INVALID_EXTRA_TXS': `Неверные дополнительные транзакции`,
      'INVALID_GAS_LIMIT_FOR_DEPOSIT_SPECIFIED_TXS': `Неверный лимит газа для депозитных транзакций`,
      'INVALID_INPUT_CURRENCY': `Неподдерживаемый входной токен ${tokenSymbol}`,
      'INVALID_OUTPUT_CURRENCY': `Неподдерживаемый выходной токен`,
      'INVALID_SLIPPAGE_TOLERANCE': `Неверное значение проскальзывания`,
      'NO_INTERNAL_SWAP_ROUTES_FOUND': `Внутренние маршруты ${operationType} не найдены`,
      'NO_QUOTES': `Котировки для ${operationType} ${tokenSymbol} недоступны`,
      'NO_SWAP_ROUTES_FOUND': `Маршруты ${operationType} для ${tokenSymbol} не найдены`,
      'ROUTE_TEMPORARILY_RESTRICTED': `Маршрут ${operationType} временно ограничен`,
      'SANCTIONED_CURRENCY': `Токен ${tokenSymbol} находится в санкционном списке`,
      'SANCTIONED_WALLET_ADDRESS': `Адрес кошелька заблокирован`,
      'SWAP_IMPACT_TOO_HIGH': `Слишком высокое влияние на цену ${tokenSymbol}`,
      'UNAUTHORIZED': `Не авторизован для выполнения операции`,
      'UNSUPPORTED_CHAIN': `${operationType.charAt(0).toUpperCase() + operationType.slice(1)} в сети ${chainName} не поддерживается`,
      'UNSUPPORTED_CURRENCY': `Токен ${tokenSymbol} не поддерживается для ${operationType}`,
      'UNSUPPORTED_EXECUTION_TYPE': `Тип выполнения не поддерживается`,
      'UNSUPPORTED_ROUTE': `Маршрут ${operationType} не поддерживается`,
      'USER_RECIPIENT_MISMATCH': `Адреса отправителя и получателя должны совпадать`,
      
      // Unexpected Errors (неожиданные ошибки)
      'DESTINATION_TX_FAILED': `Транзакция на целевой сети провалилась`,
      'ERC20_ROUTER_ADDRESS_NOT_FOUND': `Адрес роутера токена не найден`,
      'UNKNOWN_ERROR': `Неизвестная ошибка при ${operationType} ${tokenSymbol}`,
      'SWAP_QUOTE_FAILED': `Не удалось получить котировку для ${operationType} ${tokenSymbol}`,
      'PERMIT_FAILED': `Ошибка подписи разрешения токена`,
      
      // Дополнительные ошибки
      'NO_BRIDGE_ROUTES_FOUND': `Маршрут бриджа не найден для ${tokenSymbol}`,
      'CHAIN_NOT_SUPPORTED': `${operationType.charAt(0).toUpperCase() + operationType.slice(1)} из ${chainName} не поддерживается`,
      'INSUFFICIENT_BALANCE': `Недостаточно ${tokenSymbol} для ${operationType}`
    };
    
    // Ищем ошибку по коду
    if (errorCode && errorMap[errorCode]) {
      console.log(`   ⚠️  ${errorMap[errorCode]}`);
      return;
    }
    
    // Ищем ошибку по ключевым словам в сообщении
    const lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('too low') || lowerMessage.includes('minimum')) {
      console.log(`   ⚠️  ${errorMap['AMOUNT_TOO_LOW']}`);
    } else if (lowerMessage.includes('insufficient')) {
      console.log(`   ⚠️  ${errorMap['INSUFFICIENT_BALANCE']}`);
    } else if (lowerMessage.includes('no route') || lowerMessage.includes('routes not found')) {
      if (operationType.includes('бридж')) {
        console.log(`   ⚠️  ${errorMap['NO_BRIDGE_ROUTES_FOUND']}`);
      } else {
        console.log(`   ⚠️  ${errorMap['NO_SWAP_ROUTES_FOUND']}`);
      }
    } else if (lowerMessage.includes('unsupported') || lowerMessage.includes('not supported')) {
      console.log(`   ⚠️  ${errorMap['UNSUPPORTED_CURRENCY']}`);
    } else {
      // Если код ошибки неизвестен, выводим его
      console.log(`   ❌ Ошибка ${operationType}: ${errorCode || errorMessage}`);
    }
  } else {
    // Для ошибок без детальной информации
    console.log(`   ❌ Ошибка ${operationType}: ${error.message || 'Неизвестная ошибка'}`);
  }
}

// Функция для чтения приватных ключей
function readPrivateKeys(filePath) {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(key => key.startsWith('0x') ? key : `0x${key}`);
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

// Функция для свапа ETH в стейблкойн
async function swapEthToStablecoin(wallet, network, stablecoinType, ethAmount, shouldDelayAfter = false) {
  // Проверяем флаг остановки
  if (typeof global !== 'undefined' && global.shouldStopStableFix && global.shouldStopStableFix()) {
    console.log('⏹️ Остановка StableFix по запросу пользователя');
    return false;
  }

  // Маппинг названий сетей к идентификаторам DeBank
  const networkMapping = {
    'optimism': 'op',
    'arbitrum': 'arb',
    'base': 'base'
  };
  
  const debankId = networkMapping[network] || network;
  const chainId = chainMapper.getChainId(debankId);
  
  if (!chainId) {
    console.log(`   ❌ Сеть ${network} не поддерживается (debankId: ${debankId})`);
    return false;
  }

  const provider = await createProviderWithFallback(chainId);
  if (!provider) {
    console.log(`   ⚠️  Пропускаем свап ETH → ${stablecoinType.toUpperCase()} - RPC недоступны для ${getChainName(chainId)}`);
    return false;
  }

  // Проверяем доступность стейблкойна в сети
  if (!STABLECOIN_CONFIG[network] || !STABLECOIN_CONFIG[network][stablecoinType]) {
    console.log(`   ❌ Стейблкойн ${stablecoinType.toUpperCase()} недоступен в сети ${network}`);
    return false;
  }

  const stablecoinAddress = STABLECOIN_CONFIG[network][stablecoinType];
  const stablecoinSymbol = stablecoinType.toUpperCase();

  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider);

    // Проверяем актуальный баланс ETH
    const currentBalance = await provider.getBalance(wallet.address);
    if (currentBalance < ethAmount) {
      console.log(`   ⚠️ Недостаточно ETH для свапа`);
      return false;
    }

    // Форматируем суммы для отображения
    const ethAmountFormatted = (Number(ethAmount) / Math.pow(10, 18)).toFixed(6);
    console.log(`   💱 Свап ${ethAmountFormatted} ETH → ${stablecoinSymbol} в ${network.toUpperCase()}`);

    // Отправляем лог начала операции в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'swap',
        data: {
          token: {
            symbol: 'ETH',
            amount: ethAmountFormatted,
            logo_url: TOKEN_LOGOS.ETH
          },
          chain: network.toUpperCase(),
          target: stablecoinSymbol,
          status: 'started'
        }
      }, 'info');
    }

    // Параметры для свапа через Relay
    const quoteParams = {
      user: wallet.address,
      recipient: wallet.address,
      originChainId: chainId,
      destinationChainId: chainId, // Свап внутри той же сети
      originCurrency: '0x0000000000000000000000000000000000000000', // ETH
      destinationCurrency: stablecoinAddress, // Стейблкойн
      amount: ethAmount.toString(),
      tradeType: 'EXACT_INPUT'
    };

    // Получаем котировку
    let quote;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        quote = await relayBridge.getQuote(quoteParams);
        break;
      } catch (error) {
        retryCount++;
        
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && retryCount < maxRetries) {
          console.log(`   🔄 Повторная попытка ${retryCount}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          continue;
        }
        
        // Используем общую функцию обработки ошибок Relay
        handleRelayError(error, 'ETH', 'свапа', network);
        
        // Отправляем лог ошибки в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: 'ETH',
                amount: ethAmountFormatted,
                logo_url: TOKEN_LOGOS.ETH
              },
              chain: network.toUpperCase(),
              target: stablecoinSymbol,
              status: 'failed',
              reason: 'Ошибка котировки'
            }
          }, 'error');
        }
        
        return false;
      }
    }

    if (!quote.steps || quote.steps.length === 0) {
      console.log(`   ⚠️ Свап недоступен`);
      
      // Отправляем лог в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'swap',
          data: {
            token: {
              symbol: 'ETH',
              amount: ethAmountFormatted,
              logo_url: TOKEN_LOGOS.ETH
            },
            chain: network.toUpperCase(),
            target: stablecoinSymbol,
            status: 'skipped',
            reason: 'Свап недоступен'
          }
        }, 'warning');
      }
      
      return false;
    }

    // Выполняем свап
    let result;
    let executeRetryCount = 0;
    const maxExecuteRetries = 2;

    // Проверяем, что quote.steps существует и является массивом
    if (!quote.steps || !Array.isArray(quote.steps)) {
      return false;
    }

    while (executeRetryCount < maxExecuteRetries) {
      try {
        result = await relayBridge.executeSteps(quote.steps, provider, signer);
        break;
      } catch (error) {
        executeRetryCount++;
        
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && executeRetryCount < maxExecuteRetries) {
          console.log(`   🔄 Повторная попытка выполнения ${executeRetryCount}/${maxExecuteRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * executeRetryCount));
          continue;
        }
        
        console.log(`   ❌ Ошибка выполнения свапа: ${error.message}`);
        
        // Отправляем лог ошибки в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: 'ETH',
                amount: ethAmountFormatted,
                logo_url: TOKEN_LOGOS.ETH
              },
              chain: network.toUpperCase(),
              target: stablecoinSymbol,
              status: 'failed',
              reason: 'Ошибка выполнения'
            }
          }, 'error');
        }
        
        return false;
      }
    }

    // Проверяем результат
    if (result && Array.isArray(result)) {
      const failedSteps = result.filter(step => step.status === 'failed');
      if (failedSteps.length === 0) {
        console.log(`   ✅ Свап ETH → ${stablecoinSymbol} завершен`);
        
        // Отправляем лог успеха в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: 'ETH',
                amount: ethAmountFormatted,
                logo_url: TOKEN_LOGOS.ETH
              },
              chain: network.toUpperCase(),
              target: stablecoinSymbol,
              status: 'success'
            }
          }, 'success');
        }
        
        // Задержка между транзакциями
        if (shouldDelayAfter) {
          await transactionDelay();
        }
        
        return true;
      } else {
        console.log(`   ❌ Свап не выполнен`);
        
        // Отправляем лог ошибки в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: 'ETH',
                amount: ethAmountFormatted,
                logo_url: TOKEN_LOGOS.ETH
              },
              chain: network.toUpperCase(),
              target: stablecoinSymbol,
              status: 'failed',
              reason: 'Ошибка выполнения'
            }
          }, 'error');
        }
        
        return false;
      }
    }

    return false;
  } catch (error) {
    // Обработка сетевых ошибок с retry логикой
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.log(`   ⚠️  Сетевая ошибка при свапе ETH → ${stablecoinSymbol}: соединение прервано`);
      
      // Попытка повтора для сетевых ошибок
      try {
        console.log(`   🔄 Повторная попытка свапа ETH → ${stablecoinSymbol}...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды
        
        // Повторяем запрос котировки
        const retryQuote = await relayBridge.getQuote(quoteParams);
        
        if (retryQuote && retryQuote.steps && retryQuote.steps.length > 0) {
          console.log(`   ✅ Повторная попытка успешна, выполняем свап...`);
          
          // Выполняем свап с повторной котировкой
          const retryResult = await relayBridge.executeSteps(retryQuote.steps, provider, signer);
          
          if (retryResult && Array.isArray(retryResult)) {
            const failedSteps = retryResult.filter(step => step.status === 'failed');
            if (failedSteps.length === 0) {
              console.log(`   ✅ Свап ETH → ${stablecoinSymbol} завершен после повтора`);
              
              // Отправляем лог успеха в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'swap',
                  data: {
                    token: {
                      symbol: 'ETH',
                      amount: ethAmountFormatted,
                      logo_url: TOKEN_LOGOS.ETH
                    },
                    chain: network.toUpperCase(),
                    target: stablecoinSymbol,
                    status: 'success'
                  }
                }, 'success');
              }
              
              // Задержка между транзакциями
              if (shouldDelayAfter) {
                await transactionDelay();
              }
              
              return true;
            }
          }
        }
      } catch (retryError) {
        console.log(`   ❌ Повторная попытка не удалась: ${retryError.message}`);
      }
      
      // Отправляем лог в UI о неудаче
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'swap',
          data: {
            token: {
              symbol: 'ETH',
              amount: ethAmountFormatted,
              logo_url: TOKEN_LOGOS.ETH
            },
            chain: network.toUpperCase(),
            target: stablecoinSymbol,
            status: 'skipped',
            reason: 'Сетевая ошибка'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    // Для других ошибок используем стандартную обработку
    console.log(`   ❌ Ошибка свапа ETH → ${stablecoinSymbol}: ${error.message}`);
    
    // Отправляем лог ошибки в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'swap',
        data: {
          token: {
            symbol: 'ETH',
            amount: (Number(ethAmount) / Math.pow(10, 18)).toFixed(6),
            logo_url: TOKEN_LOGOS.ETH
          },
          chain: network.toUpperCase(),
          target: stablecoinSymbol,
          status: 'failed',
          reason: error.message
        }
      }, 'error');
    }
    
    return false;
  }
}

// Функция для получения баланса ETH в сети
async function getEthBalance(address, network) {
  // Маппинг названий сетей к идентификаторам DeBank
  const networkMapping = {
    'optimism': 'op',
    'arbitrum': 'arb',
    'base': 'base'
  };
  
  const debankId = networkMapping[network] || network;
  const chainId = chainMapper.getChainId(debankId);
  
  if (!chainId) {
    console.log(`   ❌ Неподдерживаемая сеть: ${network} (debankId: ${debankId})`);
    return 0n;
  }

  const provider = await createProviderWithFallback(chainId);
  if (!provider) {
    console.log(`   ⚠️  Пропускаем получение баланса ETH - RPC недоступны для ${getChainName(chainId)}`);
    return 0n;
  }

  try {
    const balance = await provider.getBalance(address);
    return balance;
  } catch (error) {
    console.log(`   ❌ Ошибка получения баланса ETH в ${network}: ${error.message}`);
    return 0n;
  }
}

// Функция для определения стейблкойна для кошелька
function getStablecoinForWallet(targetStablecoin, network) {
  if (targetStablecoin === 'random') {
    // Для Base только USDC доступен
    if (network === 'base') {
      return 'usdc';
    }
    
    // Для других сетей случайный выбор между USDT и USDC
    const availableStablecoins = Object.keys(STABLECOIN_CONFIG[network]);
    const randomIndex = Math.floor(Math.random() * availableStablecoins.length);
    return availableStablecoins[randomIndex];
  }
  
  // Проверяем доступность выбранного стейблкойна в сети
  if (STABLECOIN_CONFIG[network] && STABLECOIN_CONFIG[network][targetStablecoin]) {
    return targetStablecoin;
  }
  
  // Если выбранный стейблкойн недоступен, используем первый доступный
  const availableStablecoins = Object.keys(STABLECOIN_CONFIG[network]);
  return availableStablecoins[0] || 'usdc';
}

// Основная функция StableFix
async function main() {
  try {
    const config = getStableFixConfig();
    
    if (!config.enabled) {
      console.log('❌ StableFix отключен в конфигурации');
      return;
    }

    console.log('🔄 Запуск StableFix');
    console.log(`📊 Процент для свапа: ${config.percentage}%`);
    console.log(`🎯 Целевой стейблкойн: ${config.targetStablecoin}`);
    console.log(`🌐 Сети: ${config.networks.join(', ')}`);
    console.log('');

    // Инициализируем статус
    if (typeof global !== 'undefined' && global.bridgeStatus) {
      global.bridgeStatus.isRunning = true;
      global.bridgeStatus.startTime = new Date().toISOString();
      global.bridgeStatus.currentWallet = null;
      global.bridgeStatus.currentNetwork = null;
      global.bridgeStatus.progress = { completed: 0, total: 0 };
      global.bridgeStatus.stats = { successful: 0, failed: 0 };
      global.updateStatus?.(global.bridgeStatus);
    }

    // Читаем приватные ключи
    const privateKeys = readPrivateKeys('keys.txt');
    
    if (privateKeys.length === 0) {
      console.error('❌ Приватные ключи не найдены в keys.txt');
      return;
    }
    
    console.log(`💼 Найдено ${privateKeys.length} кошельков для обработки\n`);

    // Обновляем прогресс
    if (typeof global !== 'undefined' && global.bridgeStatus) {
      global.bridgeStatus.progress.total = privateKeys.length;
      global.updateStatus?.(global.bridgeStatus);
    }

    // Обрабатываем каждый кошелек
    for (let i = 0; i < privateKeys.length; i++) {
      // Проверяем флаг остановки
      if (typeof global !== 'undefined' && global.shouldStopStableFix && global.shouldStopStableFix()) {
        console.log('⏹️ Остановка StableFix по запросу пользователя');
        return;
      }

      const privateKey = privateKeys[i];
      const address = getAddressFromPrivateKey(privateKey);
      
      if (!address) {
        console.log(`❌ Кошелек ${i + 1}/${privateKeys.length}: Некорректный приватный ключ\n`);
        continue;
      }
      
      console.log(`💼 Кошелек ${i + 1}/${privateKeys.length}: ${address}`);
      
      // Отправляем лог о начале обработки кошелька в UI
      if (global.broadcastLog) {
        global.broadcastLog(`💼 Обработка кошелька ${address} (${i + 1}/${privateKeys.length})`, 'info'); 
      }
      
      // Обновляем текущий кошелек в статусе
      if (typeof global !== 'undefined' && global.bridgeStatus) {
        global.bridgeStatus.currentWallet = address;
        global.bridgeStatus.currentNetwork = null;
        global.updateStatus?.(global.bridgeStatus);
      }
      
      try {
        const wallet = new ethers.Wallet(privateKey);
        let totalSwaps = 0;
        let successfulSwaps = 0;

        // Обрабатываем каждую сеть
        for (const network of config.networks) {
          // Проверяем флаг остановки
          if (typeof global !== 'undefined' && global.shouldStopStableFix && global.shouldStopStableFix()) {
            console.log('⏹️ Остановка StableFix по запросу пользователя');
            return;
          }

          // Пропускаем исключенные сети
          if (config.excludedNetworks.includes(network)) {
            console.log(`   🚫 Сеть ${network.toUpperCase()} исключена`);
            continue;
          }

          console.log(`\n🔗 ${network.toUpperCase()}:`);
          console.log(`   📍 Проверяем адрес: ${wallet.address}`);

          // Обновляем текущую сеть в статусе
          if (typeof global !== 'undefined' && global.bridgeStatus) {
            global.bridgeStatus.currentNetwork = network;
            global.updateStatus?.(global.bridgeStatus);
          }

          // Получаем баланс ETH
          const ethBalance = await getEthBalance(wallet.address, network);
          
                                if (ethBalance === 0n) {
                        console.log(`   ⚠️ Нет ETH в сети ${network.toUpperCase()}`);
                        continue;
                      } else {
                        console.log(`   ✅ Найден ETH в сети ${network.toUpperCase()}`);
                      }

          const ethBalanceFormatted = (Number(ethBalance) / Math.pow(10, 18)).toFixed(6);
                                console.log(`   💰 Баланс ETH: ${ethBalanceFormatted}`);

                      // Вычисляем сумму для свапа с ограничением в 99%
                      let swapAmount = (ethBalance * BigInt(config.percentage)) / 100n;
                      
                      // Ограничиваем максимальную сумму до 99% от баланса
                      const maxSwapAmount = (ethBalance * 99n) / 100n;
                      if (swapAmount > maxSwapAmount) {
                        swapAmount = maxSwapAmount;
                        console.log(`   ⚠️ Сумма свапа ограничена до 99% для сохранения газа`);
                      }
                      
                      const swapAmountFormatted = (Number(swapAmount) / Math.pow(10, 18)).toFixed(6);
                      const percentageUsed = (Number(swapAmount) / Number(ethBalance) * 100).toFixed(1);
                      console.log(`   📊 Сумма для свапа (${percentageUsed}%): ${swapAmountFormatted} ETH`);
          
          if (swapAmount === 0n) {
            console.log(`   ⚠️ Сумма для свапа слишком мала`);
            continue;
          }

          // Определяем стейблкойн для этого кошелька
          const stablecoinType = getStablecoinForWallet(config.targetStablecoin, network);
          console.log(`   🎯 Целевой стейблкойн: ${stablecoinType.toUpperCase()}`);

          // Выполняем свап
          const isLastNetwork = network === config.networks[config.networks.length - 1];
          const swapResult = await swapEthToStablecoin(wallet, network, stablecoinType, swapAmount, !isLastNetwork);
          
          totalSwaps++;
          if (swapResult) {
            successfulSwaps++;
          }
        }

        console.log(`\n✅ Кошелек обработан: ${successfulSwaps}/${totalSwaps} свапов успешно\n`);

        // Отправляем лог о завершении обработки кошелька в UI
        if (global.broadcastLog) {
          global.broadcastLog(`✅ Кошелек ${address} обработан: ${successfulSwaps}/${totalSwaps} свапов успешно`, 'success');
        }

        // Обновляем статистику
            if (typeof global !== 'undefined' && global.bridgeStatus) {
      global.bridgeStatus.progress.completed = i + 1;
      global.bridgeStatus.stats.successful += successfulSwaps;
      global.bridgeStatus.stats.failed += (totalSwaps - successfulSwaps);
      global.updateStatus?.(global.bridgeStatus);
    }

        // Задержка между кошельками
        if (i < privateKeys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
      } catch (error) {
        console.error(`❌ Ошибка обработки кошелька: ${error.message}`);
        console.error('📍 Продолжаем с другими кошельками...\n');
      }
    }
    
    console.log('🎉 StableFix завершен');
    
    // Сбрасываем флаг остановки
    if (typeof global !== 'undefined') {
      global.shouldStopStableFix = () => false;
    }
    
    // Обновляем статус завершения
    if (typeof global !== 'undefined' && global.bridgeStatus) {
      global.bridgeStatus.isRunning = false;
      global.updateStatus?.(global.bridgeStatus);
    }
    
  } catch (error) {
    console.error(`❌ Критическая ошибка StableFix: ${error.message}`);
    
    // Сбрасываем флаг остановки
    if (typeof global !== 'undefined') {
      global.shouldStopStableFix = () => false;
    }
    
    // Обновляем статус ошибки
    if (typeof global !== 'undefined' && global.bridgeStatus) {
      global.bridgeStatus.isRunning = false;
      global.updateStatus?.(global.bridgeStatus);
    }
  }
}

// Запускаем основную функцию, если скрипт запущен напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Необработанная ошибка StableFix:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  swapEthToStablecoin,
  getEthBalance,
  getStablecoinForWallet,
  STABLECOIN_CONFIG
}; 