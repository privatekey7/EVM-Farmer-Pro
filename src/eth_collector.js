const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getRpcUrl, transactionDelay } = require('./bridge_executor.js');
const chainMapper = require('../utils/chainMapper.js');
const { getNativeTokenInfo } = require('../utils/nativeTokens.js');
const fallbackRpcConfig = require('../utils/fallbackRPC.json');

// Получаем все доступные RPC URL для сети (основной + fallback)
function getAllRpcUrls(chainId) {
  const urls = [];
  
  // Добавляем основной RPC
  const mainRpcUrl = getRpcUrl(chainId);
  if (mainRpcUrl) {
    urls.push(mainRpcUrl);
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
  const networkInfo = getNativeTokenInfo(chainId);
  return networkInfo ? networkInfo.name.toUpperCase() : `Chain ${chainId}`;
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
  
  // Пробуем каждый RPC по одному разу
  for (let i = 0; i < urls.length; i++) {
    const rpcUrl = urls[i];
    const isMainRpc = i === 0;
    
    try {
      console.log(`   📡 Попытка ${i + 1}/${urls.length}: ${isMainRpc ? 'основной' : 'fallback'} RPC`);
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Проверяем подключение с таймаутом
      const networkPromise = provider.getNetwork();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      await Promise.race([networkPromise, timeoutPromise]);
      
      console.log(`   ✅ Подключение к ${chainName} установлено (${isMainRpc ? 'основной' : 'fallback'} RPC)`);
      return provider;
      
    } catch (error) {
      console.log(`   ❌ RPC ${i + 1}/${urls.length} недоступен: ${error.message}`);
      
      // Если это последний RPC, логируем пропуск сети
      if (i === urls.length - 1) {
        console.log(`   ⚠️  Все RPC для ${chainName} недоступны, пропускаем сеть`);
        return null;
      }
    }
  }
  
  return null;
}

// Функция для чтения субакаунтов из файла
function readSubAccounts(filePath) {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(address => address.toLowerCase());
  } catch (error) {
    console.error(`❌ Ошибка чтения субакаунтов: ${error.message}`);
    return [];
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

// Функция для получения баланса ETH
async function getEthBalance(wallet, chainId) {
  try {
    const provider = await createProviderWithFallback(chainId);
    if (!provider) {
      console.log(`   ⚠️  Пропускаем получение баланса ETH - RPC недоступны для ${getChainName(chainId)}`);
      return ethers.parseEther('0');
    }
    
    const balance = await provider.getBalance(wallet.address);
    return balance;
  } catch (error) {
    console.error(`❌ Ошибка получения баланса: ${error.message}`);
    return ethers.parseEther('0');
  }
}

// Функция для расчета суммы перевода
function calculateTransferAmount(balance, transferPercent, isRandom = false, minPercent = 0, maxPercent = 0) {
  if (isRandom && minPercent > 0 && maxPercent > 0) {
    const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;
    return (balance * BigInt(Math.floor(randomPercent * 100))) / BigInt(10000);
  } else {
    // Если перевод 100%, возвращаем специальный флаг
    if (transferPercent === 100) {
      return 'MAX'; // Специальный флаг для максимального перевода
    }
    return (balance * BigInt(Math.floor(transferPercent * 100))) / BigInt(10000);
  }
}

// Функция для расчета максимальной суммы перевода (99.99% для гарантии успешной транзакции)
function calculateMaxTransferAmount(balance) {
  try {
    // Переводим 99.9% баланса, оставляя 0.1% для комиссии
    const maxAmount = (balance * 999n) / 1000n;
    
    if (maxAmount <= 0n) {
      console.log(`   ⚠️ Недостаточно средств для перевода`);
      return 0n;
    }
    
    const maxAmountFormatted = ethers.formatEther(maxAmount);
    const remainingFormatted = ethers.formatEther(balance - maxAmount);
    console.log(`   💸 Сумма для перевода (99.9%): ${maxAmountFormatted} ETH`);
    console.log(`   💰 Остаток для комиссии (0.1%): ${remainingFormatted} ETH`);
    
    return maxAmount;
    
  } catch (error) {
    console.log(`   ❌ Ошибка расчета максимальной суммы: ${error.message}`);
    return 0n;
  }
}

// Функция для перевода ETH на субакаунт
async function transferEthToSubAccount(wallet, chainId, subAccountAddress, amount, targetChain, shouldDelayAfter = false, delayMinMs = 30000, delayMaxMs = 60000) {
  try {
    const provider = await createProviderWithFallback(chainId);
    if (!provider) {
      console.log(`   ⚠️  Пропускаем перевод ETH - RPC недоступны для ${getChainName(chainId)}`);
      return false;
    }
    
    const signer = wallet.connect(provider);
    
    // Получаем текущий gas price
    const gasPrice = await provider.getFeeData();
    const gasPriceGwei = ethers.formatUnits(gasPrice.gasPrice, 'gwei');
    
    console.log(`   ⛽ Gas Price: ${gasPriceGwei} Gwei`);
    
    // Создаем объект транзакции для оценки газа
    const txObject = {
      to: subAccountAddress,
      value: amount,
      from: wallet.address
    };
    
    // Динамически оцениваем gas limit
    let gasLimit;
    try {
      gasLimit = await provider.estimateGas(txObject);
      // Добавляем небольшой буфер для надежности (10%)
      gasLimit = (gasLimit * 110n) / 100n;
      console.log(`   ⛽ Оценка газа: ${gasLimit.toString()} units (с буфером 10%)`);
    } catch (error) {
      console.log(`   ⚠️ Ошибка оценки газа (${error.message}), используем стандартный лимит 21000`);
      gasLimit = 21000n; // Fallback к стандартному лимиту
    }
    
    // Рассчитываем комиссию за транзакцию
    const fee = gasLimit * gasPrice.gasPrice;
    const feeFormatted = ethers.formatEther(fee);
    
    console.log(`   💰 Комиссия за транзакцию: ${feeFormatted} ETH`);
    
    // Проверяем, что у нас достаточно средств
    if (amount + fee > await provider.getBalance(wallet.address)) {
      console.log(`   ⚠️ Недостаточно средств для перевода (учитывая комиссию)`);
      return false;
    }
    
    // Создаем транзакцию
    const tx = {
      to: subAccountAddress,
      value: amount,
      gasLimit: gasLimit,
      gasPrice: gasPrice.gasPrice
    };
    
    // Получаем информацию о нативном токене
    const tokenInfo = getNativeTokenInfo(targetChain);
    const tokenSymbol = tokenInfo ? tokenInfo.symbol : 'ETH';
    const tokenLogo = tokenInfo ? tokenInfo.logo_url : 'https://static.debank.com/image/coin/logo_url/eth/6443cdccced33e204d90cb723c632917.png';
    
            console.log(`   💸 Перевод ${ethers.formatEther(amount)} ${tokenSymbol} на субакаунт ${subAccountAddress.slice(0, 6)}...${subAccountAddress.slice(-4)}`);
    
    // Отправляем транзакцию
    const transaction = await signer.sendTransaction(tx);
    
    // Ждем подтверждения
    const receipt = await transaction.wait();
    
    if (receipt.status === 1) {
      console.log(`   ✅ Перевод завершен: ${transaction.hash}`);
      
      // Отправляем лог в UI
      if (global.broadcastLog) {
        global.broadcastLog({
          type: 'token_operation',
          operation: 'transfer',
          data: {
            token: {
              symbol: tokenSymbol,
              amount: ethers.formatEther(amount),
              logo_url: tokenLogo,
              usd_value: '0' // Можно добавить получение цены токена
            },
            chain: targetChain.toUpperCase(),
            target: 'субакаунт',
            status: 'success',
            hash: transaction.hash,
            from: wallet.address,
            to: subAccountAddress
          }
        }, 'success');
      }
      
      // Задержка между транзакциями
      if (shouldDelayAfter) {
        const delay = Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;
        console.log(`   ⏱️ Задержка между транзакциями: ${delay/1000} сек`);
        
        // Отправляем лог о задержке в UI
        if (global.broadcastLog) {
          global.broadcastLog(`⏱️ Задержка между транзакциями: ${delay/1000} сек`, 'info');
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return true;
    } else {
      console.log(`   ❌ Транзакция не прошла`);
      return false;
    }
    
  } catch (error) {
    console.log(`   ❌ Ошибка перевода: ${error.message}`);
    
    // Отправляем лог ошибки в UI
    if (global.broadcastLog) {
            global.broadcastLog({
        type: 'token_operation',
        operation: 'transfer',
        data: {
          token: {
            symbol: tokenSymbol,
            amount: ethers.formatEther(amount),
            logo_url: tokenLogo,
            usd_value: '0'
          },
          chain: targetChain.toUpperCase(),
          target: 'субакаунт',
          status: 'error',
          error: error.message,
          from: wallet.address,
          to: subAccountAddress
        }
      }, 'error');
    }
    
    return false;
  }
}

// Основная функция сбора ETH
async function collectEthToSubAccounts(config) {
  try {
    console.log('🚀 Запуск сбора нативных токенов на субакаунты\n');
    
    // Отправляем лог о начале сбора в UI
    if (global.broadcastLog) {
      global.broadcastLog('🚀 Запуск сбора нативных токенов на субакаунты', 'info');
    }
    
    // Читаем приватные ключи и субакаунты
    const privateKeys = readPrivateKeys('keys.txt');
    const subAccounts = readSubAccounts('sub_accs.txt');
    
    if (privateKeys.length === 0) {
      console.log('❌ Не найдены приватные ключи в keys.txt');
      return;
    }
    
    if (subAccounts.length === 0) {
      console.log('❌ Не найдены субакаунты в sub_accs.txt');
      return;
    }
    
    // Проверяем соответствие количества ключей и субакаунтов
    if (privateKeys.length !== subAccounts.length) {
      console.log(`❌ Количество ключей (${privateKeys.length}) не соответствует количеству субакаунтов (${subAccounts.length})`);
      return;
    }
    
    console.log(`📊 Найдено ${privateKeys.length} кошельков и ${subAccounts.length} субакаунтов\n`);
    
    // Настройки перевода
    const transferPercent = config.transferPercent || 100; // Процент для перевода
    const isRandom = config.isRandom || false; // Случайный процент
    const minPercent = config.minPercent || 0; // Минимальный процент для случайного диапазона
    const maxPercent = config.maxPercent || 0; // Максимальный процент для случайного диапазона
    
    // Настройки задержки из конфигурации коллектора
    const delayMinMs = config.delayMinMs || 30000; // Минимальная задержка между транзакциями
    const delayMaxMs = config.delayMaxMs || 60000; // Максимальная задержка между транзакциями
    const walletDelayMinMs = config.walletDelayMinMs || 120000; // Минимальная задержка между кошельками
    const walletDelayMaxMs = config.walletDelayMaxMs || 300000; // Максимальная задержка между кошельками
    
    // Определяем сети для сбора
    let networksToCollect = [];
    
    if (Array.isArray(config.selectedNetworks) && config.selectedNetworks.length > 0) {
      // Собираем из выбранных пользователем сетей
      networksToCollect = config.selectedNetworks;
      console.log(`🌐 Выбрано ${networksToCollect.length} сетей для сбора`);
    } else {
      // Нет выбранных сетей - завершаем работу
      console.log(`❌ Не выбраны сети для сбора`);
      return;
    }
    
    console.log(`⚙️ Настройки сбора:`);
    if (isRandom) {
      console.log(`   📊 Случайный процент: ${minPercent}% - ${maxPercent}%`);
    } else {
      console.log(`   📊 Фиксированный процент: ${transferPercent}%`);
    }
    console.log(`   🌐 Сети для сбора: ${networksToCollect.map(network => network.toUpperCase()).join(', ')}`);
    console.log(`   ⛽ Динамическая оценка газа: включена`);
    console.log(`   ⏱️ Задержка между транзакциями: ${delayMinMs/1000}-${delayMaxMs/1000} сек`);
    console.log(`   ⏱️ Задержка между кошельками: ${walletDelayMinMs/1000}-${walletDelayMaxMs/1000} сек\n`);
    
    // Обрабатываем каждый кошелек
    for (let i = 0; i < privateKeys.length; i++) {
      try {
        const privateKey = privateKeys[i];
        const subAccountAddress = subAccounts[i];
        
        // Создаем кошелек
        const wallet = new ethers.Wallet(privateKey);
        console.log(`🔑 Кошелек ${i + 1}/${privateKeys.length}: ${wallet.address}`);
        console.log(`📥 Субакаунт: ${subAccountAddress}`);
        
        // Проверяем баланс в каждой выбранной сети
        for (const targetChain of networksToCollect) {
          try {
            console.log(`\n🌐 Проверяем сеть: ${targetChain.toUpperCase()}`);
            
            // Получаем chainId для выбранной сети
            const chainId = chainMapper.getChainId(targetChain);
            if (!chainId) {
              console.log(`   ❌ Неподдерживаемая сеть: ${targetChain}`);
              continue;
            }
            
            // Получаем информацию о нативном токене
            const tokenInfo = getNativeTokenInfo(targetChain);
            const tokenSymbol = tokenInfo ? tokenInfo.symbol : 'ETH';
            
            // Получаем баланс нативного токена в выбранной сети
            const balance = await getEthBalance(wallet, chainId);
            const balanceFormatted = ethers.formatEther(balance);
            
            console.log(`💰 Баланс ${tokenSymbol} в ${targetChain.toUpperCase()}: ${balanceFormatted}`);
            
            if (balance === 0n) {
              console.log(`   ⚠️ Нулевой баланс, пропускаем`);
              continue;
            }
            
            // Рассчитываем сумму для перевода
            let transferAmount = calculateTransferAmount(balance, transferPercent, isRandom, minPercent, maxPercent);
            
            // Специальная обработка для 100% перевода
            if (transferAmount === 'MAX') {
              console.log(`💸 Перевод 100% баланса (99.9% для гарантии успешной транзакции)`);
              // Для 100% перевода используем 99.9% баланса, оставляя 0.1% для комиссии
              transferAmount = calculateMaxTransferAmount(balance);
            } else {
              const transferAmountFormatted = ethers.formatEther(transferAmount);
              console.log(`💸 Сумма для перевода: ${transferAmountFormatted} ${tokenSymbol} в ${targetChain.toUpperCase()}`);
            }
            
            if (transferAmount === 0n) {
              console.log(`   ⚠️ Сумма перевода равна 0, пропускаем`);
              continue;
            }
            
            // Выполняем перевод с пользовательскими настройками задержки
            const success = await transferEthToSubAccount(wallet, chainId, subAccountAddress, transferAmount, targetChain, true, delayMinMs, delayMaxMs);
            
            if (success) {
              console.log(`   ✅ Перевод в ${targetChain.toUpperCase()} выполнен успешно`);
              
              // Отправляем лог об успешном переводе в UI
              if (global.broadcastLog) {
                global.broadcastLog(`✅ Перевод в ${targetChain.toUpperCase()} выполнен успешно`, 'success');
              }
            } else {
              console.log(`   ❌ Ошибка при переводе в ${targetChain.toUpperCase()}`);
              
              // Отправляем лог об ошибке перевода в UI
              if (global.broadcastLog) {
                global.broadcastLog(`❌ Ошибка при переводе в ${targetChain.toUpperCase()}`, 'error');
              }
            }
            
          } catch (error) {
            console.error(`   ❌ Ошибка обработки сети ${targetChain}: ${error.message}`);
          }
        }
        
        console.log(`\n✅ Обработка кошелька ${i + 1} завершена\n`);
        
        // Отправляем лог о завершении обработки кошелька в UI
        if (global.broadcastLog) {
          global.broadcastLog(`✅ Обработка кошелька ${i + 1} завершена`, 'success');
        }
        
        // Задержка между кошельками (если это не последний кошелек)
        if (i < privateKeys.length - 1) {
          const walletDelay = Math.floor(Math.random() * (walletDelayMaxMs - walletDelayMinMs + 1)) + walletDelayMinMs;
          console.log(`⏱️ Задержка между кошельками: ${walletDelay/1000} сек`);
          
          // Отправляем лог о задержке между кошельками в UI
          if (global.broadcastLog) {
            global.broadcastLog(`⏱️ Задержка между кошельками: ${walletDelay/1000} сек`, 'info');
          }
          
          await new Promise(resolve => setTimeout(resolve, walletDelay));
        }
        
      } catch (error) {
        console.error(`❌ Ошибка обработки кошелька ${i + 1}: ${error.message}\n`);
      }
    }
    
    console.log('🎉 Сбор нативных токенов на субакаунты завершен');
    
    // Отправляем лог о завершении сбора в UI
    if (global.broadcastLog) {
      global.broadcastLog('🎉 Сбор нативных токенов на субакаунты завершен', 'success');
    }
    
  } catch (error) {
    console.error(`❌ Критическая ошибка: ${error.message}`);
    
    // Отправляем лог об ошибке в UI
    if (global.broadcastLog) {
      global.broadcastLog(`❌ Критическая ошибка: ${error.message}`, 'error');
    }
  }
}

module.exports = {
  collectEthToSubAccounts,
  readSubAccounts,
  readPrivateKeys,
  getEthBalance,
  calculateTransferAmount,
  calculateMaxTransferAmount,
  transferEthToSubAccount
}; 