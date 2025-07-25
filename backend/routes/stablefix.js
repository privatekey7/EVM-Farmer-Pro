const express = require('express');
const router = express.Router();

// Конфигурация стейблкойнов для разных сетей
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

// Конфигурация в памяти (как в других модулях)
let memoryConfig = null;

// Настройки по умолчанию
const DEFAULT_CONFIG = {
  percentage: 99, // Процент от ETH для свапа
  targetStablecoin: 'random', // 'usdt', 'usdc', 'random'
  networks: ['optimism', 'arbitrum', 'base'],
  excludedNetworks: []
};

// Получить конфигурацию StableFix
router.get('/config', async (req, res) => {
  try {
    // Используем конфигурацию из памяти или настройки по умолчанию
    const config = memoryConfig || DEFAULT_CONFIG;
    
    // Формируем метаданные
    const metadata = {
      source: memoryConfig ? 'memory' : 'default',
      lastModified: new Date().toISOString()
    };
    
    res.json({
      success: true,
      config,
      metadata
    });
    
  } catch (error) {
    console.error('Ошибка получения конфигурации StableFix:', error);
    res.status(500).json({ error: 'Ошибка получения конфигурации' });
  }
});

// Сохранить конфигурацию StableFix
router.post('/config', async (req, res) => {
  try {
    const config = req.body;
    
    // Валидация конфигурации
    const errors = validateStableFixConfig(config);
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false,
        errors 
      });
    }

    // Сохраняем в память (как в других модулях)
    memoryConfig = { ...config };
    
    // Также сохраняем в глобальную конфигурацию для исполнителя
    if (typeof global !== 'undefined') {
      global.stableFixConfig = memoryConfig;
    }

    res.json({ 
      success: true, 
      message: 'Конфигурация StableFix сохранена',
      config: memoryConfig
    });
    
  } catch (error) {
    console.error('Ошибка сохранения конфигурации StableFix:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка сохранения конфигурации' 
    });
  }
});

// Запустить StableFix
router.post('/start', async (req, res) => {
  try {
    // Получаем конфигурацию из памяти или настройки по умолчанию
    const config = memoryConfig || DEFAULT_CONFIG;
    
    // Автоматически включаем модуль при запуске
    const configWithEnabled = { ...config, enabled: true };
    memoryConfig = configWithEnabled;
    
    if (typeof global !== 'undefined') {
      global.stableFixConfig = configWithEnabled;
      
      // Сбрасываем флаг остановки
      global.shouldStopStableFix = () => false;
    }

    // Обновляем глобальный статус
    if (typeof global !== 'undefined') {
      global.bridgeStatus = {
        isRunning: true,
        startTime: new Date().toISOString(),
        progress: { completed: 0, total: 0 },
        stats: { successful: 0, failed: 0 }
      };
      
      global.updateStatus?.(global.bridgeStatus);
    }

    // Запускаем процесс в фоне
    const stableFixExecutor = require('../../src/stablefix_executor');
    stableFixExecutor.main().catch(error => {
      console.error('Ошибка выполнения StableFix:', error);
      if (typeof global !== 'undefined' && global.bridgeStatus) {
        global.bridgeStatus.isRunning = false;
        global.updateStatus?.(global.bridgeStatus);
      }
    });

    res.json({ success: true, message: 'StableFix запущен' });
  } catch (error) {
    console.error('Ошибка запуска StableFix:', error);
    res.status(500).json({ error: 'Ошибка запуска StableFix' });
  }
});

// Остановить StableFix
router.post('/stop', async (req, res) => {
  try {
    if (typeof global !== 'undefined') {
      // Устанавливаем функцию для проверки остановки
      global.shouldStopStableFix = () => true;
      
      if (global.bridgeStatus) {
        global.bridgeStatus.isRunning = false;
        global.updateStatus?.(global.bridgeStatus);
      }
    }

    res.json({ success: true, message: 'StableFix остановлен' });
  } catch (error) {
    console.error('Ошибка остановки StableFix:', error);
    res.status(500).json({ error: 'Ошибка остановки StableFix' });
  }
});

// Получить статус StableFix
router.get('/status', async (req, res) => {
  try {
    const status = typeof global !== 'undefined' ? global.bridgeStatus : {
      isRunning: false,
      startTime: null,
      progress: { completed: 0, total: 0 },
      stats: { successful: 0, failed: 0 }
    };

    res.json({ status });
  } catch (error) {
    console.error('Ошибка получения статуса StableFix:', error);
    res.status(500).json({ error: 'Ошибка получения статуса' });
  }
});

// Получить доступные стейблкойны для сетей
router.get('/stablecoins', async (req, res) => {
  try {
    res.json({ stablecoins: STABLECOIN_CONFIG });
  } catch (error) {
    console.error('Ошибка получения стейблкойнов:', error);
    res.status(500).json({ error: 'Ошибка получения стейблкойнов' });
  }
});

// Валидация конфигурации StableFix без сохранения
router.post('/config/validate', async (req, res) => {
  try {
    const config = req.body;
    const errors = validateStableFixConfig(config);
    
    res.json({
      success: true,
      valid: errors.length === 0,
      errors
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      valid: false,
      errors: [`Ошибка парсинга: ${error.message}`]
    });
  }
});

// Сбросить конфигурацию StableFix к значениям по умолчанию
router.delete('/config', async (req, res) => {
  try {
    // Сбрасываем конфигурацию в памяти к значениям по умолчанию
    memoryConfig = null;
    
    // Также очищаем глобальную конфигурацию
    if (typeof global !== 'undefined') {
      global.stableFixConfig = null;
    }

    res.json({ 
      success: true, 
      message: 'Конфигурация StableFix сброшена к значениям по умолчанию',
      config: DEFAULT_CONFIG
    });
    
  } catch (error) {
    console.error('Ошибка сброса конфигурации StableFix:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка сброса конфигурации' 
    });
  }
});

// Валидация конфигурации StableFix
function validateStableFixConfig(config) {
  const errors = [];

  if (typeof config.percentage !== 'number' || config.percentage < 1 || config.percentage > 99) {
    errors.push('Процент должен быть числом от 1 до 99');
  }

  if (!config.targetStablecoin) {
    errors.push('Выберите целевой стейблкойн');
  } else if (!['usdt', 'usdc', 'random'].includes(config.targetStablecoin)) {
    errors.push('Неподдерживаемый тип стейблкойна');
  }

  if (!Array.isArray(config.networks) || config.networks.length === 0) {
    errors.push('Выберите хотя бы одну сеть для обработки');
  }

  const validNetworks = ['optimism', 'arbitrum', 'base'];
  if (config.networks) {
    for (const network of config.networks) {
      if (!validNetworks.includes(network)) {
        errors.push(`Неподдерживаемая сеть: ${network}`);
      }
    }
  }

  // Проверка совместимости стейблкойна с выбранными сетями
  if (config.targetStablecoin && config.networks && config.networks.length > 0) {
    const targetStablecoin = config.targetStablecoin;
    
    // Если выбран конкретный стейблкойн (не random), проверяем совместимость
    if (targetStablecoin !== 'random') {
      for (const network of config.networks) {
        const networkStablecoins = STABLECOIN_CONFIG[network];
        if (!networkStablecoins || !networkStablecoins[targetStablecoin]) {
          const supportedStablecoins = networkStablecoins ? Object.keys(networkStablecoins).join(', ') : 'нет';
          errors.push(`Сеть ${network} не поддерживает ${targetStablecoin.toUpperCase()}. Поддерживаемые стейблкойны: ${supportedStablecoins}`);
        }
      }
    }
  }

  return errors;
}

module.exports = router; 