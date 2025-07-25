import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  CheckCircle, 
  AlertCircle, 
  Play,
  Settings,
  DollarSign,
  Shuffle,
  Target
} from 'lucide-react'
import toast from 'react-hot-toast'
import { stableFixAPI } from '../utils/api'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useTheme } from '../contexts/ThemeContext'
import WalletStats from '../components/WalletStats'

// Конфигурация стейблкойнов для разных сетей (аналогично бэкенду)
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
}

const StableFixPage = () => {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState([])
  const [isValid, setIsValid] = useState(true)
  const { bridgeStatus } = useWebSocket()

  // Валидация конфигурации при изменении параметров
  useEffect(() => {
    if (config) {
      validateConfigClient()
    }
  }, [config])

  // Загрузка данных при монтировании
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const response = await stableFixAPI.getConfig()
      
      if (response.data.success) {
        setConfig(response.data.config)
      } else {
        // Используем значения по умолчанию
        setConfig({
          percentage: 99,
          targetStablecoin: 'random',
          networks: ['optimism', 'arbitrum', 'base'],
          excludedNetworks: []
        })
      }
      setLoading(false)
    } catch (error) {
      console.error('Ошибка загрузки конфигурации StableFix:', error)
      // Используем значения по умолчанию
      setConfig({
        percentage: 99,
        targetStablecoin: 'random',
        networks: ['optimism', 'arbitrum', 'base'],
        excludedNetworks: []
      })
      setLoading(false)
    }
  }



  // Серверная валидация конфигурации
  const validateConfig = async (configToValidate = config) => {
    try {
      const response = await stableFixAPI.validateConfig(configToValidate)
      setIsValid(response.data.valid)
      setValidationErrors(response.data.errors || [])
      return response.data.valid
    } catch (error) {
      setIsValid(false)
      setValidationErrors(['Ошибка валидации конфигурации'])
      return false
    }
  }

  // Клиентская валидация конфигурации
  const validateConfigClient = (configToValidate = config) => {
    const errors = []
    
    if (!configToValidate) return false
    
    // Проверяем процент
    if (typeof configToValidate.percentage !== 'number' || configToValidate.percentage < 1 || configToValidate.percentage > 99) {
      errors.push('Процент должен быть числом от 1 до 99')
    }
    
    // Проверяем целевой стейблкойн
    if (!configToValidate.targetStablecoin) {
      errors.push('Выберите целевой стейблкойн')
    } else if (!['usdt', 'usdc', 'random'].includes(configToValidate.targetStablecoin)) {
      errors.push('Неподдерживаемый тип стейблкойна')
    }
    
    // Проверяем сети
    if (!Array.isArray(configToValidate.networks) || configToValidate.networks.length === 0) {
      errors.push('Выберите хотя бы одну сеть для обработки')
    }
    
    // Проверяем валидность выбранных сетей
    const validNetworks = ['optimism', 'arbitrum', 'base']
    if (configToValidate.networks) {
      for (const network of configToValidate.networks) {
        if (!validNetworks.includes(network)) {
          errors.push(`Неподдерживаемая сеть: ${network}`)
        }
      }
    }

    // Проверка совместимости стейблкойна с выбранными сетями
    if (configToValidate.targetStablecoin && configToValidate.networks && configToValidate.networks.length > 0) {
      const targetStablecoin = configToValidate.targetStablecoin
      
      // Если выбран конкретный стейблкойн (не random), проверяем совместимость
      if (targetStablecoin !== 'random') {
        for (const network of configToValidate.networks) {
          const networkStablecoins = STABLECOIN_CONFIG[network]
          if (!networkStablecoins || !networkStablecoins[targetStablecoin]) {
            const supportedStablecoins = networkStablecoins ? Object.keys(networkStablecoins).join(', ') : 'нет'
            errors.push(`Сеть ${network} не поддерживает ${targetStablecoin.toUpperCase()}. Поддерживаемые стейблкойны: ${supportedStablecoins}`)
          }
        }
      }
    }
    
    setValidationErrors(errors)
    setIsValid(errors.length === 0)
    return errors.length === 0
  }

  // Обновление конфигурации
  const updateConfig = (path, value) => {
    setConfig(prev => {
      const newConfig = { ...prev }
      const keys = path.split('.')
      let current = newConfig
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {}
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      
      // Валидируем после изменения
      setTimeout(() => validateConfigClient(newConfig), 100)
      
      return newConfig
    })
  }

  // Запуск StableFix
  const startStableFix = async () => {
    try {
      // Валидируем конфигурацию перед запуском
      const valid = validateConfigClient()
      if (!valid) {
        toast.error('Исправьте ошибки конфигурации перед запуском')
        return
      }

      // Автоматически включаем модуль и сохраняем конфигурацию
      const configWithEnabled = { ...config, enabled: true }
      await stableFixAPI.saveConfig(configWithEnabled)
      
      // Запускаем StableFix
      await stableFixAPI.start()
      toast.success('StableFix запущен')
      
      // Обновляем локальную конфигурацию
      setConfig(configWithEnabled)
      
      // Перенаправляем на страницу мониторинга
      navigate('/monitoring')
    } catch (error) {
      console.error('Ошибка запуска StableFix:', error)
      toast.error('Ошибка запуска StableFix')
    }
  }

  // Остановка StableFix


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-error-400 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900 mb-2">
          Ошибка загрузки конфигурации StableFix
        </h2>
        <button
          onClick={loadConfig}
          className="btn-primary"
        >
          Повторить
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">StableFix</h1>
          <div className="flex items-center mt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Фиксирование ETH в стейблкойны (USDT/USDC) через 
            </p>
            <img 
              src={isDark 
                ? "https://img.notionusercontent.com/s3/prod-files-secure%2F61de8ad8-b5ca-4b58-a9ee-73ed8bdff129%2Fd9cb233f-1d8d-43eb-9132-e726f01a3e3d%2Fdark-bg.png/size/w=320?exp=1753208539&sig=TQIERaG71PSDhSujfVR4nor_9szJ2ZF3dd6U2EVb7gQ&id=83a4ef44-158d-4b9e-8b05-cb33cf6aaab1&table=block"
                : "https://reservoir-labs.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F61de8ad8-b5ca-4b58-a9ee-73ed8bdff129%2Faeda97d9-b675-40ea-bbad-9b475906db0b%2Flight-bg.png?table=block&id=fa8fdf7b-8b16-4a69-9120-b1e35080796f&spaceId=61de8ad8-b5ca-4b58-a9ee-73ed8bdff129&width=320&userId=&cache=v2"
              }
              alt="StableFix" 
              className="w-13 h-4 rounded ml-1 opacity-100 hover:opacity-100 transition-opacity duration-200"
            />
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={startStableFix}
            disabled={!isValid || (bridgeStatus?.isRunning)}
            className="btn-success"
          >
            <Play className="h-4 w-4 mr-2" />
            {bridgeStatus?.isRunning ? 'Выполняется...' : 'Запуск'}
          </button>
        </div>
      </div>



      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-error-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-error-800 dark:text-error-200">
                Ошибки конфигурации:
              </h3>
              <ul className="mt-1 text-sm text-error-700 dark:text-error-300 list-disc list-inside">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Status indicator */}
      {isValid && !bridgeStatus?.isRunning && (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-success-400 mr-2" />
            <span className="text-sm font-medium text-success-800 dark:text-success-200">
              Конфигурация StableFix валидна
            </span>
          </div>
        </div>
      )}

      {/* Wallet Stats */}
      <WalletStats showRefresh={true} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main configuration */}
        <div className="lg:col-span-2 space-y-6">


          {/* Percentage settings */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            ⚙️ Процент для свапа
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Укажите процент от баланса ETH, который будет свапнут в стейблкойны. Максимум 99% для сохранения газа на кошельке.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Процент ETH для свапа (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={config.percentage || 50}
                  onChange={(e) => updateConfig('percentage', parseInt(e.target.value))}
                  className="input w-full"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  От 1% до 99% от баланса ETH в каждой сети
                </p>
              </div>
            </div>
          </div>

          {/* Target stablecoin */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              🎯 Целевой стейблкойн
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Выберите стейблкойн для свапа или используйте случайный выбор
            </p>
            
            <div className="space-y-3">
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="stablecoin"
                  value="usdt"
                  checked={config.targetStablecoin === 'usdt'}
                  onChange={(e) => updateConfig('targetStablecoin', e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white flex items-center">
                    <img src="https://coin-images.coingecko.com/coins/images/39963/large/usdt.png" alt="USDT" className="h-4 w-4 mr-2 rounded-full" />
                    USDT
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Свап ETH в USDT во всех поддерживаемых сетях
                  </div>
                </div>
              </label>
              
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="stablecoin"
                  value="usdc"
                  checked={config.targetStablecoin === 'usdc'}
                  onChange={(e) => updateConfig('targetStablecoin', e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white flex items-center">
                    <img src="https://coin-images.coingecko.com/coins/images/6319/large/usdc.png" alt="USDC" className="h-4 w-4 mr-2 rounded-full" />
                    USDC
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Свап ETH в USDC во всех поддерживаемых сетях
                  </div>
                </div>
              </label>
              
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="stablecoin"
                  value="random"
                  checked={config.targetStablecoin === 'random'}
                  onChange={(e) => updateConfig('targetStablecoin', e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white flex items-center">
                    <Shuffle className="h-4 w-4 mr-2 text-purple-600" />
                    Случайный выбор
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Случайный выбор между USDT и USDC для каждого кошелька
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Networks selection */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              🌐 Поддерживаемые сети
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Выберите сети, в которых будет выполняться свап ETH в стейблкойны
            </p>
            
            <div className="space-y-3">
              {[
                { 
                  id: 'optimism', 
                  name: 'Optimism', 
                  description: 'USDT и USDC',
                  stablecoins: [
                    { symbol: 'USDT', logo: 'https://coin-images.coingecko.com/coins/images/39963/large/usdt.png' },
                    { symbol: 'USDC', logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' }
                  ]
                },
                { 
                  id: 'arbitrum', 
                  name: 'Arbitrum', 
                  description: 'USDT и USDC',
                  stablecoins: [
                    { symbol: 'USDT', logo: 'https://coin-images.coingecko.com/coins/images/39963/large/usdt.png' },
                    { symbol: 'USDC', logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' }
                  ]
                },
                { 
                  id: 'base', 
                  name: 'Base', 
                  description: 'Только USDC',
                  stablecoins: [
                    { symbol: 'USDC', logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' }
                  ]
                }
              ].map((network) => (
                <label key={network.id} className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.networks?.includes(network.id) || false}
                    onChange={(e) => {
                      const networks = config.networks || []
                      if (e.target.checked) {
                        updateConfig('networks', [...networks, network.id])
                      } else {
                        updateConfig('networks', networks.filter(n => n !== network.id))
                      }
                    }}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {network.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                      <span className="mr-2">{network.description}</span>
                      <div className="flex space-x-1">
                        {network.stablecoins.map((stablecoin, index) => (
                          <img 
                            key={index}
                            src={stablecoin.logo} 
                            alt={stablecoin.symbol} 
                            className="h-3 w-3 rounded-full" 
                            title={stablecoin.symbol}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Settings sidebar */}
        <div className="space-y-6">
          {/* Current settings preview */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              📄 Текущие настройки
            </h2>
            
            <div className="space-y-2 text-sm">
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Процент свапа:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {config.percentage}%
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Стейблкойн:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {config.targetStablecoin === 'usdt' ? 'USDT' : 
                   config.targetStablecoin === 'usdc' ? 'USDC' : 
                   '🎲 Случайно'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Сетей:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {config.networks?.length || 0}
                </span>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}

export default StableFixPage 