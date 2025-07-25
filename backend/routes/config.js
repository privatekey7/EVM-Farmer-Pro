const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();

// Конфигурация в памяти
let memoryConfig = null;

// Настройки по умолчанию
const DEFAULT_CONFIG = {
  collection: {
    mode: 'collect_to_target',
    targetNetwork: 'base'
  },
  excludedNetworks: [],
  transaction: {
    delayMinMs: 60000,
    delayMaxMs: 120000,
    walletDelayMinMs: 120000,
    walletDelayMaxMs: 300000
  }
};

// Валидация конфигурации
const validateConfig = (config) => {
  const errors = [];
  
  // Проверяем структуру collection
  if (!config.collection || typeof config.collection !== 'object') {
    errors.push('Отсутствует секция collection');
  } else {
    const { mode, targetNetwork } = config.collection;
    
    // Проверяем режим
    if (!['collect_to_target', 'swap_to_native'].includes(mode)) {
      errors.push('Неверный режим работы (должен быть collect_to_target или swap_to_native)');
    }
    
      // Проверяем целевую сеть
  if (mode === 'collect_to_target') {
    const targetNetworks = config.collection?.targetNetworks || [];
    if (targetNetworks.length === 0 && !targetNetwork) {
      errors.push('Для режима collect_to_target требуется указать targetNetwork или targetNetworks');
    }
  }
  }
  
  // Проверяем исключенные сети
  if (config.excludedNetworks && !Array.isArray(config.excludedNetworks)) {
    errors.push('excludedNetworks должен быть массивом');
  }
  
  // Проверяем настройки транзакций
  if (config.transaction) {
    const { delayMinMs, delayMaxMs, walletDelayMinMs, walletDelayMaxMs } = config.transaction;
    
    if (delayMinMs !== undefined && (typeof delayMinMs !== 'number' || delayMinMs < 0)) {
      errors.push('delayMinMs должен быть положительным числом');
    }
    if (delayMaxMs !== undefined && (typeof delayMaxMs !== 'number' || delayMaxMs < 0)) {
      errors.push('delayMaxMs должен быть положительным числом');
    }
    if (delayMinMs !== undefined && delayMaxMs !== undefined && delayMinMs > delayMaxMs) {
      errors.push('Минимальная задержка транзакций не может быть больше максимальной');
    }
    
    if (walletDelayMinMs !== undefined && (typeof walletDelayMinMs !== 'number' || walletDelayMinMs < 0)) {
      errors.push('walletDelayMinMs должен быть положительным числом');
    }
    if (walletDelayMaxMs !== undefined && (typeof walletDelayMaxMs !== 'number' || walletDelayMaxMs < 0)) {
      errors.push('walletDelayMaxMs должен быть положительным числом');
    }
    if (walletDelayMinMs !== undefined && walletDelayMaxMs !== undefined && walletDelayMinMs > walletDelayMaxMs) {
      errors.push('Минимальная задержка кошельков не может быть больше максимальной');
    }
  }
  
  return errors;
};

// GET /api/config - получить текущую конфигурацию
router.get('/', async (req, res) => {
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
    console.error('Ошибка чтения конфигурации:', error);
    res.status(500).json({ 
      error: 'Ошибка чтения конфигурации',
      details: error.message 
    });
  }
});

// POST /api/config - сохранить конфигурацию
router.post('/', async (req, res) => {
  try {
    const newConfig = req.body;

    
    // Валидируем конфигурацию
    const validationErrors = validateConfig(newConfig);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Ошибки валидации конфигурации',
        details: validationErrors
      });
    }
    
    // Сохраняем конфигурацию в памяти
    memoryConfig = { ...newConfig };
    console.log('💾 Конфигурация сохранена в память:', {
      mode: memoryConfig.collection?.mode,
      targetNetworks: memoryConfig.collection?.targetNetworks,
      targetNetwork: memoryConfig.collection?.targetNetwork // Для обратной совместимости
    });
    
    // Отправляем лог через WebSocket
    if (global.broadcastLog) {
      global.broadcastLog('✅ Конфигурация успешно сохранена', 'success');
    }
    
    res.json({
      success: true,
      message: 'Конфигурация успешно сохранена',
      config: newConfig
    });
    
  } catch (error) {
    console.error('Ошибка сохранения конфигурации:', error);
    
    if (global.broadcastLog) {
      global.broadcastLog(`❌ Ошибка сохранения конфигурации: ${error.message}`, 'error');
    }
    
    res.status(500).json({ 
      error: 'Ошибка сохранения конфигурации',
      details: error.message 
    });
  }
});


// GET /api/config/validate - валидация конфигурации без сохранения
router.post('/validate', (req, res) => {
  try {
    const config = req.body;
    const errors = validateConfig(config);
    
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

// DELETE /api/config - сбросить конфигурацию к значениям по умолчанию
router.delete('/', async (req, res) => {
  try {
    // Сбрасываем конфигурацию в памяти
    memoryConfig = null;
    
    console.log('🔄 Конфигурация сброшена к значениям по умолчанию');
    
    // Отправляем лог через WebSocket
    if (global.broadcastLog) {
      global.broadcastLog('🔄 Конфигурация сброшена к значениям по умолчанию', 'info');
    }
    
    res.json({
      success: true,
      message: 'Конфигурация сброшена к значениям по умолчанию',
      config: DEFAULT_CONFIG
    });
    
  } catch (error) {
    console.error('Ошибка сброса конфигурации:', error);
    res.status(500).json({ 
      error: 'Ошибка сброса конфигурации',
      details: error.message 
    });
  }
});

// Функция для получения текущей конфигурации (для использования в других модулях)
const getCurrentConfig = () => {
  const config = memoryConfig || DEFAULT_CONFIG;
  return config;
};

module.exports = { router, getCurrentConfig }; 