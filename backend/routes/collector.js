const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { collectEthToSubAccounts } = require('../../src/eth_collector.js');

// Глобальная переменная для отслеживания статуса сбора
let isCollecting = false;

// Путь к файлу с субаккаунтами
const SUB_ACCOUNTS_PATH = path.join(__dirname, '../../sub_accs.txt');

// Функция для чтения субаккаунтов
const readSubAccounts = async () => {
  try {
    const exists = await fs.pathExists(SUB_ACCOUNTS_PATH);
    if (!exists) {
      return { success: false, error: 'Файл sub_accs.txt не найден' };
    }
    
    const content = await fs.readFile(SUB_ACCOUNTS_PATH, 'utf8');
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')); // Игнорируем комментарии
    
    if (lines.length === 0) {
      return { 
        success: true, 
        subAccounts: [],
        totalAccounts: 0,
        invalidAccounts: [],
        totalLines: 0,
        fileInfo: {
          path: SUB_ACCOUNTS_PATH,
          exists: true,
          lastModified: (await fs.stat(SUB_ACCOUNTS_PATH)).mtime
        }
      };
    }
    
    // Проверяем корректность адресов
    const { ethers } = require('ethers');
    const validAccounts = [];
    const invalidAccounts = [];
    
    for (let i = 0; i < lines.length; i++) {
      const address = lines[i];
      try {
        if (ethers.isAddress(address)) {
          validAccounts.push(address.toLowerCase());
        } else {
          invalidAccounts.push({
            line: i + 1,
            address: address,
            error: 'Неверный формат адреса'
          });
        }
      } catch (error) {
        invalidAccounts.push({
          line: i + 1,
          address: address,
          error: 'Некорректный адрес'
        });
      }
    }
    
    return { 
      success: true, 
      subAccounts: validAccounts,
      totalAccounts: validAccounts.length,
      invalidAccounts: invalidAccounts,
      totalLines: lines.length,
      fileInfo: {
        path: SUB_ACCOUNTS_PATH,
        exists: true,
        lastModified: (await fs.stat(SUB_ACCOUNTS_PATH)).mtime
      }
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: `Ошибка чтения файла: ${error.message}` 
    };
  }
};

// Роут для запуска сбора нативных токенов
router.post('/start', async (req, res) => {
  try {
    if (isCollecting) {
      return res.status(400).json({ 
        success: false, 
        message: 'Сбор уже запущен' 
      });
    }

    const config = req.body;
    
    // Валидация конфигурации
    if (!config.transferPercent && !config.isRandom) {
      return res.status(400).json({ 
        success: false, 
        message: 'Не указан процент перевода' 
      });
    }

    if (config.isRandom && (!config.minPercent || !config.maxPercent)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Для случайного процента укажите minPercent и maxPercent' 
      });
    }

    // Валидация выбора сетей
    if (!config.selectedNetworks || config.selectedNetworks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Не выбраны сети для сбора' 
      });
    }

    // Проверяем, что выбранные сети поддерживаются
    if (Array.isArray(config.selectedNetworks) && config.selectedNetworks.length > 0) {
      const { getAllSupportedNetworks } = require('../../utils/nativeTokens.js');
      const supportedNetworks = getAllSupportedNetworks();
      const supportedNetworkIds = supportedNetworks.map(network => network.id);
      
      const invalidNetworks = config.selectedNetworks.filter(network => !supportedNetworkIds.includes(network));
      if (invalidNetworks.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Неподдерживаемые сети: ${invalidNetworks.join(', ')}` 
        });
      }
    }

    isCollecting = true;
    
    // Запускаем сбор в фоне
    collectEthToSubAccounts(config).finally(() => {
      isCollecting = false;
    });

    // Формируем сообщение о запуске
    const message = `Сбор нативных токенов запущен (${config.selectedNetworks.length} выбранных сетей)`;

    res.json({ 
      success: true, 
      message: message 
    });

  } catch (error) {
    console.error('Ошибка запуска сбора:', error);
    isCollecting = false;
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка запуска сбора' 
    });
  }
});

// Роут для получения информации о субаккаунтах
router.get('/subaccounts', async (req, res) => {
  try {
    const result = await readSubAccounts();
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json({
      success: true,
      subAccounts: result.subAccounts,
      stats: {
        totalAccounts: result.totalAccounts,
        totalLines: result.totalLines,
        invalidAccounts: result.invalidAccounts?.length || 0
      },
      invalidAccounts: result.invalidAccounts || [],
      fileInfo: result.fileInfo
    });
    
  } catch (error) {
    console.error('Ошибка получения субаккаунтов:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка получения субаккаунтов',
      details: error.message 
    });
  }
});

// Роут для получения статуса сбора
router.get('/status', (req, res) => {
  res.json({ 
    isCollecting: isCollecting 
  });
});

// Роут для остановки сбора
router.post('/stop', (req, res) => {
  if (!isCollecting) {
    return res.status(400).json({ 
      success: false, 
      message: 'Сбор не запущен' 
    });
  }

  // Устанавливаем флаг остановки
  if (typeof global !== 'undefined') {
    global.shouldStop = () => true;
  }

  isCollecting = false;
  
  res.json({ 
    success: true, 
    message: 'Остановка сбора запрошена' 
  });
});

module.exports = router; 