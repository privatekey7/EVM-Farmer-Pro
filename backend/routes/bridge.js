const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { ethers } = require('ethers');
const { getCurrentConfig } = require('./config');
const router = express.Router();

// Импорт существующего автобриджера
const bridgeExecutor = require('../../src/bridge_executor');
const { checkBalance } = require('../../src/debank_balance_checker');
const puppeteer = require('puppeteer');
const { walletDelay } = require('../../utils/delay');

// Флаг для отслеживания состояния выполнения
let isRunning = false;
let currentProcess = null;

// Функция для получения балансов одного кошелька
const getTokenBalancesForAddress = async (address) => {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const balances = await checkBalance(address, browser);
    return balances;
  } catch (error) {
    console.error('Ошибка получения балансов:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

// Функция для чтения приватных ключей
const readPrivateKeys = async () => {
  const KEYS_PATH = path.join(__dirname, '../../keys.txt');
  
  try {
    const content = await fs.readFile(KEYS_PATH, 'utf8');
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    
    const wallets = [];
    for (const privateKey of lines) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        wallets.push({
          address: wallet.address,
          privateKey: privateKey
        });
      } catch (error) {
        // Пропускаем невалидные ключи
      }
    }
    
    return wallets;
  } catch (error) {
    throw new Error(`Ошибка чтения keys.txt: ${error.message}`);
  }
};

// GET /api/bridge/status - получить текущий статус автобриджера
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: global.bridgeStatus
  });
});

// POST /api/bridge/start - запустить автобриджер
router.post('/start', async (req, res) => {
  try {
    // Проверяем, не запущен ли уже процесс
    if (isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Автобриджер уже выполняется'
      });
    }
    
    // Проверяем наличие кошельков
    const wallets = await readPrivateKeys();
    if (wallets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Не найдено валидных кошельков в keys.txt'
      });
    }
    
    // Получаем актуальную конфигурацию из памяти
    const config = getCurrentConfig();
    
    // Устанавливаем состояние "запущен"
    isRunning = true;
    
    // Обновляем глобальный статус
    global.updateStatus({
      isRunning: true,
      startTime: new Date().toISOString(),
      currentWallet: null,
      currentNetwork: null,
      progress: { completed: 0, total: wallets.length },
      stats: { successful: 0, failed: 0 }
    });
    
    // Определяем режим работы из конфигурации
    let modeText = 'Автобриджер';
    
    if (config.collection?.mode === 'collect_to_target') {
      modeText = 'Собрать всё в одну сеть';
    } else if (config.collection?.mode === 'swap_to_native') {
      modeText = 'Свапы в нативку';
    }
    
    global.broadcastLog(`🚀 ${modeText}`, 'info');
    global.broadcastLog(`💼 Найдено ${wallets.length} кошельков для обработки`, 'info');
    
    res.json({
      success: true,
      message: 'Автобриджер запущен',
      wallets: wallets.length
    });
    
    // Запускаем выполнение в фоне
    runBridgeProcess(wallets, config);
    
  } catch (error) {
    console.error('Ошибка запуска автобриджера:', error);
    isRunning = false;
    
    global.updateStatus({
      isRunning: false
    });
    
    global.broadcastLog(`❌ Ошибка запуска: ${error.message}`, 'error');
    
    res.status(500).json({
      success: false,
      error: 'Ошибка запуска автобриджера',
      details: error.message
    });
  }
});

// POST /api/bridge/stop - остановить автобриджер
router.post('/stop', (req, res) => {
  try {
    if (!isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Автобриджер не запущен'
      });
    }
    
    // Устанавливаем флаг остановки
    isRunning = false;
    
    global.updateStatus({
      isRunning: false
    });
    
    global.broadcastLog('⏹️ Получен сигнал остановки автобриджера', 'warning');
    
    res.json({
      success: true,
      message: 'Сигнал остановки отправлен'
    });
    
  } catch (error) {
    console.error('Ошибка остановки автобриджера:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка остановки автобриджера',
      details: error.message
    });
  }
});

