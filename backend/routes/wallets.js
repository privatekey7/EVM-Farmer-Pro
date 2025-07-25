const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { ethers } = require('ethers');
const router = express.Router();

// Путь к файлу с ключами
const KEYS_PATH = path.join(__dirname, '../../keys.txt');

// Импорт существующего скрейпера балансов
const { checkBalance } = require('../../src/debank_balance_checker');
const puppeteer = require('puppeteer');

// Вспомогательная функция для получения балансов одного адреса
async function getTokenBalancesForAddress(address) {
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
}

// Функция для чтения и парсинга приватных ключей
const readPrivateKeys = async () => {
  try {
    const exists = await fs.pathExists(KEYS_PATH);
    if (!exists) {
      return { success: false, error: 'Файл keys.txt не найден' };
    }
    
    const content = await fs.readFile(KEYS_PATH, 'utf8');
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')); // Игнорируем комментарии
    
    if (lines.length === 0) {
      return { success: false, error: 'Файл keys.txt пуст' };
    }
    
    const wallets = [];
    const errors = [];
    
    for (let i = 0; i < lines.length; i++) {
      const privateKey = lines[i];
      
      try {
        // Валидируем приватный ключ
        const wallet = new ethers.Wallet(privateKey);
        wallets.push({
          index: i + 1,
          address: wallet.address,
          privateKey: privateKey
        });
      } catch (error) {
        errors.push(`Строка ${i + 1}: Неверный приватный ключ`);
      }
    }
    
    return { 
      success: true, 
      wallets, 
      errors,
      totalKeys: lines.length,
      validKeys: wallets.length
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: `Ошибка чтения файла: ${error.message}` 
    };
  }
};

// GET /api/wallets - получить список кошельков
router.get('/', async (req, res) => {
  try {
    const result = await readPrivateKeys();
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    // Возвращаем только адреса и индексы (без приватных ключей)
    const walletsInfo = result.wallets.map(wallet => ({
      index: wallet.index,
      address: wallet.address,
      balanceUSD: null, // Будет заполнено отдельным запросом
      lastUpdated: null
    }));
    
    res.json({
      success: true,
      wallets: walletsInfo,
      stats: {
        total: result.totalKeys,
        valid: result.validKeys,
        invalid: result.totalKeys - result.validKeys
      },
      errors: result.errors,
      fileInfo: {
        path: KEYS_PATH,
        exists: true,
        lastModified: (await fs.stat(KEYS_PATH)).mtime
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения кошельков:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка обработки кошельков',
      details: error.message 
    });
  }
});

// POST /api/wallets/validate - валидация keys.txt без чтения данных
router.post('/validate', async (req, res) => {
  try {
    const result = await readPrivateKeys();
    
    res.json({
      success: true,
      valid: result.success && result.errors.length === 0,
      stats: result.success ? {
        total: result.totalKeys,
        valid: result.validKeys,
        invalid: result.totalKeys - result.validKeys
      } : null,
      errors: result.success ? result.errors : [result.error]
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      valid: false,
      errors: [`Ошибка валидации: ${error.message}`]
    });
  }
});

// GET /api/wallets/:address/balances - получить балансы конкретного кошелька
router.get('/:address/balances', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Валидируем адрес
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат адреса кошелька'
      });
    }
    
    // Отправляем лог о начале получения балансов
    if (global.broadcastLog) {
      global.broadcastLog(`📊 Получение балансов для ${address}`, 'info');
    }
    
    // Получаем актуальные балансы
    const balances = await getTokenBalancesForAddress(address);
    
    if (!balances || balances.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Балансы не найдены или кошелек пуст'
      });
    }
    
    // Вычисляем общую стоимость в USD
    let totalUSD = 0;
    const processedBalances = [];
    
    for (const balanceData of balances) {
      if (balanceData.data && balanceData.data.data) {
        for (const token of balanceData.data.data) {
          const usdValue = token.amount * (token.price || 0);
          totalUSD += usdValue;
          
          processedBalances.push({
            chain: token.chain,
            symbol: token.symbol,
            amount: token.amount,
            price: token.price || 0,
            usdValue: usdValue,
            isNative: token.is_core && !token.id.startsWith('0x'),
            address: token.id.startsWith('0x') ? token.id : null,
            logo_url: token.logo_url || token.logo || null
          });
        }
      }
    }
    
    if (global.broadcastLog) {
      global.broadcastLog(`✅ Балансы получены: $${totalUSD.toFixed(2)}`, 'success');
    }
    
    res.json({
      success: true,
      balances: processedBalances,
      totalUSD,
      cached: false,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Ошибка получения балансов:', error);
    
    if (global.broadcastLog) {
      global.broadcastLog(`❌ Ошибка получения балансов: ${error.message}`, 'error');
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Ошибка получения балансов',
      details: error.message 
    });
  }
});

// POST /api/wallets/refresh-all - обновить балансы всех кошельков
router.post('/refresh-all', async (req, res) => {
  try {
    const result = await readPrivateKeys();
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    if (global.broadcastLog) {
      global.broadcastLog(`🔄 Обновление балансов для ${result.wallets.length} кошельков`, 'info');
    }
    
    const results = [];
    let totalUSD = 0;
    
    for (const wallet of result.wallets) {
      try {
        // Получаем балансы для каждого кошелька
        const balances = await getTokenBalancesForAddress(wallet.address);
        
        let walletUSD = 0;
        if (balances && balances.length > 0) {
          for (const balanceData of balances) {
            if (balanceData.data && balanceData.data.data) {
              for (const token of balanceData.data.data) {
                walletUSD += token.amount * (token.price || 0);
              }
            }
          }
        }
        
        totalUSD += walletUSD;
        results.push({
          address: wallet.address,
          balanceUSD: walletUSD,
          success: true
        });
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        results.push({
          address: wallet.address,
          balanceUSD: 0,
          success: false,
          error: error.message
        });
      }
    }
    
    if (global.broadcastLog) {
      global.broadcastLog(`✅ Обновление завершено. Общий баланс: $${totalUSD.toFixed(2)}`, 'success');
    }
    
    res.json({
      success: true,
      results,
      summary: {
        totalWallets: result.wallets.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalUSD
      }
    });
    
  } catch (error) {
    console.error('Ошибка массового обновления:', error);
    
    if (global.broadcastLog) {
      global.broadcastLog(`❌ Ошибка массового обновления: ${error.message}`, 'error');
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Ошибка массового обновления балансов',
      details: error.message 
    });
  }
});

// GET /api/wallets/stats - статистика по всем кошелькам
router.get('/stats', async (req, res) => {
  try {
    const result = await readPrivateKeys();
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    // Возвращаем только информацию о количестве кошельков
    res.json({
      success: true,
      stats: {
        totalWallets: result.wallets.length,
        validWallets: result.validKeys,
        invalidWallets: result.totalKeys - result.validKeys
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка получения статистики',
      details: error.message 
    });
  }
});

module.exports = router; 