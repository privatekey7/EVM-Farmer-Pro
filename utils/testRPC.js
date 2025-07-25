const { ethers } = require('ethers');
const rpcConfig = require('./RPC.json');
const fallbackRpcConfig = require('./fallbackRPC.json');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Функция для логирования с цветами
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Функция для тестирования одного RPC
async function testRPC(chainId, chainName, rpcUrl, isMain = false) {
  const rpcType = isMain ? 'ОСНОВНОЙ' : 'FALLBACK';
  
  try {
    log(`   📡 Тестирование ${rpcType} RPC: ${rpcUrl}`, 'cyan');
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Проверяем подключение с таймаутом
    const networkPromise = provider.getNetwork();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout (5s)')), 5000)
    );
    
    const network = await Promise.race([networkPromise, timeoutPromise]);
    
    // Проверяем, что chainId совпадает
    if (network.chainId === BigInt(chainId)) {
      log(`   ✅ ${rpcType} RPC РАБОТАЕТ - Chain: ${network.name} (${network.chainId})`, 'green');
      return { success: true, network: network.name, chainId: network.chainId };
    } else {
      log(`   ⚠️  ${rpcType} RPC НЕПРАВИЛЬНЫЙ CHAIN_ID - Ожидался: ${chainId}, Получен: ${network.chainId}`, 'yellow');
      return { success: false, error: 'Wrong chain ID' };
    }
    
  } catch (error) {
    log(`   ❌ ${rpcType} RPC НЕ РАБОТАЕТ - ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

// Функция для тестирования всех RPC для одной сети
async function testChainRPCs(chainId, chainName) {
  log(`\n🌐 Тестирование сети: ${chainName.toUpperCase()} (Chain ID: ${chainId})`, 'bright');
  
  const results = {
    chainId,
    chainName,
    mainRpc: null,
    fallbackRpcs: [],
    workingRpc: null
  };
  
  // Находим основной RPC
  const mainRpcConfig = rpcConfig.rpc.find(item => item.chainId === chainId);
  if (mainRpcConfig) {
    log(`\n📡 Основной RPC:`, 'blue');
    const mainResult = await testRPC(chainId, chainName, mainRpcConfig.httpRpcUrl, true);
    results.mainRpc = {
      url: mainRpcConfig.httpRpcUrl,
      ...mainResult
    };
    
    if (mainResult.success) {
      results.workingRpc = mainRpcConfig.httpRpcUrl;
    }
  } else {
    log(`\n❌ Основной RPC не найден в конфигурации`, 'red');
  }
  
  // Находим fallback RPC
  const fallbackConfig = fallbackRpcConfig.fallbackRPC.find(item => item.chainId === chainId);
  if (fallbackConfig && fallbackConfig.fallbackUrls) {
    log(`\n🔄 Fallback RPC (${fallbackConfig.fallbackUrls.length}):`, 'blue');
    
    for (let i = 0; i < fallbackConfig.fallbackUrls.length; i++) {
      const fallbackUrl = fallbackConfig.fallbackUrls[i];
      const fallbackResult = await testRPC(chainId, chainName, fallbackUrl, false);
      
      results.fallbackRpcs.push({
        url: fallbackUrl,
        ...fallbackResult
      });
      
      // Если еще нет рабочего RPC и этот работает
      if (!results.workingRpc && fallbackResult.success) {
        results.workingRpc = fallbackUrl;
      }
      
      // Небольшая задержка между тестами
      if (i < fallbackConfig.fallbackUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } else {
    log(`\n⚠️  Fallback RPC не найдены в конфигурации`, 'yellow');
  }
  
  // Итоговый результат для сети
  if (results.workingRpc) {
    log(`\n✅ ${chainName.toUpperCase()}: ЕСТЬ РАБОЧИЙ RPC`, 'green');
  } else {
    log(`\n❌ ${chainName.toUpperCase()}: НЕТ РАБОЧИХ RPC`, 'red');
  }
  
  return results;
}

// Функция для получения статистики
function getStatistics(allResults) {
  const stats = {
    totalChains: allResults.length,
    chainsWithWorkingRpc: 0,
    chainsWithOnlyMainRpc: 0,
    chainsWithOnlyFallbackRpc: 0,
    chainsWithNoRpc: 0,
    totalMainRpcs: 0,
    workingMainRpcs: 0,
    totalFallbackRpcs: 0,
    workingFallbackRpcs: 0
  };
  
  allResults.forEach(result => {
    // Подсчет основных RPC
    if (result.mainRpc) {
      stats.totalMainRpcs++;
      if (result.mainRpc.success) {
        stats.workingMainRpcs++;
      }
    }
    
    // Подсчет fallback RPC
    stats.totalFallbackRpcs += result.fallbackRpcs.length;
    result.fallbackRpcs.forEach(fallback => {
      if (fallback.success) {
        stats.workingFallbackRpcs++;
      }
    });
    
    // Подсчет сетей
    if (result.workingRpc) {
      stats.chainsWithWorkingRpc++;
      
      if (result.mainRpc && result.mainRpc.success) {
        stats.chainsWithOnlyMainRpc++;
      } else if (result.fallbackRpcs.some(f => f.success)) {
        stats.chainsWithOnlyFallbackRpc++;
      }
    } else {
      stats.chainsWithNoRpc++;
    }
  });
  
  return stats;
}

// Основная функция
async function main() {
  log('🚀 Запуск тестирования RPC для всех сетей...', 'bright');
  log('⏱️  Время начала:', new Date().toLocaleString(), 'cyan');
  
  // Получаем все уникальные chainId из обеих конфигураций
  const allChainIds = new Set();
  
  // Добавляем chainId из основного RPC
  rpcConfig.rpc.forEach(item => allChainIds.add(item.chainId));
  
  // Добавляем chainId из fallback RPC
  fallbackRpcConfig.fallbackRPC.forEach(item => allChainIds.add(item.chainId));
  
  const sortedChainIds = Array.from(allChainIds).sort((a, b) => a - b);
  
  log(`\n📊 Найдено ${sortedChainIds.length} уникальных сетей для тестирования`, 'bright');
  
  const allResults = [];
  
  // Тестируем каждую сеть
  for (let i = 0; i < sortedChainIds.length; i++) {
    const chainId = sortedChainIds[i];
    
    // Получаем имя сети
    const mainRpcConfig = rpcConfig.rpc.find(item => item.chainId === chainId);
    const fallbackConfig = fallbackRpcConfig.fallbackRPC.find(item => item.chainId === chainId);
    
    const chainName = mainRpcConfig?.name || fallbackConfig?.name || `Chain_${chainId}`;
    
    log(`\n${'='.repeat(60)}`, 'magenta');
    log(`Тест ${i + 1}/${sortedChainIds.length}`, 'bright');
    
    const result = await testChainRPCs(chainId, chainName);
    allResults.push(result);
    
    // Небольшая задержка между сетями
    if (i < sortedChainIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Выводим итоговую статистику
  log(`\n${'='.repeat(60)}`, 'magenta');
  log('📈 ИТОГОВАЯ СТАТИСТИКА', 'bright');
  log(`${'='.repeat(60)}`, 'magenta');
  
  const stats = getStatistics(allResults);
  
  log(`\n🌐 Общая статистика:`, 'blue');
  log(`   Всего сетей: ${stats.totalChains}`, 'cyan');
  log(`   Сетей с рабочими RPC: ${stats.chainsWithWorkingRpc}`, 'green');
  log(`   Сетей без рабочих RPC: ${stats.chainsWithNoRpc}`, 'red');
  
  log(`\n📡 Основные RPC:`, 'blue');
  log(`   Всего: ${stats.totalMainRpcs}`, 'cyan');
  log(`   Работающих: ${stats.workingMainRpcs}`, 'green');
  log(`   Процент работающих: ${stats.totalMainRpcs > 0 ? ((stats.workingMainRpcs / stats.totalMainRpcs) * 100).toFixed(1) : 0}%`, 'cyan');
  
  log(`\n🔄 Fallback RPC:`, 'blue');
  log(`   Всего: ${stats.totalFallbackRpcs}`, 'cyan');
  log(`   Работающих: ${stats.workingFallbackRpcs}`, 'green');
  log(`   Процент работающих: ${stats.totalFallbackRpcs > 0 ? ((stats.workingFallbackRpcs / stats.totalFallbackRpcs) * 100).toFixed(1) : 0}%`, 'cyan');
  
  // Выводим проблемные сети
  const problematicChains = allResults.filter(result => !result.workingRpc);
  if (problematicChains.length > 0) {
    log(`\n❌ ПРОБЛЕМНЫЕ СЕТИ (нет рабочих RPC):`, 'red');
    problematicChains.forEach(result => {
      log(`   ${result.chainName.toUpperCase()} (Chain ID: ${result.chainId})`, 'red');
    });
  }
  
  // Выводим сети только с fallback RPC
  const fallbackOnlyChains = allResults.filter(result => 
    result.workingRpc && 
    (!result.mainRpc || !result.mainRpc.success) && 
    result.fallbackRpcs.some(f => f.success)
  );
  
  if (fallbackOnlyChains.length > 0) {
    log(`\n⚠️  СЕТИ ТОЛЬКО С FALLBACK RPC:`, 'yellow');
    fallbackOnlyChains.forEach(result => {
      const workingFallbacks = result.fallbackRpcs.filter(f => f.success);
      log(`   ${result.chainName.toUpperCase()}: ${workingFallbacks.length} fallback RPC`, 'yellow');
    });
  }
  
  log(`\n⏱️  Время завершения:`, new Date().toLocaleString(), 'cyan');
  log('✅ Тестирование завершено!', 'bright');
}

// Запускаем тестирование
main().catch(error => {
  log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
  process.exit(1);
}); 