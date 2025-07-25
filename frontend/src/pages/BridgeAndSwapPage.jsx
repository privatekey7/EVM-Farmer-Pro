import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  CheckCircle, 
  AlertCircle, 
  Download,
  Settings,
  Play,
  Shuffle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { configAPI, bridgeAPI } from '../utils/api'
import { useWebSocket } from '../contexts/WebSocketContext'
import WalletStats from '../components/WalletStats'
import { SUPPORTED_NETWORKS, TARGET_NETWORKS, SWAP_TARGET_NETWORKS } from '../utils/networks'
import { useTheme } from '../contexts/ThemeContext'

const BridgeAndSwapPage = () => {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [config, setConfig] = useState({
    collection: {
      mode: 'collect_to_target',
      targetNetworks: ['base'],
      targetNetwork: 'base'
    },
    excludedNetworks: [],
    enableEthMainnet: false,
    transactionDelay: { min: 60, max: 120 },
    walletDelay: { min: 120, max: 300 }
  })

  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState([])
  const [isValid, setIsValid] = useState(true)
  const { bridgeStatus } = useWebSocket()

  // Валидация конфигурации при изменении параметров
  useEffect(() => {
    if (config) {
      validateConfig()
    }
  }, [config])



  // Загрузка данных при монтировании
  useEffect(() => {
    loadConfig()
  }, [])



  const loadConfig = async () => {
    try {
      const response = await configAPI.get()
      let configData = response.data.config
      
      // Убеждаемся, что для режима collect_to_target есть хотя бы одна целевая сеть
      if (configData.collection?.mode === 'collect_to_target' && 
          (!configData.collection.targetNetworks || configData.collection.targetNetworks.length === 0)) {
        configData.collection.targetNetworks = ['base']
        configData.collection.targetNetwork = 'base'
      }
      
      // Очищаем all_chains из targetNetworks для режима collect_to_target
      if (configData.collection?.mode === 'collect_to_target' && 
          configData.collection.targetNetworks?.includes('all_chains')) {
        configData.collection.targetNetworks = configData.collection.targetNetworks.filter(id => id !== 'all_chains')
        // Если после удаления all_chains не осталось сетей, добавляем base
        if (configData.collection.targetNetworks.length === 0) {
          configData.collection.targetNetworks = ['base']
          configData.collection.targetNetwork = 'base'
        }
      }
      
      // Убеждаемся, что для режима swap_to_native есть targetNetworks
      if (configData.collection?.mode === 'swap_to_native') {
        if (!configData.collection.targetNetworks || configData.collection.targetNetworks.length === 0) {
          configData.collection.targetNetworks = ['all_chains']
        }
        // Удаляем старый targetNetwork если он есть
        if (configData.collection.targetNetwork) {
          delete configData.collection.targetNetwork
        }
      }
      
      setConfig(configData)
      setLoading(false)
    } catch (error) {
      // Если конфигурация не найдена, используем значения по умолчанию
      if (error.response?.status === 404) {
        setConfig({
          collection: {
            mode: 'collect_to_target',
            targetNetwork: 'base',
            targetNetworks: ['base']
          },
          excludedNetworks: [],
          enableEthMainnet: false,
          transaction: {
            delayMinMs: 60000,
            delayMaxMs: 120000,
            walletDelayMinMs: 120000,
            walletDelayMaxMs: 300000
          }
        })
      }
      setLoading(false)
    }
  }



  // Валидация конфигурации
  const validateConfig = async (configToValidate = config) => {
    try {
      const response = await configAPI.validate(configToValidate)
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
    
    // Проверяем режим работы
    if (!configToValidate.collection?.mode) {
      errors.push('Выберите режим работы')
    }
    
    // Проверяем целевые сети для режима collect_to_target
    if (configToValidate.collection?.mode === 'collect_to_target') {
      if (!configToValidate.collection?.targetNetworks || configToValidate.collection.targetNetworks.length === 0) {
        errors.push('Выберите хотя бы одну целевую сеть для сбора')
      }
    }
    
    // Проверяем целевую сеть для режима swap_to_native
    if (configToValidate.collection?.mode === 'swap_to_native') {
      if (!configToValidate.collection?.targetNetworks || configToValidate.collection.targetNetworks.length === 0) {
        errors.push('Выберите хотя бы одну целевую сеть для свапов')
      }
    }
    
    // Проверяем задержки
    if (configToValidate.transaction) {
      const { delayMinMs, delayMaxMs, walletDelayMinMs, walletDelayMaxMs } = configToValidate.transaction
      
      if (delayMinMs !== undefined && delayMaxMs !== undefined && delayMinMs >= delayMaxMs) {
        errors.push('Минимальная задержка транзакций должна быть меньше максимальной')
      }
      
      if (walletDelayMinMs !== undefined && walletDelayMaxMs !== undefined && walletDelayMinMs >= walletDelayMaxMs) {
        errors.push('Минимальная задержка кошельков должна быть меньше максимальной')
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
      
      // Синхронизация targetNetworks → targetNetwork для бэкенда
      if (path === 'collection.targetNetworks') {
        if (!newConfig.collection) newConfig.collection = {}
        
        // Для режима collect_to_target устанавливаем targetNetwork
        if (newConfig.collection.mode === 'collect_to_target') {
          if (value.length === 1) {
            // Одна сеть - используем её
            newConfig.collection.targetNetwork = value[0]
          } else if (value.length > 1) {
            // Несколько сетей - используем "random"
            newConfig.collection.targetNetwork = 'random'
          } else {
            // Нет сетей - возвращаемся к base по умолчанию
            newConfig.collection.targetNetwork = 'base'
          }
        }
      }
      
      // Автоматическая установка правильных значений при смене режима
      if (path === 'collection.mode') {
        if (!newConfig.collection) newConfig.collection = {}
        
        if (value === 'swap_to_native') {
          // Для режима свапов устанавливаем "Все сети" по умолчанию
          newConfig.collection.targetNetworks = ['all_chains']
          // Удаляем старый targetNetwork
          delete newConfig.collection.targetNetwork
        } else if (value === 'collect_to_target') {
          // Для режима сбора устанавливаем base по умолчанию, если нет targetNetworks
          if (!newConfig.collection.targetNetworks || newConfig.collection.targetNetworks.length === 0) {
            newConfig.collection.targetNetwork = 'base'
            newConfig.collection.targetNetworks = ['base']
          }
          // Очищаем all_chains из targetNetworks для режима collect_to_target
          if (newConfig.collection.targetNetworks?.includes('all_chains')) {
            newConfig.collection.targetNetworks = newConfig.collection.targetNetworks.filter(id => id !== 'all_chains')
            // Если после удаления all_chains не осталось сетей, добавляем base
            if (newConfig.collection.targetNetworks.length === 0) {
              newConfig.collection.targetNetwork = 'base'
              newConfig.collection.targetNetworks = ['base']
            }
          }
        }
      }
      
      // Валидируем после изменения
      setTimeout(() => validateConfigClient(newConfig), 100)
      
      return newConfig
    })
  }

  // Запуск автобриджера
  const startBridge = async () => {
    try {
      // Валидируем конфигурацию перед запуском
      const valid = validateConfigClient()
      if (!valid) {
        toast.error('Исправьте ошибки конфигурации перед запуском')
        return
      }

      // Автоматически сохраняем конфигурацию при запуске
      await configAPI.save(config)
      
      // Запускаем автобриджер
      await bridgeAPI.start()
      toast.success('Автобриджер запущен')
      
      // Переходим на страницу мониторинга
      navigate('/monitoring')
    } catch (error) {
      console.error('Ошибка запуска:', error)
      toast.error('Ошибка запуска автобриджера')
    }
  }

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
          Ошибка загрузки конфигурации
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bridge & Swap</h1>
          <div className="flex items-center mt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Настройте параметры и запустите автоматический сбор токенов через 
            </p>
            <img 
              src={isDark 
                ? "https://img.notionusercontent.com/s3/prod-files-secure%2F61de8ad8-b5ca-4b58-a9ee-73ed8bdff129%2Fd9cb233f-1d8d-43eb-9132-e726f01a3e3d%2Fdark-bg.png/size/w=320?exp=1753208539&sig=TQIERaG71PSDhSujfVR4nor_9szJ2ZF3dd6U2EVb7gQ&id=83a4ef44-158d-4b9e-8b05-cb33cf6aaab1&table=block"
                : "https://reservoir-labs.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F61de8ad8-b5ca-4b58-a9ee-73ed8bdff129%2Faeda97d9-b675-40ea-bbad-9b475906db0b%2Flight-bg.png?table=block&id=fa8fdf7b-8b16-4a69-9120-b1e35080796f&spaceId=61de8ad8-b5ca-4b58-a9ee-73ed8bdff129&width=320&userId=&cache=v2"
              }
              alt="Сбор токенов" 
              className="w-13 h-4 rounded ml-1 opacity-100 hover:opacity-100 transition-opacity duration-200"
            />
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={startBridge}
            disabled={!isValid || bridgeStatus.isRunning}
            className="btn-success"
          >
            <Play className="h-4 w-4 mr-2" />
            {bridgeStatus.isRunning ? 'Выполняется...' : 'Запуск'}
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
      {isValid && (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-success-400 mr-2" />
            <span className="text-sm font-medium text-success-800 dark:text-success-200">
              Конфигурация Bridge & Swap  валидна
            </span>
          </div>
        </div>
      )}

      {/* Wallet Stats */}
      <WalletStats showRefresh={true} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mode selection */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            💻 Режим работы
            </h2>
            
            <div className="space-y-3">
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="mode"
                  value="collect_to_target"
                  checked={config.collection?.mode === 'collect_to_target'}
                  onChange={(e) => updateConfig('collection.mode', e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Собрать всё в одну сеть
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Собирает все токены из всех сетей в указанную целевую сеть или сети
                  </div>
                </div>
              </label>
              
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="mode"
                  value="swap_to_native"
                  checked={config.collection?.mode === 'swap_to_native'}
                  onChange={(e) => updateConfig('collection.mode', e.target.value)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Свапы в нативку
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Свапает все токены в нативные монеты без бриджей
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Target networks */}
          {config.collection?.mode === 'collect_to_target' && (
            <div className="card">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                🎯 Целевые сети
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Выберите сети для сбора токенов. Если выбрана одна сеть - сбор будет в неё, если несколько - сбор будет в случайную из выбранных сетей
              </p>
              
              <div className="space-y-3">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const targetNetworks = config.collection?.targetNetworks || []
                      if (!targetNetworks.includes(e.target.value)) {
                        // Удаляем сеть из исключений, если она там есть
                        const excludedNetworks = config.excludedNetworks || []
                        const newExcludedNetworks = excludedNetworks.filter(id => id !== e.target.value)
                        if (newExcludedNetworks.length !== excludedNetworks.length) {
                          updateConfig('excludedNetworks', newExcludedNetworks)
                        }
                        
                        updateConfig('collection.targetNetworks', [...targetNetworks, e.target.value])
                      }
                      e.target.value = '' // Сбрасываем выбор
                    }
                  }}
                  className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Добавить целевую сеть</option>
                  {TARGET_NETWORKS
                    .filter(network => {
                      // Исключаем сети, которые уже в целевых сетях
                      if (config.collection?.targetNetworks?.includes(network.id)) {
                        return false
                      }
                      // Исключаем сети, которые выбраны в исключениях
                      const excludedNetworks = config.excludedNetworks || []
                      if (excludedNetworks.includes(network.id)) {
                        return false
                      }
                      return true
                    })
                    .map((network) => (
                      <option key={network.id} value={network.id}>
                        {network.name}
                      </option>
                    ))}
                </select>
                
                {config.collection?.targetNetworks?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Целевые сети ({config.collection.targetNetworks.length}):
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {config.collection.targetNetworks.map((networkId) => {
                        const network = TARGET_NETWORKS.find(n => n.id === networkId)
                        return (
                          <div
                            key={networkId}
                            className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm"
                          >
                            <img 
                              src={network?.logo_url} 
                              alt={network?.symbol} 
                              className="w-4 h-4"
                              onError={(e) => {
                                // Fallback к текстовому символу если изображение не загрузилось
                                e.target.style.display = 'none';
                                const fallback = document.createElement('span');
                                fallback.className = 'w-4 h-4 flex items-center justify-center text-xs font-bold';
                                fallback.textContent = network?.symbol?.charAt(0) || '?';
                                e.target.parentNode.insertBefore(fallback, e.target);
                              }}
                            />
                            <span>{network?.name || networkId}</span>
                            <button
                              onClick={() => {
                                const targetNetworks = config.collection?.targetNetworks || []
                                updateConfig('collection.targetNetworks', targetNetworks.filter(id => id !== networkId))
                              }}
                              className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {config.collection.targetNetworks.length > 1 && (
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          🎲 Случайный выбор между {config.collection.targetNetworks.length} сетями для каждого кошелька
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Target networks for swap_to_native */}
          {config.collection?.mode === 'swap_to_native' && (
            <div className="card">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                🎯 Целевые сети
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Выберите сети для обработки (свапы токенов в нативную валюту). Если выбрана одна сеть - свапы будут в неё, если несколько - свапы будут в случайную из выбранных сетей
              </p>
              
              <div className="space-y-3">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const targetNetworks = config.collection?.targetNetworks || []
                      if (!targetNetworks.includes(e.target.value)) {
                        if (e.target.value === 'all_chains') {
                          // Если выбираем "Все сети", удаляем все конкретные сети
                          updateConfig('collection.targetNetworks', ['all_chains'])
                        } else {
                          // Удаляем сеть из исключений, если она там есть
                          const excludedNetworks = config.excludedNetworks || []
                          const newExcludedNetworks = excludedNetworks.filter(id => id !== e.target.value)
                          if (newExcludedNetworks.length !== excludedNetworks.length) {
                            updateConfig('excludedNetworks', newExcludedNetworks)
                          }
                          
                          // Если добавляем конкретную сеть, удаляем "Все сети"
                          const newNetworks = targetNetworks.filter(id => id !== 'all_chains')
                          updateConfig('collection.targetNetworks', [...newNetworks, e.target.value])
                        }
                      }
                      e.target.value = '' // Сбрасываем выбор
                    }
                  }}
                  className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Добавить целевую сеть</option>
                  {SWAP_TARGET_NETWORKS
                    .filter(network => {
                      // Исключаем сети, которые уже в целевых сетях
                      if (config.collection?.targetNetworks?.includes(network.id)) {
                        return false
                      }
                      // Исключаем сети, которые выбраны в исключениях
                      const excludedNetworks = config.excludedNetworks || []
                      if (excludedNetworks.includes(network.id)) {
                        return false
                      }
                      return true
                    })
                    .map((network) => (
                      <option key={network.id} value={network.id}>
                        {network.name}
                      </option>
                    ))}
                </select>
                
                {config.collection?.targetNetworks?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Целевые сети ({config.collection.targetNetworks.length}):
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {config.collection.targetNetworks.map((networkId) => {
                        const network = SWAP_TARGET_NETWORKS.find(n => n.id === networkId)
                        return (
                          <div
                            key={networkId}
                            className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm"
                          >
                            {networkId === 'all_chains' ? (
                              <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">
                                🌐
                              </span>
                            ) : (
                              <img 
                                src={network?.logo_url} 
                                alt={network?.symbol} 
                                className="w-4 h-4"
                                onError={(e) => {
                                  // Fallback к текстовому символу если изображение не загрузилось
                                  e.target.style.display = 'none';
                                  const fallback = document.createElement('span');
                                  fallback.className = 'w-4 h-4 flex items-center justify-center text-xs font-bold';
                                  fallback.textContent = network?.symbol?.charAt(0) || '?';
                                  e.target.parentNode.insertBefore(fallback, e.target);
                                }}
                              />
                            )}
                            <span>{network?.name || networkId}</span>
                            <button
                              onClick={() => {
                                const targetNetworks = config.collection?.targetNetworks || []
                                updateConfig('collection.targetNetworks', targetNetworks.filter(id => id !== networkId))
                              }}
                              className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {config.collection.targetNetworks.length > 1 && (
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          🎲 Случайный выбор между {config.collection.targetNetworks.length} сетями для каждого кошелька
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Excluded networks */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              🚫 Исключенные сети
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Выберите сети, которые нужно пропускать при обработке
            </p>
            
            <div className="space-y-3">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    const excluded = config.excludedNetworks || []
                    if (!excluded.includes(e.target.value)) {
                      // Удаляем сеть из целевых сетей, если она там есть
                      const targetNetworks = config.collection?.targetNetworks || []
                      const newTargetNetworks = targetNetworks.filter(id => id !== e.target.value)
                      if (newTargetNetworks.length !== targetNetworks.length) {
                        updateConfig('collection.targetNetworks', newTargetNetworks)
                      }
                      
                      updateConfig('excludedNetworks', [...excluded, e.target.value])
                    }
                    e.target.value = '' // Сбрасываем выбор
                  }
                }}
                className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Добавить сеть в исключения</option>
                {SUPPORTED_NETWORKS
                  .filter(network => {
                    // Исключаем сети, которые уже в исключениях
                    if (config.excludedNetworks?.includes(network.id)) {
                      return false
                    }
                    // Исключаем сети, которые выбраны в целевых сетях
                    const targetNetworks = config.collection?.targetNetworks || []
                    if (targetNetworks.includes(network.id)) {
                      return false
                    }
                    return true
                  })
                  .map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
              </select>
              
              {config.excludedNetworks?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Исключённые сети ({config.excludedNetworks.length}):
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {config.excludedNetworks.map((networkId) => {
                      const network = SUPPORTED_NETWORKS.find(n => n.id === networkId)
                      return (
                        <div
                          key={networkId}
                          className="flex items-center gap-2 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-full text-sm"
                        >
                          <img 
                            src={network?.logo_url} 
                            alt={network?.symbol} 
                            className="w-4 h-4"
                            onError={(e) => {
                              // Fallback к текстовому символу если изображение не загрузилось
                              e.target.style.display = 'none';
                              const fallback = document.createElement('span');
                              fallback.className = 'w-4 h-4 flex items-center justify-center text-xs font-bold';
                              fallback.textContent = network?.symbol?.charAt(0) || '?';
                              e.target.parentNode.insertBefore(fallback, e.target);
                            }}
                          />
                          <span>{network?.name || networkId}</span>
                          <button
                            onClick={() => {
                              const excluded = config.excludedNetworks || []
                              updateConfig('excludedNetworks', excluded.filter(id => id !== networkId))
                            }}
                            className="hover:bg-red-200 dark:hover:bg-red-800 rounded-full p-0.5"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ethereum mainnet settings */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              ⛽ Ethereum Mainnet
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Ethereum mainnet по умолчанию отключён из-за высокой стоимости транзакций. Включайте только при необходимости.
            </p>
            
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableEthMainnet || false}
                  onChange={(e) => updateConfig('enableEthMainnet', e.target.checked)}
                  className="mr-3 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Включить Ethereum Mainnet
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {config.enableEthMainnet ? 
                      '⚠️ Ethereum mainnet включён - будьте осторожны с комиссиями' : 
                      '✅ Ethereum mainnet отключён - комиссии сэкономлены'
                    }
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Delay settings */}
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              ⏱️ Настройки задержек
            </h2>
            
            <div className="space-y-6">
              {/* Transaction delays */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Задержка между транзакциями (сек)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">От</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={Math.round((config.transaction?.delayMinMs || 60000) / 1000)}
                      onChange={(e) => updateConfig('transaction.delayMinMs', parseInt(e.target.value) * 1000)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">До</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={Math.round((config.transaction?.delayMaxMs || 120000) / 1000)}
                      onChange={(e) => updateConfig('transaction.delayMaxMs', parseInt(e.target.value) * 1000)}
                      className="input"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Случайная пауза между операциями для стабильности
                </p>
              </div>
              
              {/* Wallet delays */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Задержка между кошельками (сек)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">От</label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={Math.round((config.transaction?.walletDelayMinMs || 120000) / 1000)}
                      onChange={(e) => updateConfig('transaction.walletDelayMinMs', parseInt(e.target.value) * 1000)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">До</label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={Math.round((config.transaction?.walletDelayMaxMs || 300000) / 1000)}
                      onChange={(e) => updateConfig('transaction.walletDelayMaxMs', parseInt(e.target.value) * 1000)}
                      className="input"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Случайная пауза между обработкой кошельков
                </p>
              </div>
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
                <span className="text-gray-600 dark:text-gray-400">Режим:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {config.collection?.mode === 'collect_to_target' ? 'Сбор' : 'Свапы'}
                </span>
              </div>
              
              {config.collection?.mode === 'collect_to_target' && config.collection?.targetNetworks?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Целевые сети:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {config.collection.targetNetworks.length === 1 
                      ? TARGET_NETWORKS.find(n => n.id === config.collection.targetNetworks[0])?.name 
                      : `${config.collection.targetNetworks.length} сетей (случайно)`}
                  </span>
                </div>
              )}
              
              {config.collection?.mode === 'swap_to_native' && config.collection?.targetNetworks?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Целевые сети:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {config.collection.targetNetworks.length === 1 && config.collection.targetNetworks[0] === 'all_chains'
                      ? 'Все сети'
                      : config.collection.targetNetworks.length === 1
                      ? SWAP_TARGET_NETWORKS.find(n => n.id === config.collection.targetNetworks[0])?.name 
                      : `${config.collection.targetNetworks.length} сетей (случайно)`}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Исключенных сетей:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {config.excludedNetworks?.length || 0}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Ethereum Mainnet:</span>
                <span className={`font-medium ${config.enableEthMainnet ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                  {config.enableEthMainnet ? '⚠️ Включён' : '✅ Отключён'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Задержка транзакций:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {Math.round((config.transaction?.delayMinMs || 60000) / 1000)}-{Math.round((config.transaction?.delayMaxMs || 120000) / 1000)} сек
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Задержка кошельков:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {Math.round((config.transaction?.walletDelayMinMs || 120000) / 1000)}-{Math.round((config.transaction?.walletDelayMaxMs || 300000) / 1000)} сек
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BridgeAndSwapPage 