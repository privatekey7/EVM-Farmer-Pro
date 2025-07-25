import axios from 'axios'
import toast from 'react-hot-toast'

// Создаем экземпляр axios с базовой конфигурацией
const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 секунд
  headers: {
    'Content-Type': 'application/json',
  },
})

// Создаем экземпляр axios для тихих запросов (без toast уведомлений)
const silentApi = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 секунд
  headers: {
    'Content-Type': 'application/json',
  },
})

// Интерцептор для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Неизвестная ошибка'
    
    // Не показываем toast для некоторых ошибок, которые обрабатываются в компонентах
    const skipToastErrors = [404, 409]
    if (!skipToastErrors.includes(error.response?.status)) {
      toast.error(message)
    }
    
    return Promise.reject(error)
  }
)

// API методы для конфигурации
export const configAPI = {
  // Получить текущую конфигурацию
  get: () => api.get('/config'),
  
  // Сохранить конфигурацию
  save: (config) => api.post('/config', config),
  
  // Сбросить конфигурацию к значениям по умолчанию
  reset: () => api.delete('/config'),
  
  // Валидация конфигурации без сохранения
  validate: (config) => api.post('/config/validate', config),
}

// API методы для кошельков
export const walletsAPI = {
  // Получить список кошельков
  list: () => api.get('/wallets'),
  
  // Валидация keys.txt
  validate: () => api.post('/wallets/validate'),
  
  // Получить балансы кошелька
  getBalances: (address, force = false) => 
    api.get(`/wallets/${address}/balances`, { params: { force } }),
  
  // Обновить балансы всех кошельков
  refreshAll: () => api.post('/wallets/refresh-all'),
  
  // Получить статистику
  getStats: () => api.get('/wallets/stats'),
}

// API методы для автобриджера
export const bridgeAPI = {
  // Получить статус
  getStatus: () => api.get('/bridge/status'),
  
  // Запустить автобриджер
  start: () => api.post('/bridge/start'),
  
  // Остановить автобриджер
  stop: () => api.post('/bridge/stop'),
  
  // Остановить автобриджер без уведомлений
  stopSilent: () => silentApi.post('/bridge/stop').catch(() => {}),
  
  // Получить логи
  getLogs: (limit = 100, offset = 0) => 
    api.get('/bridge/logs', { params: { limit, offset } }),
  
  // Тестовый запуск для одного кошелька
  test: (address) => api.post('/bridge/test', { address }),
  
  // История выполнений
  getHistory: () => api.get('/bridge/history'),
}

// StableFix API
export const stableFixAPI = {
  getConfig: () => api.get('/stablefix/config'),
  saveConfig: (config) => api.post('/stablefix/config', config),
  resetConfig: () => api.delete('/stablefix/config'),
  validateConfig: (config) => api.post('/stablefix/config/validate', config),
  start: () => api.post('/stablefix/start'),
  stop: () => api.post('/stablefix/stop'),
  stopSilent: () => silentApi.post('/stablefix/stop').catch(() => {}),
  getStatus: () => api.get('/stablefix/status'),
  getStablecoins: () => api.get('/stablefix/stablecoins')
};

// API для сброса статистики
export const statsAPI = {
  reset: () => api.post('/reset-stats'),
}

// SubTransfer API
export const subTransferAPI = {
  start: (config) => api.post('/collector/start', config),
  stop: () => api.post('/collector/stop'),
  stopSilent: () => silentApi.post('/collector/stop').catch(() => {}),
  getStatus: () => api.get('/collector/status'),
  getSubAccounts: () => api.get('/collector/subaccounts'),
}

// Проверка здоровья сервера
export const healthCheck = () => api.get('/health')

export default api 