// Основная функция выполнения автобриджера
const runBridgeProcess = async (wallets, config) => {
  try {
    
    for (let i = 0; i < wallets.length; i++) {
      // Проверяем флаг остановки
      if (!isRunning) {
        global.broadcastLog('⏹️ Автобриджер остановлен пользователем', 'warning');
        break;
      }
      
      const wallet = wallets[i];
      
      // Обновляем статус текущего кошелька
      global.updateStatus({
        currentWallet: wallet.address,
        currentNetwork: null,
        progress: { completed: i, total: wallets.length }
      });
      
      global.broadcastLog(`🔄 Кошелек ${i + 1}/${wallets.length}: ${wallet.address}`, 'info');
      
      try {
        // Получаем балансы кошелька
        global.broadcastLog('📊 Получение балансов...', 'info');
        const balances = await getTokenBalancesForAddress(wallet.address);
        
        if (!balances || balances.length === 0) {
          global.broadcastLog('⚠️ Балансы не найдены или кошелек пуст', 'warning');
          global.bridgeStatus.stats.failed++;
          continue;
        }
        
        global.broadcastLog('✅ Балансы получены', 'success');
        
        // Подготавливаем данные кошелька для автобриджера
        const walletData = {
          address: wallet.address,
          privateKey: wallet.privateKey,
          balances: balances
        };
        
        global.broadcastLog('🌉 Запуск автобриджера...', 'info');
        
        // Устанавливаем глобальный флаг для bridge_executor
        global.shouldStop = () => !isRunning;
        
        // Устанавливаем глобальную функцию для получения конфигурации
        global.getConfig = () => config;
        
        // Запускаем автобриджер для текущего кошелька
        await bridgeExecutor.main([walletData]);
        
        global.broadcastLog(`✅ Кошелек ${wallet.address} обработан`, 'success');
        global.bridgeStatus.stats.successful++;
        
      } catch (error) {
        console.error(`Ошибка обработки кошелька ${wallet.address}:`, error);
        global.broadcastLog(`❌ Ошибка обработки кошелька: ${error.message}`, 'error');
        global.bridgeStatus.stats.failed++;
      }
      
      // Обновляем прогресс
      global.updateStatus({
        progress: { completed: i + 1, total: wallets.length }
      });
      
      // Пауза между кошельками
      if (i < wallets.length - 1 && isRunning) {
        await walletDelay();
      }
    }
    
    // Завершение процесса
    isRunning = false;
    
    const completedWallets = global.bridgeStatus.progress.completed;
    const successfulOps = global.bridgeStatus.stats.successful;
    const failedOps = global.bridgeStatus.stats.failed;
    
    global.updateStatus({
      isRunning: false,
      currentWallet: null,
      currentNetwork: null
    });
    
    global.broadcastLog('🎉 Автобриджер завершен', 'success');
    global.broadcastLog(`📊 Статистика: ${completedWallets} кошельков, ${successfulOps} успешно, ${failedOps} ошибок`, 'info');
    
    // Очищаем глобальные функции
    global.shouldStop = null;
    global.getConfig = null;
    
  } catch (error) {
    console.error('Критическая ошибка автобриджера:', error);
    isRunning = false;
    
    global.updateStatus({
      isRunning: false,
      currentWallet: null,
      currentNetwork: null
    });
    
    global.broadcastLog(`💥 Критическая ошибка: ${error.message}`, 'error');
    
    // Очищаем глобальные функции
    global.shouldStop = null;
    global.getConfig = null;
  }
};

// GET /api/bridge/logs - получить логи (альтернатива WebSocket)
router.get('/logs', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  
  const logs = global.bridgeStatus.logs || [];
  const startIndex = Math.max(0, logs.length - offset - limit);
  const endIndex = logs.length - offset;
  
  res.json({
    success: true,
    logs: logs.slice(startIndex, endIndex),
    total: logs.length,
    offset: parseInt(offset),
    limit: parseInt(limit)
  });
});

// POST /api/bridge/test - тестовый запуск для одного кошелька
router.post('/test', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Требуется указать адрес кошелька'
      });
    }
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат адреса'
      });
    }
    
    // Проверяем, не запущен ли уже процесс
    if (isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Автобриджер уже выполняется'
      });
    }
    
    // Ищем кошелек в keys.txt
    const wallets = await readPrivateKeys();
    const targetWallet = wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (!targetWallet) {
      return res.status(404).json({
        success: false,
        error: 'Кошелек не найден в keys.txt'
      });
    }
    
    global.broadcastLog(`🧪 Тестовый запуск для кошелька ${address}`, 'info');
    
    res.json({
      success: true,
      message: 'Тестовый запуск начат',
      wallet: address
    });
    
    // Запускаем тестовый процесс
    runBridgeProcess([targetWallet]);
    
  } catch (error) {
    console.error('Ошибка тестового запуска:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка тестового запуска',
      details: error.message
    });
  }
});

// GET /api/bridge/history - история выполнений (заглушка для будущего расширения)
router.get('/history', (req, res) => {
  res.json({
    success: true,
    history: [],
    message: 'История выполнений пока не реализована'
  });
});

module.exports = router; 