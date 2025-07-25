const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const compression = require('compression');

// Импорт маршрутов
const { router: configRoutes } = require('./routes/config');
const walletsRoutes = require('./routes/wallets');
const bridgeRoutes = require('./routes/bridge');
const collectorRoutes = require('./routes/collector');
const stableFixRoutes = require('./routes/stablefix');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Глобальные переменные для состояния
global.bridgeStatus = {
  isRunning: false,
  currentWallet: null,
  currentNetwork: null,
  progress: { completed: 0, total: 0 },
  logs: [],
  startTime: null,
  stats: { successful: 0, failed: 0 }
};



global.wsClients = new Set();

// Middleware
app.use(compression()); // Сжатие gzip для всех ответов
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Ограничение частоты отправки сообщений  
let lastMessageTime = 0;
const MESSAGE_THROTTLE_MS = 100; // Уменьшили до 10мс для более быстрой отправки
let importantMessageQueue = []; // Очередь для важных сообщений

// WebSocket обработка
wss.on('connection', (ws) => {
  console.log('WebSocket клиент подключен');
  global.wsClients.add(ws);
  
  // Отправляем текущее состояние новому клиенту
  ws.send(JSON.stringify({
    type: 'status',
    data: global.bridgeStatus
  }));
  

  
  // Отправляем все важные сообщения из очереди новому клиенту
  if (importantMessageQueue.length > 0) {
    // Отладочные логи удалены
    importantMessageQueue.forEach(queuedMessage => {
      try {
        const queuedMessageData = JSON.stringify({
          type: 'log',
          data: queuedMessage
        });
        ws.send(queuedMessageData);
      } catch (error) {
        console.error('Ошибка отправки сообщения из очереди новому клиенту:', error);
      }
    });
  }
  
  ws.on('close', () => {
    console.log('WebSocket клиент отключен');
    global.wsClients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket ошибка:', error);
    global.wsClients.delete(ws);
  });
});

// Функция для отправки логов через WebSocket
global.broadcastLog = (message, type = 'info') => {
  // Отладочные логи удалены
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type
  };
  
  // Добавляем в буфер логов (ограничиваем 1000 записей)
  global.bridgeStatus.logs.push(logEntry);
  if (global.bridgeStatus.logs.length > 1000) {
    global.bridgeStatus.logs = global.bridgeStatus.logs.slice(-1000);
  }
  
  // Отправляем всем подключенным клиентам
  const currentTime = Date.now();
  
  // Определяем важные сообщения, которые не должны пропускаться
  const isImportantMessage = (
    typeof message === 'string' && (
      message.includes('завершен') || 
      message.includes('обработан') || 
      message.includes('запущен') ||
      message.includes('остановлен') ||
      message.includes('ошибка') ||
      message.includes('успешно') ||
      message.includes('Балансы получены') ||
      message.includes('Автобриджер') ||
      message.includes('Задержка') || // Добавляем задержки в важные сообщения
      message.includes('⏳') || // Эмодзи задержки
      message.includes('⏱️') // Эмодзи таймера
    )
  ) || type === 'success' || type === 'error';
  
  // Для важных сообщений используем отдельный throttling
  const throttleTime = isImportantMessage ? 0 : MESSAGE_THROTTLE_MS;
  
  // Отладочные логи удалены
  
  if (currentTime - lastMessageTime >= throttleTime) {
    lastMessageTime = currentTime; // Обновляем время для всех сообщений
    
    try {
      const message_data = JSON.stringify({
        type: 'log',
        data: logEntry
      });
      
      global.wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message_data);
            // Отладочные логи удалены
          } catch (error) {
            console.error('Ошибка отправки WebSocket сообщения:', error);
            // Удаляем проблемный клиент
            global.wsClients.delete(client);
          }
        } else {
          // Удаляем отключенных клиентов
          global.wsClients.delete(client);
        }
      });
    } catch (error) {
      console.error('Ошибка сериализации лога:', error);
    }
  } else {
    // Для важных сообщений добавляем в очередь, если они не прошли throttling
    if (isImportantMessage) {
      importantMessageQueue.push(logEntry);
      // Отладочные логи удалены
      
      // Отправляем сообщения из очереди через небольшую задержку
      setTimeout(() => {
        if (importantMessageQueue.length > 0) {
          const queuedMessage = importantMessageQueue.shift();
          try {
            const queuedMessageData = JSON.stringify({
              type: 'log',
              data: queuedMessage
            });
            
            global.wsClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(queuedMessageData);
                  // Отладочные логи удалены
                } catch (error) {
                  console.error('Ошибка отправки сообщения из очереди:', error);
                  global.wsClients.delete(client);
                }
              } else {
                global.wsClients.delete(client);
              }
            });
          } catch (error) {
            console.error('Ошибка сериализации сообщения из очереди:', error);
          }
        }
      }, 10); // Небольшая задержка для отправки из очереди
    } else {
      // Логируем только пропущенные обычные сообщения
      // Отладочные логи удалены
    }
  }
};

