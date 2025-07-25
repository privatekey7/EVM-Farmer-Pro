import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, 
  Square, 
  RotateCcw, 
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  TrendingUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import { bridgeAPI, stableFixAPI, subTransferAPI } from '../utils/api'
import { useWebSocket } from '../contexts/WebSocketContext'
import WalletStats from '../components/WalletStats'
import TokenOperationLog from '../components/TokenOperationLog'

const MonitoringPage = () => {
  const { bridgeStatus, logs, clearLogs, isConnected } = useWebSocket()
  const [stopping, setStopping] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef(null)

  // Автоскролл логов
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const stopBridge = async () => {
    setStopping(true)
    try {
      // Просто останавливаем все модули без проверки статуса
      const promises = [
        bridgeAPI.stopSilent(),
        stableFixAPI.stopSilent(),
        subTransferAPI.stopSilent()
      ]
      
      await Promise.all(promises)
      // Не показываем никаких уведомлений
    } catch (error) {
      console.error('Ошибка остановки:', error)
    } finally {
      setStopping(false)
    }
  }





  const getLogIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-error-500" />
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-warning-500" />
      default:
        return <Activity className="h-4 w-4 text-blue-500" />
    }
  }

  const getLogTextColor = (type) => {
    switch (type) {
      case 'success':
        return 'text-success-700 dark:text-success-300'
      case 'error':
        return 'text-error-700 dark:text-error-300'
      case 'warning':
        return 'text-warning-700 dark:text-warning-300'
      default:
        return 'text-gray-700 dark:text-gray-300'
    }
  }

  const getLogType = (message) => {
    if (typeof message !== 'string') return 'info'
    
    if (message.includes('✅') || message.includes('🎉') || message.includes('завершен') || message.includes('Выполнен') || message.includes('успешно')) {
      return 'success'
    } else if (message.includes('❌') || message.includes('ошибка') || message.includes('Error')) {
      return 'error'
    } else if (message.includes('⚠️') || message.includes('предупреждение') || message.includes('Недостаточно средств')) {
      return 'warning'
    } else {
      return 'info'
    }
  }

  const formatDuration = (startTime) => {
    if (!startTime) return '--'
    
    const start = new Date(startTime)
    const now = new Date()
    const diff = now - start
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Мониторинг</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Контроль выполнения операций
          </p>
        </div>
        
        <div className="flex space-x-3">
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mr-4">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-success-500' : 'bg-error-500'
            }`} />
            {isConnected ? 'Подключен' : 'Отключен'}
          </div>
          
          {bridgeStatus.isRunning && (
            <button
              onClick={stopBridge}
              disabled={stopping}
              className="btn-error"
            >
              <Square className="h-4 w-4 mr-2" />
              {stopping ? 'Остановка...' : 'Остановить'}
            </button>
          )}
        </div>
      </div>

      {/* Connection status warning */}
      {!isConnected && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-warning-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Нет подключения к локальному серверу
              </h3>
              <p className="text-sm text-warning-700 dark:text-warning-300 mt-1">
                Данные могут быть неактуальными. Проверьте, что локальный backend сервер запущен.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Stats */}
      <WalletStats showRefresh={true} />

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              bridgeStatus.isRunning ? 'bg-success-500 animate-pulse' : 'bg-gray-400'
            }`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Статус</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {bridgeStatus.isRunning ? 'Выполняется' : 'Остановлен'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Время выполнения</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {bridgeStatus.isRunning ? formatDuration(bridgeStatus.startTime) : '--'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-success-600 dark:text-success-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Успешно</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {bridgeStatus.stats?.successful || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-error-600 dark:text-error-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ошибки</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {bridgeStatus.stats?.failed || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress section */}
      {bridgeStatus.isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Прогресс выполнения</h2>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {bridgeStatus.progress?.completed || 0} / {bridgeStatus.progress?.total || 0} кошельков
            </span>
          </div>
          
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
            <div 
              className="bg-primary-600 dark:bg-primary-500 h-3 rounded-full transition-all duration-500"
              style={{ 
                width: `${bridgeStatus.progress?.total > 0 
                  ? (bridgeStatus.progress.completed / bridgeStatus.progress.total) * 100 
                  : 0}%` 
              }}
            />
          </div>
          
          {bridgeStatus.currentWallet && (
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded border border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Текущий кошелек:
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {bridgeStatus.currentWallet}
                  </div>
                </div>
                {bridgeStatus.currentNetwork && (
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Сеть:
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {bridgeStatus.currentNetwork.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}



      {/* Logs section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Логи ({logs.length})
            </h2>
            
            <div className="flex items-center space-x-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Автоскролл</span>
              </label>
              
              <button
                onClick={clearLogs}
                disabled={logs.length === 0}
                className="btn-sm btn-secondary"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Очистить
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Логи отсутствуют
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Запустите необходимый модуль для просмотра логов выполнения
              </p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '600px' }}>
              {logs.map((log, index) => (
                <div key={index} className="relative">
                  {/* Проверяем, является ли лог операцией с токеном */}
                  {typeof log.message === 'object' && log.message.type === 'token_operation' ? (
                    <div className="hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded relative">
                      <TokenOperationLog log={log} />
                      <div className="absolute top-2 right-2 text-xs text-gray-500 dark:text-gray-400 z-10 bg-gray-50 dark:bg-gray-700 px-1 rounded">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start space-x-3 p-3 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <div className="flex-shrink-0 mt-0.5">
                        {getLogIcon(getLogType(log.message))}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-medium ${getLogTextColor(getLogType(log.message))}`}>
                            {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 ml-2 bg-gray-50 dark:bg-gray-700 px-1 rounded">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MonitoringPage 