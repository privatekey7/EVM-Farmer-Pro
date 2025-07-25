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

// Создание экземпляра Relay Bridge
const relayBridge = new RelayBridge(); // Можно добавить API ключ, если он есть

// Функция для получения конфигурации
function getConfig() {
  if (typeof global !== 'undefined' && global.getConfig) {
    try {
      return global.getConfig();
    } catch (error) {
      console.log('Ошибка получения конфигурации, используются настройки по умолчанию');
    }
  }
  
  // Настройки по умолчанию
  return {
    collection: {
      mode: 'collect_to_target',
      targetNetwork: 'base'
    },
    excludedNetworks: [],
    transaction: {
          delayMinMs: 30000,
    delayMaxMs: 60000,
    walletDelayMinMs: 120000,
    walletDelayMaxMs: 300000
    }
  };
}

// Константы
const BASE_CHAIN_ID = 8453; // Chain ID для Base
const DESTINATION_ADDRESS = null; // Адрес получателя (если null, будет использоваться тот же адрес)
// Проскальзывание теперь рассчитывается автоматически Relay API
const WRAPPED_TOKEN_PREFIX = {
  eth: 'W',  // WETH
  arb: 'W',  // WETH
  op: 'W',   // WETH
  taiko: 'W', // WETH
};

// Получаем RPC URL из конфигурации
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

// Функция для обработки и организации данных балансов
function processTokensData(balanceData) {
  const processedData = {};
  
        // Проходим по всем ответам API
      for (const response of balanceData) {
        if (!response.data || !response.data.data) continue;
        
        // Обработка токенов из ответа
        for (const token of response.data.data) {
          const chain = token.chain;
          
          // Base обрабатываем отдельно - здесь только свапы в ETH, без бриджинга
          
          // Если сеть ещё не добавлена в результаты, инициализируем её
          if (!processedData[chain]) {
            processedData[chain] = {
              nativeToken: null,
              wrappedNativeToken: null,
              otherTokens: []
            };
          }
          
          // Вычисляем USD стоимость токена
          const usdValue = token.amount * token.price;
          
          // Определяем, является ли токен нативным или обёрнутым нативным
          const isNative = token.is_core && !token.id.startsWith('0x');
          
          // Обёрнутые токены определяем только для сетей, которые есть в WRAPPED_TOKEN_PREFIX
          const isWrappedNative = 
            WRAPPED_TOKEN_PREFIX[chain] && // Только если для сети определен префикс
            token.optimized_symbol && 
            token.optimized_symbol.startsWith(WRAPPED_TOKEN_PREFIX[chain]) &&
            (token.name.toLowerCase().includes('wrapped') || 
             token.name.toLowerCase().includes('weth'));
          
          // Проверяем, что есть необходимые данные для обработки
          if (token.raw_amount === undefined && token.raw_amount === null && !token.raw_amount_str) {
            continue;
          }
          
          // Получаем raw amount в правильном формате
          let rawAmount;
          if (token.raw_amount !== undefined && token.raw_amount !== null) {
            // Преобразуем в BigInt для корректной обработки больших чисел
            rawAmount = BigInt(Math.floor(Number(token.raw_amount))).toString();
          } else if (token.raw_amount_str) {
            // Преобразуем строковое представление через BigInt
            rawAmount = BigInt(Math.floor(Number(token.raw_amount_str))).toString();
          } else {
            rawAmount = BigInt(Math.floor(token.amount * Math.pow(10, token.decimals || 18))).toString();
          }
          
          // Добавляем токен в соответствующую категорию
          if (isNative) {
            processedData[chain].nativeToken = {
              id: token.id,
              symbol: token.symbol,
              amount: token.amount,
              rawAmount: rawAmount,
              decimals: token.decimals,
              usdValue: usdValue,
              price: token.price,
              logo_url: token.logo_url || token.logo || null
            };
          } else if (isWrappedNative) {
            processedData[chain].wrappedNativeToken = {
              id: token.id,
              symbol: token.symbol,
              amount: token.amount,
              rawAmount: rawAmount,
              decimals: token.decimals,
              usdValue: usdValue,
              price: token.price,
              address: token.id.startsWith('0x') ? token.id : null,
              logo_url: token.logo_url || token.logo || null
            };
          } else if (token.id.startsWith('0x')) { // Добавляем все токены с адресами (кроме нативных)
            // Проверяем, нет ли уже токена с таким адресом
            const existingTokenIndex = processedData[chain].otherTokens.findIndex(t => t.id === token.id);
            const tokenData = {
              id: token.id,
              symbol: token.symbol,
              amount: token.amount,
              rawAmount: rawAmount,
              decimals: token.decimals,
              usdValue: usdValue,
              price: token.price,
              address: token.id,
              logo_url: token.logo_url || token.logo || null
            };
            
            if (existingTokenIndex >= 0) {
              // Если токен уже существует, обновляем его данными с большим балансом
              if (token.amount > processedData[chain].otherTokens[existingTokenIndex].amount) {
                processedData[chain].otherTokens[existingTokenIndex] = tokenData;
              }
            } else {
              // Если токена нет, добавляем новый
              processedData[chain].otherTokens.push(tokenData);
            }
          }
        }
      }
  
  return processedData;
}