// Функция для обновления статуса
global.updateStatus = (updates) => {
  // Сохраняем логи перед обновлением
  const logs = global.bridgeStatus.logs || [];
  
  Object.assign(global.bridgeStatus, updates);
  
  // Восстанавливаем логи после обновления
  global.bridgeStatus.logs = logs;
  
  const message = JSON.stringify({
    type: 'status',
    data: global.bridgeStatus
  });
  
  global.wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Функция для проверки остановки StableFix
global.shouldStopStableFix = () => {
  return global.bridgeStatus && !global.bridgeStatus.isRunning;
};

// Функция для сброса статистики
global.resetStats = () => {
  if (global.bridgeStatus && global.bridgeStatus.stats) {
    global.bridgeStatus.stats.successful = 0;
    global.bridgeStatus.stats.failed = 0;
    
    // Отправляем обновленный статус всем клиентам
    global.updateStatus(global.bridgeStatus);
  }
};

// Маршруты API
app.use('/api/config', configRoutes);
app.use('/api/wallets', walletsRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/collector', collectorRoutes);
app.use('/api/stablefix', stableFixRoutes);

// Базовый маршрут
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API для сброса статистики
app.post('/api/reset-stats', (req, res) => {
  try {
    global.resetStats();
    res.json({ 
      success: true, 
      message: 'Статистика сброшена',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Ошибка сброса статистики:', error);
    res.status(500).json({ 
      error: 'Ошибка сброса статистики',
      message: error.message 
    });
  }
});

// Обслуживание статических файлов фронтенда
app.use(express.static(path.join(__dirname, '../frontend/dist'), {
  maxAge: '1y', // Кэширование статических файлов на 1 год
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Специальные настройки кэширования для разных типов файлов
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache'); // HTML не кэшируем
    } else if (path.includes('assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Assets кэшируем надолго
    }
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({ 
    error: 'Внутренняя ошибка сервера',
    message: err.message 
  });
});

// 404 обработчик
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

const PORT = process.env.PORT || 3001;

// Глобальная обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанная ошибка в backend:', error.message);
  
  // Если это сетевая ошибка, не завершаем процесс
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    console.log('🌐 Сетевая ошибка - продолжаем работу...');
    return;
  }
  
  // Проверяем ошибки RPC
  if (error.code === 19 && error.message && error.message.includes('Unable to perform request')) {
    console.log('⚠️ RPC временно недоступен - продолжаем работу...');
    return;
  }
  
  // Проверяем другие типы ошибок RPC
  if (error.message && (
    error.message.includes('not found') || 
    error.message.includes('Unknown block') ||
    error.message.includes('timeout') ||
    error.message.includes('network') ||
    error.message.includes('Unable to perform request')
  )) {
    console.log('⚠️ Ошибка сети/RPC - продолжаем работу...');
    return;
  }
  
  // Для других ошибок завершаем процесс
  console.error('❌ Критическая ошибка - завершение процесса');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Необработанное отклонение промиса в backend:', reason);
  
  // Если это сетевая ошибка, не завершаем процесс
  if (reason && reason.code === 'ECONNRESET' || reason.code === 'ENOTFOUND' || reason.code === 'ETIMEDOUT') {
    console.log('🌐 Сетевая ошибка в промиссе - продолжаем работу...');
    return;
  }
  
  // Проверяем ошибки RPC
  if (reason && reason.code === 19 && reason.message && reason.message.includes('Unable to perform request')) {
    console.log('⚠️ RPC временно недоступен - продолжаем работу...');
    return;
  }
  
  // Проверяем другие типы ошибок RPC
  if (reason && reason.message && (
    reason.message.includes('not found') || 
    reason.message.includes('Unknown block') ||
    reason.message.includes('timeout') ||
    reason.message.includes('network') ||
    reason.message.includes('Unable to perform request')
  )) {
    console.log('⚠️ Ошибка сети/RPC - продолжаем работу...');
    return;
  }
  
  // Для других ошибок завершаем процесс
  console.error('❌ Критическая ошибка в промиссе - завершение процесса');
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`🚀 Backend сервер запущен на порту ${PORT}`);
  console.log(`📡 WebSocket сервер активен`);
  console.log(`🌐 API доступен по адресу: http://localhost:${PORT}/api`);
  
  // Инициализируем начальные логи
  global.broadcastLog('🚀 Backend сервер запущен', 'success');
  
  // Периодическая очистка очереди важных сообщений (каждые 30 секунд)
  setInterval(() => {
    if (importantMessageQueue.length > 0) {
      console.log(`🧹 Очистка очереди важных сообщений: ${importantMessageQueue.length} сообщений`);
      importantMessageQueue = [];
    }
  }, 30000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Получен сигнал SIGTERM, выполняется корректное завершение...');
  server.close(() => {
    console.log('Сервер успешно завершен');
    process.exit(0);
  });
});

module.exports = { app, server }; 