// Улучшенная версия с retry
async function unwrapToken(wallet, chainId, wrappedTokenAddress, amount) {
  const provider = await createProviderWithFallback(chainId);
  if (!provider) {
    console.log(`   ⚠️  Пропускаем анврап - RPC недоступны для ${getChainName(chainId)}`);
    return false;
  }
  
  const wethAbi = ['function withdraw(uint wad) public'];
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const wethContract = new ethers.Contract(wrappedTokenAddress, wethAbi, signer);
      
      console.log(`   📤 Отправка транзакции анврапа (попытка ${attempt}/3)...`);
      const tx = await wethContract.withdraw(amount);
      
      console.log(`   ⏳ Ожидание подтверждения транзакции...`);
      
      // Таймаут 60 секунд
      const receiptPromise = tx.wait();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for transaction confirmation')), 60000)
      );
      
      const receipt = await Promise.race([receiptPromise, timeoutPromise]);
      
      console.log(`   ✅ Анврап выполнен (блок: ${receipt.blockNumber})`);
      return true;
      
    } catch (error) {
      console.log(`   ❌ Ошибка анврапа (попытка ${attempt}/3): ${error.message}`);
      
      if (attempt < 3) {
        console.log(`   🔄 Повторная попытка через 3 секунды...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  console.log(`   ⚠️  Анврап не удался после 3 попыток, но транзакция могла выполниться`);
  return false;
}

// Функция для выполнения свапа токена в нативный через Relay
async function swapTokenToNative(wallet, chain, tokenData, shouldDelayAfter = false) {
  // Проверяем флаг остановки в начале функции
  if (typeof global !== 'undefined' && global.shouldStop && global.shouldStop()) {
    console.log('⏹️ Остановка автобриджера по запросу пользователя');
    return false;
  }
  
  const debankChainId = chain;
  const chainId = chainMapper.getChainId(debankChainId);
  
  if (!chainId) {
    return false;
  }
  
  const provider = await createProviderWithFallback(chainId);
  if (!provider) {
    console.log(`   ⚠️  Пропускаем свап ${tokenData.symbol} - RPC недоступны для ${getChainName(chainId)}`);
    return false;
  }
  
  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    
    // Проверяем наличие rawAmount
    if (!tokenData.rawAmount) {
      return false;
    }
    
    // Проверяем фактический баланс токена на кошельке
    const tokenAbi = ['function balanceOf(address owner) view returns (uint256)'];
    const tokenContract = new ethers.Contract(tokenData.address, tokenAbi, provider);
    
    try {
      const actualBalance = await tokenContract.balanceOf(wallet.address);
      const requestedAmount = BigInt(tokenData.rawAmount);
      
      if (actualBalance < requestedAmount) {
        if (actualBalance === 0n) {
          return false;
        }
        tokenData.rawAmount = actualBalance.toString();
      }
      

      
    } catch (error) {
      // Продолжаем с исходными данными
    }
    
    // Для свапа токенов используем всю сумму (газ оплачивается нативным токеном, а не свапаемым)
    const quoteParams = {
      user: wallet.address,
      recipient: wallet.address,
      originChainId: chainId,
      destinationChainId: chainId, // Свап внутри той же сети
      originCurrency: tokenData.address,
      destinationCurrency: '0x0000000000000000000000000000000000000000', // Свап в нативную валюту
      amount: BigInt(Math.floor(Number(tokenData.rawAmount))).toString(), // Преобразуем в корректный формат
      tradeType: 'EXACT_INPUT'
      // НЕ добавляем slippageTolerance для автоматического расчёта
    };
    
    const actualAmountFormatted = (Number(tokenData.rawAmount) / Math.pow(10, tokenData.decimals || 18)).toFixed(6);
    
    // Проверяем USD стоимость токена - если меньше $0.01, скорее всего слишком мала для свапа
    const actualAmount = Number(tokenData.rawAmount) / Math.pow(10, tokenData.decimals || 18);
    const usdValue = actualAmount * (tokenData.price || 0);
    
    // Проверяем минимальную стоимость (меньше $0.01) или отсутствие цены
    if (usdValue < 0.01) {
      console.log(`   🔄 Свап ${tokenData.symbol} (${actualAmountFormatted}) → ${chain === 'base' ? 'ETH' : 'нативный'}`);
      
      if (tokenData.price === 0 || tokenData.price === null || tokenData.price === undefined) {
        console.log(`   ⚠️  Токен ${tokenData.symbol} не имеет цены - пропускаем`);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: tokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: tokenData.logo_url,
                usd_value: '0.00'
              },
              chain: chain.toUpperCase(),
              target: chain === 'base' ? 'ETH' : 'нативный',
              status: 'skipped',
              reason: 'Токен не имеет цены'
            }
          }, 'warning');
        }
      } else {
        console.log(`   ⚠️  Сумма ${tokenData.symbol} слишком мала для свапа ($${usdValue.toFixed(4)})`);
        
        // Отправляем лог в UI о том что сумма слишком мала
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: tokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: tokenData.logo_url,
                usd_value: usdValue.toFixed(4)
              },
              chain: chain.toUpperCase(),
              target: chain === 'base' ? 'ETH' : 'нативный',
              status: 'skipped',
              reason: 'Сумма слишком мала'
            }
          }, 'warning');
        }
      }
      
      return false;
    }
    
    console.log(`   🔄 Свап ${tokenData.symbol} (${actualAmountFormatted}) → ${chain === 'base' ? 'ETH' : 'нативный'}`);
    
    // Отправляем лог начала операции в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'swap',
        data: {
          token: {
            symbol: tokenData.symbol,
            amount: actualAmountFormatted,
            logo_url: tokenData.logo_url,
            usd_value: usdValue.toFixed(2)
          },
          chain: chain.toUpperCase(),
          target: chain === 'base' ? 'ETH' : 'нативный',
          status: 'started'
        }
      }, 'info');
    }
    
    // Retry механизм для getQuote
    let quote;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        quote = await relayBridge.getQuote(quoteParams);
        break; // Успешно получили котировку
      } catch (error) {
        retryCount++;
        
        // Если это сетевая ошибка и есть еще попытки
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && retryCount < maxRetries) {
          console.log(`   🔄 Повторная попытка ${retryCount}/${maxRetries} для ${tokenData.symbol}...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Увеличиваем задержку с каждой попыткой
          continue;
        }
        
        // Если это не сетевая ошибка или закончились попытки
        handleRelayError(error, tokenData.symbol, 'свапа', chain);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: tokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: tokenData.logo_url,
                usd_value: usdValue.toFixed(2)
              },
              chain: chain.toUpperCase(),
              target: chain === 'base' ? 'ETH' : 'нативный',
              status: 'skipped',
              reason: 'Свап недоступен'
            }
          }, 'warning');
        }
        
        return false;
      }
    }
    
    // Отладочные логи удалены
    
    // Проверяем котировку на возможность выполнения свапа
    if (quote.breakdown && quote.breakdown.details && quote.breakdown.details.currencyOut) {
      const outputAmount = Number(quote.breakdown.details.currencyOut.amount);
      if (outputAmount <= 0) {
        console.log(`   ⚠️  Сумма ${tokenData.symbol} слишком мала для свапа`);
        return false;
      }
    }
    
    // Дополнительно проверяем наличие steps - если их нет, значит свап невозможен
    if (!quote.steps || quote.steps.length === 0) {
      console.log(`   ⚠️  Сумма ${tokenData.symbol} слишком мала для свапа`);
      return false;
    }
    
    // Проверяем, есть ли сообщение об ошибке в котировке
    if (quote.message && quote.message.includes('too low')) {
      console.log(`   ⚠️  Сумма ${tokenData.symbol} слишком мала для свапа`);
      
      // Отправляем лог в UI о том что сумма слишком мала
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'swap',
          data: {
            token: {
              symbol: tokenData.symbol,
              amount: actualAmountFormatted,
              logo_url: tokenData.logo_url,
              usd_value: usdValue.toFixed(2)
            },
            chain: chain.toUpperCase(),
            target: chain === 'base' ? 'ETH' : 'нативный',
            status: 'skipped',
            reason: 'Сумма слишком мала'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    const steps = quote.steps;
    
    // Retry механизм для executeSteps
    let result;
    let executeRetryCount = 0;
    const maxExecuteRetries = 2;
    
    while (executeRetryCount < maxExecuteRetries) {
      try {
        // Выполняем шаги свапа с рекомендуемыми значениями газа из котировки
        result = await relayBridge.executeSteps(steps, provider, signer);
        break; // Успешно выполнили
      } catch (error) {
        executeRetryCount++;
        
        // Если это сетевая ошибка и есть еще попытки
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && executeRetryCount < maxExecuteRetries) {
          console.log(`   🔄 Повторная попытка выполнения ${executeRetryCount}/${maxExecuteRetries} для ${tokenData.symbol}...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * executeRetryCount)); // Увеличиваем задержку
          continue;
        }
        
        // Если это не сетевая ошибка или закончились попытки
        console.log(`   ❌ Ошибка выполнения свапа ${tokenData.symbol}: ${error.message}`);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'swap',
            data: {
              token: {
                symbol: tokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: tokenData.logo_url,
                usd_value: usdValue.toFixed(2)
              },
              chain: chain.toUpperCase(),
              target: chain === 'base' ? 'ETH' : 'нативный',
              status: 'failed',
              reason: 'Ошибка выполнения'
            }
          }, 'error');
        }
        
        return false;
      }
    }
    
    // Проверяем результат выполнения
    if (result && result.length > 0) {
      // Проверяем, есть ли проваленные шаги
      const failedSteps = result.filter(step => step.status === 'failed');
      if (failedSteps.length > 0) {
        // Анализируем тип провала для корректного сообщения
        const failedErrors = failedSteps.map(step => step.error || '').join(' ').toLowerCase();
        
        if (failedErrors.includes('too low') || 
            failedErrors.includes('insufficient') ||
            failedErrors.includes('amount') ||
            failedErrors.includes('balance')) {
          console.log(`   ⚠️  Сумма ${tokenData.symbol} слишком мала для свапа`);
          
          // Отправляем лог в UI о том что сумма слишком мала
          if (global.broadcastLog) {
            global.broadcastLog({
              type: 'token_operation',
              operation: 'swap',
              data: {
                token: {
                  symbol: tokenData.symbol,
                  amount: actualAmountFormatted,
                  logo_url: tokenData.logo_url,
                  usd_value: usdValue.toFixed(2)
                },
                chain: chain.toUpperCase(),
                target: chain === 'base' ? 'ETH' : 'нативный',
                status: 'skipped',
                reason: 'Недостаточно средств'
              }
            }, 'warning');
          }
        } else {
          console.log(`   ❌ Свап ${tokenData.symbol} не выполнен`);
          
          // Отправляем лог в UI о неудачном свапе
          if (global.broadcastLog) {
            global.broadcastLog({
              type: 'token_operation',
              operation: 'swap',
              data: {
                token: {
                  symbol: tokenData.symbol,
                  amount: actualAmountFormatted,
                  logo_url: tokenData.logo_url,
                  usd_value: usdValue.toFixed(2)
                },
                chain: chain.toUpperCase(),
                target: chain === 'base' ? 'ETH' : 'нативный',
                status: 'skipped',
                reason: 'Свап недоступен'
              }
            }, 'error');
          }
        }
        return false;
      }
    }
    
    console.log(`   ✅ Свап завершен`);
    
    // Отправляем лог успеха в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'swap',
        data: {
          token: {
            symbol: tokenData.symbol,
            amount: actualAmountFormatted,
            logo_url: tokenData.logo_url,
            usd_value: usdValue.toFixed(2)
          },
          chain: chain.toUpperCase(),
          target: chain === 'base' ? 'ETH' : 'нативный',
          status: 'success'
        }
      }, 'success');
    }
    
    // Задержка между транзакциями (если это не последний токен)
    if (shouldDelayAfter) {
      await transactionDelay();
    }
    
    return true;
  } catch (error) {
    // Обработка сетевых ошибок с retry логикой
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.log(`   ⚠️  Сетевая ошибка при свапе ${tokenData.symbol}: соединение прервано`);
      
      // Попытка повтора для сетевых ошибок
      try {
        console.log(`   🔄 Повторная попытка свапа ${tokenData.symbol}...`);
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
              console.log(`   ✅ Свап ${tokenData.symbol} завершен после повтора`);
              
              // Отправляем лог успеха в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'swap',
                  data: {
                    token: {
                      symbol: tokenData.symbol,
                      amount: actualAmountFormatted,
                      logo_url: tokenData.logo_url,
                      usd_value: usdValue.toFixed(2)
                    },
                    chain: chain.toUpperCase(),
                    target: chain === 'base' ? 'ETH' : 'нативный',
                    status: 'success',
                    output: `${outputFormatted} ${chain === 'base' ? 'ETH' : 'нативный'}`
                  }
                }, 'success');
              }
              
              // Задержка между транзакциями (если это не последний токен)
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
              symbol: tokenData.symbol,
              amount: typeof actualAmountFormatted !== 'undefined' ? actualAmountFormatted : 'N/A',
              logo_url: tokenData.logo_url,
              usd_value: typeof usdValue !== 'undefined' ? usdValue.toFixed(2) : '0.00'
            },
            chain: chain.toUpperCase(),
            target: chain === 'base' ? 'ETH' : 'нативный',
            status: 'skipped',
            reason: 'Сетевая ошибка'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    // Безопасно получаем значения, которые могут быть недоступны
    const safeAmount = typeof actualAmountFormatted !== 'undefined' ? actualAmountFormatted : 'N/A';
    const safeUsdValue = typeof usdValue !== 'undefined' ? usdValue.toFixed(2) : '0.00';
    
    // Определяем правильную причину ошибки
    let errorReason = 'Свап недоступен';
    let errorStatus = 'skipped';
    
    if (error.response && error.response.data) {
      const errorCode = error.response.data.errorCode;
      const errorMessage = error.response.data.message || '';
      
      // Карта ошибок для UI
      const uiErrorMap = {
        'AMOUNT_TOO_LOW': { reason: 'Сумма слишком мала', status: 'skipped' },
        'NO_SWAP_ROUTES_FOUND': { reason: 'Свап недоступен', status: 'skipped' },
        'INVALID_INPUT_CURRENCY': { reason: 'Неподдерживаемый токен', status: 'skipped' },
        'UNSUPPORTED_CURRENCY': { reason: 'Токен не поддерживается', status: 'skipped' },
        'INSUFFICIENT_FUNDS': { reason: 'Недостаточно средств', status: 'failed' },
        'INSUFFICIENT_LIQUIDITY': { reason: 'Недостаточно ликвидности', status: 'failed' }
      };
      
      if (errorCode && uiErrorMap[errorCode]) {
        errorReason = uiErrorMap[errorCode].reason;
        errorStatus = uiErrorMap[errorCode].status;
      } else if (errorMessage.toLowerCase().includes('no route') || errorMessage.toLowerCase().includes('routes not found')) {
        errorReason = 'Свап недоступен';
        errorStatus = 'skipped';
      } else if (errorMessage.toLowerCase().includes('too low') || errorMessage.toLowerCase().includes('minimum')) {
        errorReason = 'Сумма слишком мала';
        errorStatus = 'skipped';
      }
    }
    
    // Отправляем лог ошибки в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'swap',
        data: {
          token: {
            symbol: tokenData.symbol,
            amount: safeAmount,
            logo_url: tokenData.logo_url,
            usd_value: safeUsdValue
          },
          chain: chain.toUpperCase(),
          target: chain === 'base' ? 'ETH' : 'нативный',
          status: errorStatus,
          reason: errorReason
        }
      }, errorStatus === 'failed' ? 'error' : 'warning');
    }
    
    handleRelayError(error, tokenData.symbol, 'свапа', chain);
    return false;
  }
}

// Функция для поиска минимальной суммы для бриджа
async function findMinimumBridgeAmount(wallet, sourceChain, targetChain, nativeTokenData) {
  const sourceChainId = chainMapper.getChainId(sourceChain);
  const targetChainId = chainMapper.getChainId(targetChain);
  
  if (!sourceChainId || !targetChainId) {
    return null;
  }
  
  const provider = await createProviderWithFallback(sourceChainId);
  if (!provider) {
    return null;
  }
  
  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    const currentNativeBalance = await provider.getBalance(wallet.address);
    
    // Начинаем с минимальной суммы
    let minAmount = BigInt('1000000000000000'); // 0.001 ETH
    let maxAmount = currentNativeBalance;
    let optimalAmount = null;
    
    // Бинарный поиск для нахождения минимальной суммы
    while (minAmount <= maxAmount) {
      const testAmount = (minAmount + maxAmount) / 2n;
      
      const quoteParams = {
        user: wallet.address,
        recipient: wallet.address,
        originChainId: sourceChainId,
        destinationChainId: targetChainId,
        originCurrency: '0x0000000000000000000000000000000000000000',
        destinationCurrency: '0x0000000000000000000000000000000000000000',
        amount: testAmount.toString(),
        tradeType: 'EXACT_INPUT'
      };
      
      try {
        const quote = await relayBridge.getQuote(quoteParams);
        
        if (quote.steps && quote.steps.length > 0) {
          // Маршрут найден, уменьшаем сумму
          optimalAmount = testAmount;
          maxAmount = testAmount - 1n;
        } else {
          // Маршрут не найден, увеличиваем сумму
          minAmount = testAmount + 1n;
        }
      } catch (error) {
        // Если ошибка AMOUNT_TOO_LOW, увеличиваем сумму
        if (error.errorCode === 'AMOUNT_TOO_LOW' || error.message?.includes('amount too low')) {
          minAmount = testAmount + 1n;
        } else {
          // Другие ошибки, увеличиваем сумму
          minAmount = testAmount + 1n;
        }
      }
    }
    
    return optimalAmount;
    
  } catch (error) {
    console.log(`   ❌ Ошибка поиска минимальной суммы: ${error.message}`);
    return null;
  }
}

// Функция для бриджинга в любую целевую сеть
async function bridgeToTargetNetwork(wallet, sourceChain, nativeTokenData, targetChain, shouldDelayAfter = false) {
  const sourceChainId = chainMapper.getChainId(sourceChain);
  const targetChainId = chainMapper.getChainId(targetChain);
  
  if (!sourceChainId || !targetChainId) {
    console.log(`   ❌ Неподдерживаемая сеть: ${sourceChain} или ${targetChain}`);
    return false;
  }
  
  if (sourceChain === targetChain) {
    console.log(`   📍 Исходная и целевая сеть одинаковы - бридж не требуется`);
    return false;
  }
  
  const provider = await createProviderWithFallback(sourceChainId);
  if (!provider) {
    console.log(`   ⚠️  Пропускаем бридж - RPC недоступны для ${getChainName(sourceChainId)}`);
    return false;
  }
  
  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    
    // Проверяем наличие rawAmount
    if (!nativeTokenData.rawAmount) {
      return false;
    }
    
    // Получаем актуальный баланс нативного токена
    const currentNativeBalance = await provider.getBalance(wallet.address);
    const originalAmount = BigInt(nativeTokenData.rawAmount);
    
    console.log(`   💰 Текущий баланс: ${(Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
    
    if (currentNativeBalance > originalAmount) {
      const increaseAmount = currentNativeBalance - originalAmount;
      const increaseFormatted = (Number(increaseAmount) / Math.pow(10, 18)).toFixed(8);
      console.log(`   💰 Баланс увеличился на ${increaseFormatted} ${nativeTokenData.symbol} после свапов`);
    }
    
    // Проверяем минимальную сумму в USD
    const usdValue = (Number(currentNativeBalance) / Math.pow(10, 18)) * nativeTokenData.price;
    const minBridgeAmountUsd = 0.01;
    
    if (usdValue < minBridgeAmountUsd) {
      console.log(`   ⚠️ Сумма слишком мала для бриджа`);
      console.log(`   💰 Доступно: $${usdValue.toFixed(4)}, минимум: $${minBridgeAmountUsd}`);
      
      // Отправляем лог в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'bridge',
          data: {
            token: {
              symbol: nativeTokenData.symbol,
              amount: (Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8),
              logo_url: nativeTokenData.logo_url,
              usd_value: usdValue.toFixed(2)
            },
            chain: sourceChain.toUpperCase(),
            target: targetChain.toUpperCase(),
            status: 'skipped',
            reason: 'Сумма слишком мала для бриджа'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    console.log(`   🌉 Бридж ${(Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol} → ${targetChain.toUpperCase()}`);
    
    // Получаем котировку для бриджа с полной суммой
    const quoteParams = {
      user: wallet.address,
      recipient: wallet.address,
      originChainId: sourceChainId,
      destinationChainId: targetChainId,
      originCurrency: '0x0000000000000000000000000000000000000000',
      destinationCurrency: '0x0000000000000000000000000000000000000000',
      amount: currentNativeBalance.toString(),
      tradeType: 'EXACT_INPUT'
    };
    
    console.log(`   🔍 Получаем котировку для бриджа...`);
    
    // Retry механизм для getQuote
    let quote;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        quote = await relayBridge.getQuote(quoteParams);
        break; // Успешно получили котировку
      } catch (error) {
        retryCount++;
        
        // Если это сетевая ошибка и есть еще попытки
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && retryCount < maxRetries) {
          console.log(`   🔄 Повторная попытка ${retryCount}/${maxRetries} для получения котировки...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Увеличиваем задержку с каждой попыткой
          continue;
        }
        
        // Если это не сетевая ошибка или закончились попытки
        handleRelayError(error, nativeTokenData.symbol, 'бриджа', sourceChain);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'bridge',
            data: {
              token: {
                symbol: nativeTokenData.symbol,
                amount: (Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8),
                logo_url: nativeTokenData.logo_url,
                usd_value: usdValue.toFixed(2)
              },
              chain: sourceChain.toUpperCase(),
              target: targetChain.toUpperCase(),
              status: 'skipped',
              reason: 'Котировка недоступна'
            }
          }, 'warning');
        }
        
        return false;
      }
    }
    
    if (!quote.steps || quote.steps.length === 0) {
      console.log(`   ⚠️ Маршрут бриджа не найден`);
      
      // Отправляем лог в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'bridge',
          data: {
            token: {
              symbol: nativeTokenData.symbol,
              amount: (Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8),
              logo_url: nativeTokenData.logo_url,
              usd_value: usdValue.toFixed(2)
            },
            chain: sourceChain.toUpperCase(),
            target: targetChain.toUpperCase(),
            status: 'skipped',
            reason: 'Маршрут недоступен'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    // Анализируем комиссии из ответа Relay
    let totalFeesInNative = 0n;
    let gasCostInNative = 0n;
    let relayerCostInNative = 0n;
    let relayerCostInOtherCurrency = null;
    let hasRelayerFeesInOtherCurrency = false;
    
    if (quote.fees) {
      console.log(`   💸 Анализ комиссий из Relay:`);
      
      // Газ комиссии
      if (quote.fees.gas && quote.fees.gas.amount) {
        const gasAmount = BigInt(quote.fees.gas.amount);
        const gasCurrency = quote.fees.gas.currency;
        const gasDecimals = gasCurrency?.decimals || 18;
        const gasSymbol = gasCurrency?.symbol || nativeTokenData.symbol;
        
        // Если газ в нативной валюте
        if (gasSymbol === nativeTokenData.symbol) {
          gasCostInNative = gasAmount;
          console.log(`   ⛽ Стоимость газа: ${(Number(gasAmount) / Math.pow(10, gasDecimals)).toFixed(8)} ${gasSymbol}`);
        } else {
          console.log(`   ⛽ Стоимость газа в ${gasSymbol}: ${(Number(gasAmount) / Math.pow(10, gasDecimals)).toFixed(8)}`);
        }
      }
      
      // Relayer комиссии
      if (quote.fees.relayer && quote.fees.relayer.amount) {
        const relayerAmount = BigInt(quote.fees.relayer.amount);
        const relayerCurrency = quote.fees.relayer.currency;
        const relayerDecimals = relayerCurrency?.decimals || 18;
        const relayerSymbol = relayerCurrency?.symbol || 'UNKNOWN';
        
        console.log(`   💸 Стоимость relayer: ${(Number(relayerAmount) / Math.pow(10, relayerDecimals)).toFixed(8)} ${relayerSymbol}`);
        
        // Если relayer комиссия в нативной валюте
        if (relayerSymbol === nativeTokenData.symbol) {
          relayerCostInNative = relayerAmount;
        } else {
          // Relayer комиссия в другой валюте
          relayerCostInOtherCurrency = {
            amount: relayerAmount,
            symbol: relayerSymbol,
            decimals: relayerDecimals
          };
          hasRelayerFeesInOtherCurrency = true;
          console.log(`   💸 Relayer комиссия в ${relayerSymbol} - влияет на расчет нативного токена`);
        }
      }
      
      // Общие комиссии в нативной валюте
      totalFeesInNative = gasCostInNative + relayerCostInNative;
      console.log(`   💰 Общие комиссии в ${nativeTokenData.symbol}: ${(Number(totalFeesInNative) / Math.pow(10, 18)).toFixed(8)}`);
    }
    
    // Рассчитываем оптимальную сумму для бриджа
    let optimalBridgeAmount = currentNativeBalance;
    
    // Вычисляем USD значение заранее (будет обновлено после расчета optimalBridgeAmount)
    let actualUsdValue = (Number(currentNativeBalance) / Math.pow(10, 18)) * nativeTokenData.price;
    
    // Если у нас есть relayer комиссии в другой валюте, нужно их учесть
    if (hasRelayerFeesInOtherCurrency && relayerCostInOtherCurrency) {
      // Проверяем, является ли relayer токен стабильной монетой
      const stableCoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USD'];
      const isStableCoin = stableCoins.some(coin => 
        relayerCostInOtherCurrency.symbol.toUpperCase().includes(coin)
      );
      
      if (isStableCoin) {
        // Для стабильных монет используем фиксированную USD стоимость
        const relayerAmountInUSD = Number(relayerCostInOtherCurrency.amount) / Math.pow(10, relayerCostInOtherCurrency.decimals);
        const nativeTokenPrice = nativeTokenData.price;
        
        if (nativeTokenPrice && nativeTokenPrice > 0) {
          // Рассчитываем эквивалент в нативной валюте
          const relayerEquivalentInNative = BigInt(Math.floor(relayerAmountInUSD / nativeTokenPrice * Math.pow(10, 18)));
          
          console.log(`   💰 Relayer комиссия в ${relayerCostInOtherCurrency.symbol}: $${relayerAmountInUSD.toFixed(4)}`);
          console.log(`   💰 Эквивалент в ${nativeTokenData.symbol}: ${(Number(relayerEquivalentInNative) / Math.pow(10, 18)).toFixed(8)}`);
          
          // Добавляем к общим комиссиям в нативной валюте
          totalFeesInNative += relayerEquivalentInNative;
        }
      } else {
        // Для других токенов получаем цену через API
        try {
          const relayerTokenPrice = await relayBridge.getTokenPrice(relayerCostInOtherCurrency.symbol, sourceChainId);
          const nativeTokenPrice = nativeTokenData.price;
          
          if (relayerTokenPrice && nativeTokenPrice && nativeTokenPrice > 0) {
            // Рассчитываем USD стоимость relayer комиссии
            const relayerAmountInUSD = (Number(relayerCostInOtherCurrency.amount) / Math.pow(10, relayerCostInOtherCurrency.decimals)) * relayerTokenPrice;
            
            // Рассчитываем эквивалент в нативной валюте
            const relayerEquivalentInNative = BigInt(Math.floor(relayerAmountInUSD / nativeTokenPrice * Math.pow(10, 18)));
            
            console.log(`   💰 Relayer комиссия в ${relayerCostInOtherCurrency.symbol}: $${relayerAmountInUSD.toFixed(4)}`);
            console.log(`   💰 Эквивалент в ${nativeTokenData.symbol}: ${(Number(relayerEquivalentInNative) / Math.pow(10, 18)).toFixed(8)}`);
            
            // Добавляем к общим комиссиям в нативной валюте
            totalFeesInNative += relayerEquivalentInNative;
          }
        } catch (error) {
          console.log(`   ⚠️ Не удалось получить цену ${relayerCostInOtherCurrency.symbol}, используем консервативный подход`);
          
          // Если не удалось получить цену, используем консервативный подход
          // Предполагаем, что relayer комиссия может быть значительной
          const conservativeRelayerFee = BigInt('50000000000000000'); // 0.05 ETH как консервативная оценка
          totalFeesInNative += conservativeRelayerFee;
          console.log(`   💰 Добавляем консервативную оценку relayer комиссии: ${(Number(conservativeRelayerFee) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
        }
      }
    }
    
    // Если у нас есть комиссии в нативной валюте, оставляем их
    if (totalFeesInNative > 0) {
      // Оставляем небольшой буфер для комиссий (15% от комиссий для учета колебаний цен)
      const feeBuffer = totalFeesInNative * 15n / 100n;
      const totalReserved = totalFeesInNative + feeBuffer;
      
      if (currentNativeBalance > totalReserved) {
        optimalBridgeAmount = currentNativeBalance - totalReserved;
        console.log(`   💰 Оптимальная сумма для бриджа: ${(Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
        console.log(`   💰 Оставляем для комиссий: ${(Number(totalReserved) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
      } else {
        console.log(`   ❌ Недостаточно средств для покрытия комиссий`);
        console.log(`   💰 Баланс: ${(Number(currentNativeBalance) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
        console.log(`   💰 Требуется: ${(Number(totalReserved) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
        return false;
      }
    } else {
      // Если комиссии не в нативной валюте, оставляем минимальный буфер
      const minBuffer = BigInt('10000000000000000'); // 0.01 ETH
      if (currentNativeBalance > minBuffer) {
        optimalBridgeAmount = currentNativeBalance - minBuffer;
        console.log(`   💰 Оптимальная сумма для бриджа: ${(Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
        console.log(`   💰 Оставляем буфер: ${(Number(minBuffer) / Math.pow(10, 18)).toFixed(8)} ${nativeTokenData.symbol}`);
      } else {
        console.log(`   ❌ Недостаточно средств для минимального буфера`);
        return false;
      }
    }
    
    // Проверяем минимальную сумму для бриджа
    const minBridgeAmount = BigInt('30000000000000'); // 0.00005 ETH
    if (optimalBridgeAmount < minBridgeAmount) {
      console.log(`   ⚠️ Сумма слишком мала для бриджа после вычета комиссий`);
      console.log(`   💰 Доступно: ${(Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8)} ETH`);
      console.log(`   📏 Минимум: ${(Number(minBridgeAmount) / Math.pow(10, 18)).toFixed(8)} ETH`);
      return false;
    }
    
    // Получаем новую котировку с оптимальной суммой
    const optimizedQuoteParams = {
      ...quoteParams,
      amount: optimalBridgeAmount.toString()
    };
    
    console.log(`   🔍 Получаем финальную котировку...`);
    
    // Retry механизм для финальной котировки
    let finalQuote;
    let finalRetryCount = 0;
    const maxFinalRetries = 3;
    
    while (finalRetryCount < maxFinalRetries) {
      try {
        finalQuote = await relayBridge.getQuote(optimizedQuoteParams);
        break; // Успешно получили котировку
      } catch (error) {
        finalRetryCount++;
        
        // Если это сетевая ошибка и есть еще попытки
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && finalRetryCount < maxFinalRetries) {
          console.log(`   🔄 Повторная попытка ${finalRetryCount}/${maxFinalRetries} для финальной котировки...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * finalRetryCount)); // Увеличиваем задержку
          continue;
        }
        
        // Если это не сетевая ошибка или закончились попытки
        console.log(`   ❌ Ошибка получения финальной котировки: ${error.message}`);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'bridge',
            data: {
              token: {
                symbol: nativeTokenData.symbol,
                amount: (Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8),
                logo_url: nativeTokenData.logo_url,
                usd_value: actualUsdValue.toFixed(2)
              },
              chain: sourceChain.toUpperCase(),
              target: targetChain.toUpperCase(),
              status: 'skipped',
              reason: 'Финальная котировка недоступна'
            }
          }, 'warning');
        }
        
        return false;
      }
    }
    
    if (!finalQuote.steps || finalQuote.steps.length === 0) {
      console.log(`   ❌ Маршрут недоступен для оптимальной суммы`);
      return false;
    }
    
    // Получаем выходную сумму из details
    let outputAmount = null;
    let outputFormatted = 'неизвестно';
    
    if (finalQuote.details?.currencyOut?.amount) {
      outputAmount = finalQuote.details.currencyOut.amount;
    } else {
      // Fallback на исходную сумму
      outputAmount = optimalBridgeAmount.toString();
    }
    
    if (outputAmount && !isNaN(Number(outputAmount))) {
      outputFormatted = (Number(outputAmount) / Math.pow(10, 18)).toFixed(8);
    }
    
    // Обновляем USD значение после расчета оптимальной суммы
    actualUsdValue = (Number(optimalBridgeAmount) / Math.pow(10, 18)) * nativeTokenData.price;
    const actualAmountFormatted = (Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8);
    
    console.log(`   🌉 Бридж ${actualAmountFormatted} ${nativeTokenData.symbol} → ${outputFormatted} ETH в ${targetChain.toUpperCase()}`);
    
    // Отправляем лог начала бриджинга в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'bridge',
        data: {
          token: {
            symbol: nativeTokenData.symbol,
            amount: actualAmountFormatted,
            logo_url: nativeTokenData.logo_url,
            usd_value: actualUsdValue.toFixed(2)
          },
          chain: sourceChain.toUpperCase(),
          target: targetChain.toUpperCase(),
          status: 'started'
        }
      }, 'info');
    }
    
    // Выполняем бридж с retry механизмом
    console.log(`   🚀 Выполняем бридж через Relay...`);
    
    // Retry механизм для executeSteps
    let result;
    let executeRetryCount = 0;
    const maxExecuteRetries = 2;
    
    while (executeRetryCount < maxExecuteRetries) {
      try {
        result = await relayBridge.executeSteps(finalQuote.steps, provider, signer);
        break; // Успешно выполнили
      } catch (error) {
        executeRetryCount++;
        
        // Если это сетевая ошибка и есть еще попытки
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') && executeRetryCount < maxExecuteRetries) {
          console.log(`   🔄 Повторная попытка выполнения ${executeRetryCount}/${maxExecuteRetries} для бриджа...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * executeRetryCount)); // Увеличиваем задержку
          continue;
        }
        
        // Если это не сетевая ошибка или закончились попытки
        console.log(`   ❌ Ошибка выполнения бриджа: ${error.message}`);
        
        // Отправляем лог в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'bridge',
            data: {
              token: {
                symbol: nativeTokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: nativeTokenData.logo_url,
                usd_value: actualUsdValue.toFixed(2)
              },
              chain: sourceChain.toUpperCase(),
              target: targetChain.toUpperCase(),
              status: 'failed',
              reason: 'Ошибка выполнения'
            }
          }, 'error');
        }
        
        return false;
      }
    }
    
    // Проверяем результат выполнения
    if (result && Array.isArray(result)) {
      const failedSteps = result.filter(step => step.status === 'failed');
      if (failedSteps.length === 0) {
        console.log(`   ✅ Бридж завершен успешно`);
        
        // Отправляем лог успеха бриджинга в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'bridge',
            data: {
              token: {
                symbol: nativeTokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: nativeTokenData.logo_url,
                usd_value: actualUsdValue.toFixed(2)
              },
              chain: sourceChain.toUpperCase(),
              target: targetChain.toUpperCase(),
              status: 'success',
              output: `${outputFormatted} ETH`
            }
          }, 'success');
        }
        
        // Задержка между транзакциями
        if (shouldDelayAfter) {
          await transactionDelay();
        }
        
        return true;
      } else {
        const errors = failedSteps.map(step => step.error || 'Неизвестная причина').join(', ');
        console.log(`   ❌ Ошибка бриджа: ${errors}`);
        
        // Отправляем лог ошибки бриджинга в UI
        if (global.broadcastLog) {
          global.broadcastLog({
            type: 'token_operation',
            operation: 'bridge',
            data: {
              token: {
                symbol: nativeTokenData.symbol,
                amount: actualAmountFormatted,
                logo_url: nativeTokenData.logo_url,
                usd_value: actualUsdValue.toFixed(2)
              },
              chain: sourceChain.toUpperCase(),
              target: targetChain.toUpperCase(),
              status: 'error',
              error: errors
            }
          }, 'error');
        }
        
        return false;
      }
    } else if (result && result.success) {
      console.log(`   ✅ Бридж завершен успешно`);
      
      // Отправляем лог успеха бриджинга в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'bridge',
          data: {
            token: {
              symbol: nativeTokenData.symbol,
              amount: actualAmountFormatted,
              logo_url: nativeTokenData.logo_url,
              usd_value: actualUsdValue.toFixed(2)
            },
            chain: sourceChain.toUpperCase(),
            target: targetChain.toUpperCase(),
            status: 'success',
            output: `${outputFormatted} ETH`
          }
        }, 'success');
      }
      
      // Задержка между транзакциями
      if (shouldDelayAfter) {
        await transactionDelay();
      }
      
      return true;
    } else {
      console.log(`   ❌ Неожиданный результат бриджа`);
      
      // Отправляем лог ошибки бриджинга в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'bridge',
          data: {
            token: {
              symbol: nativeTokenData.symbol,
              amount: actualAmountFormatted,
              logo_url: nativeTokenData.logo_url,
              usd_value: actualUsdValue.toFixed(2)
            },
            chain: sourceChain.toUpperCase(),
            target: targetChain.toUpperCase(),
            status: 'error',
            error: 'Неожиданный результат'
          }
        }, 'error');
      }
      
      return false;
    }
    
  } catch (error) {
    // Обработка сетевых ошибок с retry логикой
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.log(`   ⚠️  Сетевая ошибка при бриджинге: соединение прервано`);
      
      // Попытка повтора для сетевых ошибок
      try {
        console.log(`   🔄 Повторная попытка бриджинга...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем 3 секунды
        
        // Повторяем запрос котировки
        const retryQuote = await relayBridge.getQuote(quoteParams);
        
        if (retryQuote && retryQuote.steps && retryQuote.steps.length > 0) {
          console.log(`   ✅ Повторная попытка успешна, выполняем бридж...`);
          
          // Выполняем бридж с повторной котировкой
          const retryResult = await relayBridge.executeSteps(retryQuote.steps, provider, signer);
          
          if (retryResult && Array.isArray(retryResult)) {
            const failedSteps = retryResult.filter(step => step.status === 'failed');
            if (failedSteps.length === 0) {
              console.log(`   ✅ Бридж завершен после повтора`);
              
              // Отправляем лог успеха в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'bridge',
                  data: {
                    token: {
                      symbol: nativeTokenData.symbol,
                      amount: (Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8),
                      logo_url: nativeTokenData.logo_url,
                      usd_value: actualUsdValue.toFixed(2)
                    },
                    chain: sourceChain.toUpperCase(),
                    target: targetChain.toUpperCase(),
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
          operation: 'bridge',
          data: {
            token: {
              symbol: nativeTokenData.symbol,
              amount: (Number(optimalBridgeAmount) / Math.pow(10, 18)).toFixed(8),
              logo_url: nativeTokenData.logo_url,
              usd_value: actualUsdValue.toFixed(2)
            },
            chain: sourceChain.toUpperCase(),
            target: targetChain.toUpperCase(),
            status: 'skipped',
            reason: 'Сетевая ошибка'
          }
        }, 'warning');
      }
      
      return false;
    }
    
    // Для других ошибок используем стандартную обработку
    console.log(`   ❌ Ошибка бриджинга: ${error.message}`);
    
    // Отправляем лог ошибки бриджинга в UI
    if (global.broadcastLog) {
      global.broadcastLog({
        type: 'token_operation',
        operation: 'bridge',
        data: {
          token: {
            symbol: nativeTokenData.symbol,
            amount: (Number(nativeTokenData.rawAmount) / Math.pow(10, 18)).toFixed(8),
            logo_url: nativeTokenData.logo_url,
            usd_value: ((Number(nativeTokenData.rawAmount) / Math.pow(10, 18)) * nativeTokenData.price).toFixed(2)
          },
          chain: sourceChain.toUpperCase(),
          target: targetChain.toUpperCase(),
          status: 'error',
          error: error.message
        }
      }, 'error');
    }
    
    return false;
  }
}

// Проверка исключенных сетей
function isNetworkExcluded(network) {
  const config = getConfig();
  const excludedNetworks = config.excludedNetworks || [];
  return excludedNetworks.includes(network);
}

// Функция валидации конфигурации
function validateConfiguration() {
  const config = getConfig();
  const collectionMode = config.collection?.mode || 'collect_to_target';
  const targetNetworks = config.collection?.targetNetworks || [];
  const targetNetwork = config.collection?.targetNetwork; // Для обратной совместимости
  
  // Проверяем что есть целевые сети
  if (targetNetworks.length === 0 && !targetNetwork) {
    console.error('❌ ОШИБКА КОНФИГУРАЦИИ');
    
    if (collectionMode === 'collect_to_target') {
      console.error('📋 Режим: collect_to_target');
      console.error('🚫 Не указаны сети для бриджинга!');
      console.error('');
      console.error('📝 Исправьте в настройках UI:');
      console.error('   targetNetworks: ["base"]     // Сбор в Base');
      console.error('   targetNetworks: ["arb"]      // Сбор в Arbitrum');
      console.error('   targetNetworks: ["op"]       // Сбор в Optimism');
      console.error('   targetNetworks: ["base", "arb", "op"]   // Случайная сеть для каждого кошелька');
    } else {
      console.error('📋 Режим: swap_to_native');
      console.error('🚫 Не указаны сети для обработки!');
      console.error('');
      console.error('📝 Исправьте в настройках UI:');
      console.error('   targetNetworks: ["all_chains"]  // Обработка всех сетей');
      console.error('   targetNetworks: ["avax"]        // Только AVAX');
      console.error('   targetNetworks: ["base"]        // Только Base');
      console.error('   targetNetworks: ["arb"]         // Только Arbitrum');
    }
    
    console.error('');
    console.error('🔧 После исправления перезапустите программу');
    process.exit(1);
  }
  
  // Проверяем корректность значений для swap_to_native
  if (collectionMode === 'swap_to_native') {
    const networksToCheck = targetNetworks.length > 0 ? targetNetworks : [targetNetwork];
    
    for (const network of networksToCheck) {
      if (network !== 'all_chains') {
        // Проверяем что сеть существует в chainMapper
        const chainId = chainMapper.getChainId(network);
        if (!chainId) {
          console.error('❌ ОШИБКА КОНФИГУРАЦИИ');
          console.error('📋 Режим: swap_to_native');
          console.error(`🚫 Неизвестная сеть: "${network}"`);
          console.error('');
          console.error('📝 Сеть должна быть поддержана в chainMapper.js');
          console.error('   Проверьте список поддерживаемых сетей в UI');
          console.error('');
          console.error('🔧 Исправьте в настройках UI и перезапустите автобриджер');
          process.exit(1);
        }
      }
    }
  }
}

// Основная функция
async function main(walletsData = null) {
  try {
    // Валидируем конфигурацию перед запуском
    validateConfiguration();
    
    // Определяем режим работы для отображения
    const config = getConfig();
    const collectionMode = config.collection?.mode || 'collect_to_target';
    const targetNetworks = config.collection?.targetNetworks || [];
    const targetNetwork = config.collection?.targetNetwork; // Для обратной совместимости
    
    let modeDescription = '';
    switch (collectionMode) {
      case 'collect_to_target':
        if (targetNetworks.length > 1) {
          const networkNames = targetNetworks.map(net => net.toUpperCase()).join('/');
          modeDescription = `🎲 Сбор токенов в случайные сети (${networkNames})`;
        } else if (targetNetworks.length === 1) {
          modeDescription = `🌉 Сбор всех токенов в ${targetNetworks[0].toUpperCase()}`;
        } else if (targetNetwork === 'random') {
          const fallbackNetworks = ['base', 'arb', 'op'];
          const networkNames = fallbackNetworks.map(net => net.toUpperCase()).join('/');
          modeDescription = `🎲 Сбор токенов в случайные сети (${networkNames})`;
        } else if (targetNetwork) {
          modeDescription = `🌉 Сбор всех токенов в ${targetNetwork.toUpperCase()}`;
        } else {
          modeDescription = '🌉 Бридж токенов из всех сетей в Base (по умолчанию)';
        }
        break;
      case 'swap_to_native':
        if (targetNetworks.length === 1 && targetNetworks[0] === 'all_chains') {
          modeDescription = '💰 Свапы в нативку во всех сетях (без бриджей)';
        } else if (targetNetworks.length === 1) {
          modeDescription = `💰 Свапы в нативку только в сети ${targetNetworks[0].toUpperCase()}`;
        } else if (targetNetworks.length > 1) {
          const networkNames = targetNetworks.map(net => net.toUpperCase()).join('/');
          modeDescription = `💰 Свапы в нативку в случайные сети (${networkNames})`;
        } else if (targetNetwork === 'all_chains') {
          modeDescription = '💰 Свапы в нативку во всех сетях (без бриджей)';
        } else if (targetNetwork) {
          modeDescription = `💰 Свапы в нативку только в сети ${targetNetwork.toUpperCase()}`;
        } else {
          modeDescription = '💰 Свапы в нативку во всех сетях (без бриджей)';
        }
        break;
    }
    
    console.log('🚀 Запуск автобриджера');
    console.log(`📋 Режим: ${modeDescription}`);
    
    // Показываем исключенные сети если они есть
    const excludedNetworks = config.excludedNetworks || [];
    if (excludedNetworks.length > 0) {
      console.log(`🚫 Исключенные сети: ${excludedNetworks.map(n => n.toUpperCase()).join(', ')}`);
    }
    console.log('');
    
    // Проверяем, что данные переданы
    if (!walletsData || walletsData.length === 0) {
      console.error('❌ Данные кошельков не переданы или пусты');
      return;
    }
    
    // Обрабатываем каждый кошелек
    for (const walletData of walletsData) {
      // Проверяем флаг остановки
      if (typeof global !== 'undefined' && global.shouldStop && global.shouldStop()) {
        console.log('⏹️ Остановка автобриджера по запросу пользователя');
        return;
      }
      
      try {
        const wallet = new ethers.Wallet(walletData.privateKey);
        
        // Определяем целевую сеть для текущего кошелька
        let walletTargetNetwork;
        
        if (targetNetworks.length > 0) {
          // Используем новую структуру targetNetworks
          if (targetNetworks.length === 1) {
            walletTargetNetwork = targetNetworks[0];
          } else {
            // Выбираем случайную сеть из доступных
            const randomIndex = Math.floor(Math.random() * targetNetworks.length);
            walletTargetNetwork = targetNetworks[randomIndex];
            console.log(`💼 Кошелек: ${wallet.address} | 🎲 Случайная сеть: ${walletTargetNetwork.toUpperCase()}`);
          }
        } else if (targetNetwork === 'random') {
          // Обратная совместимость для старой структуры
          const availableNetworks = config.collection?.targetNetworks?.length > 0 
            ? config.collection.targetNetworks 
            : ['base', 'arb', 'op'];
          const randomIndex = Math.floor(Math.random() * availableNetworks.length);
          walletTargetNetwork = availableNetworks[randomIndex];
          console.log(`💼 Кошелек: ${wallet.address} | 🎲 Случайная сеть: ${walletTargetNetwork.toUpperCase()}`);
        } else {
          // Обратная совместимость для старой структуры
          walletTargetNetwork = targetNetwork;
        }
        
        if (targetNetworks.length <= 1 && targetNetwork !== 'random') {
          console.log(`💼 Кошелек: ${wallet.address} | 🎯 Целевая сеть: ${walletTargetNetwork.toUpperCase()}`);
        } else if (targetNetworks.length <= 1) {
          console.log(`💼 Кошелек: ${wallet.address}`);
        }
        
        const processedBalances = processTokensData(walletData.balances);
        const chainEntries = Object.entries(processedBalances);
        
        // Фильтруем сети по настройкам
        let filteredChainEntries = chainEntries;
        
        // Для режима swap_to_native с указанной сетью - обрабатываем только её
        if (collectionMode === 'swap_to_native') {
          if (walletTargetNetwork && walletTargetNetwork !== 'all_chains') {
            filteredChainEntries = chainEntries.filter(([chain]) => chain === walletTargetNetwork);
            if (filteredChainEntries.length === 0) {
              console.log(`⚠️  Сеть ${walletTargetNetwork.toUpperCase()} не найдена в балансах кошелька`);
              continue;
            }
            console.log(`🎯 Обрабатываем только сеть ${walletTargetNetwork.toUpperCase()}`);
          } else if (walletTargetNetwork === 'all_chains') {
            console.log(`🌐 Обрабатываем все сети (только свапы)`);
          } else {
            console.log(`🌐 Обрабатываем все сети (только свапы)`);
          }
        }
        
        // Обрабатываем каждую сеть
        for (let i = 0; i < filteredChainEntries.length; i++) {
          // Проверяем флаг остановки
          if (typeof global !== 'undefined' && global.shouldStop && global.shouldStop()) {
            console.log('⏹️ Остановка автобриджера по запросу пользователя');
            return;
          }
          
          const [chain, tokens] = filteredChainEntries[i];
          const isLastChain = i === filteredChainEntries.length - 1;
          const nativeAmount = tokens.nativeToken ? tokens.nativeToken.amount.toFixed(6) : '0';
          const wrappedAmount = tokens.wrappedNativeToken ? tokens.wrappedNativeToken.amount.toFixed(6) : '0';
          const otherCount = tokens.otherTokens.length;
          
          console.log(`\n🔗 ${chain.toUpperCase()}: ${nativeAmount} ${tokens.nativeToken?.symbol || 'ETH'}, ${wrappedAmount} wrapped, ${otherCount} токенов`);
          
          // Проверяем исключенные сети
          if (isNetworkExcluded(chain)) {
            console.log(`   🚫 Сеть исключена из обработки`);
            continue;
          }
          
          // Проверяем настройку Ethereum mainnet
          if (chain === 'eth' && !config.enableEthMainnet) {
            console.log(`   ⛽ Ethereum mainnet отключён в настройках`);
            continue;
          }
          
          
          // Особая обработка для целевой сети - только свапы, без бриджинга
          if (chain === walletTargetNetwork) {
            console.log(`   📍 Целевая сеть - только свапы в нативный`);
            const chainId = chainMapper.getChainId(chain);
            
            // Сначала обрабатываем обёрнутые нативные токены (анврап)
            if (tokens.wrappedNativeToken && tokens.wrappedNativeToken.address) {
              console.log(`   🔓 Анврап ${tokens.wrappedNativeToken.symbol}`);
              
              // Отправляем лог начала unwrap в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'unwrap',
                  data: {
                    token: {
                      symbol: tokens.wrappedNativeToken.symbol,
                      amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                      logo_url: tokens.wrappedNativeToken.logo_url,
                      usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                    },
                    chain: chain.toUpperCase(),
                    target: 'нативный',
                    status: 'started'
                  }
                }, 'info');
              }
              
              try {
                const unwrapResult = await unwrapToken(
                  wallet,
                  chainId,
                  tokens.wrappedNativeToken.address,
                  tokens.wrappedNativeToken.rawAmount
                );
                
                // Отправляем лог результата unwrap в UI
                if (global.broadcastLog) {
                  global.broadcastLog({
                    type: 'token_operation',
                    operation: 'unwrap',
                    data: {
                      token: {
                        symbol: tokens.wrappedNativeToken.symbol,
                        amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                        logo_url: tokens.wrappedNativeToken.logo_url,
                        usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                      },
                      chain: chain.toUpperCase(),
                      target: 'нативный',
                      status: unwrapResult ? 'success' : 'error'
                    }
                  }, unwrapResult ? 'success' : 'error');
                }
              } catch (error) {
                console.log(`   ❌ Ошибка unwrap ${tokens.wrappedNativeToken.symbol}: ${error.message}`);
                console.log(`   📍 Продолжаем с другими операциями...`);
                
                // Отправляем лог ошибки unwrap в UI
                if (global.broadcastLog) {
                  global.broadcastLog({
                    type: 'token_operation',
                    operation: 'unwrap',
                    data: {
                      token: {
                        symbol: tokens.wrappedNativeToken.symbol,
                        amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                        logo_url: tokens.wrappedNativeToken.logo_url,
                        usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                      },
                      chain: chain.toUpperCase(),
                      target: 'нативный',
                      status: 'error',
                      error: error.message
                    }
                  }, 'error');
                }
              }
            }
            
            // Затем свапаем все остальные токены в ETH
            for (const token of tokens.otherTokens) {
              // Проверяем флаг остановки
              if (typeof global !== 'undefined' && global.shouldStop && global.shouldStop()) {
                console.log('⏹️ Остановка автобриджера по запросу пользователя');
                return;
              }
              
              // Пропускаем токены с нулевым или очень маленьким балансом
              if (!token.amount || token.amount <= 0 || !token.rawAmount || token.rawAmount === '0') {
                continue;
              }
              
              try {
                const validTokens = tokens.otherTokens.filter(t => t.amount > 0 && t.rawAmount !== '0');
                const isNotLastToken = validTokens.indexOf(token) < validTokens.length - 1;
                await swapTokenToNative(wallet, chain, token, isNotLastToken);
              } catch (error) {
                console.log(`   ❌ Ошибка свапа ${token.symbol}: ${error.message}`);
                console.log(`   📍 Продолжаем с другими токенами...`);
              }
            }
            
            console.log(`   ✅ ${chain.toUpperCase()} обработан как целевая сеть`);
            
            continue;
          }
          
          // Проверяем, поддерживается ли сеть для бриджа
          const chainId = chainMapper.getChainId(chain);
          if (!chainId) {
            console.log(`   ❌ Сеть не поддерживается`);
            continue;
          }
          
          // Обработка операций
          
          // Сначала обрабатываем обёрнутые нативные токены (анврап)
          if (tokens.wrappedNativeToken && tokens.wrappedNativeToken.address) {
            console.log(`   🔓 Анврап ${tokens.wrappedNativeToken.symbol}`);
            
            // Отправляем лог начала unwrap в UI
            if (global.broadcastLog) {
              global.broadcastLog({
                type: 'token_operation',
                operation: 'unwrap',
                data: {
                  token: {
                    symbol: tokens.wrappedNativeToken.symbol,
                    amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                    logo_url: tokens.wrappedNativeToken.logo_url,
                    usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                  },
                  chain: chain.toUpperCase(),
                  target: 'нативный',
                  status: 'started'
                }
              }, 'info');
            }
            
            try {
              const unwrapResult = await unwrapToken(
                wallet,
                chainId,
                tokens.wrappedNativeToken.address,
                tokens.wrappedNativeToken.rawAmount
              );
              
              // Unwrap завершен
              
              // Отправляем лог результата unwrap в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'unwrap',
                  data: {
                    token: {
                      symbol: tokens.wrappedNativeToken.symbol,
                      amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                      logo_url: tokens.wrappedNativeToken.logo_url,
                      usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                    },
                    chain: chain.toUpperCase(),
                    target: 'нативный',
                    status: unwrapResult ? 'success' : 'error'
                  }
                }, unwrapResult ? 'success' : 'error');
              }
            } catch (error) {
              console.log(`   ❌ Ошибка unwrap ${tokens.wrappedNativeToken.symbol}: ${error.message}`);
              console.log(`   📍 Продолжаем с другими операциями...`);
              
              // Отправляем лог ошибки unwrap в UI
              if (global.broadcastLog) {
                global.broadcastLog({
                  type: 'token_operation',
                  operation: 'unwrap',
                  data: {
                    token: {
                      symbol: tokens.wrappedNativeToken.symbol,
                      amount: (Number(tokens.wrappedNativeToken.rawAmount) / Math.pow(10, tokens.wrappedNativeToken.decimals || 18)).toFixed(8),
                      logo_url: tokens.wrappedNativeToken.logo_url,
                      usd_value: tokens.wrappedNativeToken.usdValue.toFixed(2)
                    },
                    chain: chain.toUpperCase(),
                    target: 'нативный',
                    status: 'error',
                    error: error.message
                  }
                }, 'error');
              }
            }
          }
          
          // Затем свапаем все остальные токены в нативный
          let swapsCompleted = 0;
          for (const token of tokens.otherTokens) {
            // Проверяем флаг остановки
            if (typeof global !== 'undefined' && global.shouldStop && global.shouldStop()) {
              console.log('⏹️ Остановка автобриджера по запросу пользователя');
              return;
            }
            
            // Пропускаем токены с нулевым или очень маленьким балансом
            if (!token.amount || token.amount <= 0 || !token.rawAmount || token.rawAmount === '0') {
              continue;
            }
            
            try {
              const swapResult = await swapTokenToNative(wallet, chain, token, tokens.otherTokens.indexOf(token) < tokens.otherTokens.length - 1);
              if (swapResult) {
                swapsCompleted++;
              }
            } catch (error) {
              console.log(`   ❌ Ошибка свапа ${token.symbol}: ${error.message}`);
              console.log(`   📍 Продолжаем с другими токенами...`);
            }
          }
          
          // Определяем нужно ли бриджить в зависимости от режима
          let bridgeCompleted = false;
          
          if (tokens.nativeToken) {
            switch (collectionMode) {
              case 'collect_to_target':
                // Бриджим в указанную целевую сеть
                const bridgeTargetNetwork = walletTargetNetwork;
                if (chain !== bridgeTargetNetwork) {
                  console.log(`   🌉 Бридж в ${bridgeTargetNetwork.toUpperCase()}`);
                  try {
                    bridgeCompleted = await bridgeToTargetNetwork(wallet, chain, tokens.nativeToken, bridgeTargetNetwork, true);
                    // Bridge завершен
                  } catch (error) {
                    console.log(`   ❌ Ошибка бриджинга: ${error.message}`);
                    console.log(`   📍 Продолжаем с другими сетями...`);
                    bridgeCompleted = false;
                  }
                } else {
                  console.log(`   📍 Целевая сеть - бридж не требуется`);
                }
                break;
                
              case 'swap_to_native':
                // Только свапы в нативку, без бриджинга
                console.log(`   💰 Оставляем токены в нативке`);
                bridgeCompleted = false;
                break;
            }
          }
          
          // Задержка между сетями убрана - задержки только между транзакциями и кошельками
        }
        
        console.log(`\n✅ Кошелек ${wallet.address} обработан\n`);
        
      } catch (error) {
        console.error(`❌ Ошибка обработки кошелька: ${error.message}`);
        console.error('📍 Продолжаем с другими кошельками...\n');
      }
    }
    
    console.log('🎉 Автобриджер завершен');
    
  } catch (error) {
    console.error(`❌ Критическая ошибка: ${error.message}`);
  }
}



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

// Запускаем основную функцию, если скрипт запущен напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Необработанная ошибка:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  processTokensData,
  swapTokenToNative,
  bridgeToTargetNetwork,
  getRpcUrl,
  transactionDelay,
  createProviderWithFallback
}; 