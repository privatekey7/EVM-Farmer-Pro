import React, { useState, useEffect } from 'react'
import { Wallet, RefreshCw, AlertTriangle } from 'lucide-react'
import { walletsAPI } from '../utils/api'
import toast from 'react-hot-toast'

const WalletStats = ({ className = '', showRefresh = false }) => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadStats = async () => {
    try {
      const response = await walletsAPI.getStats()
      setStats(response.data.stats)
    } catch (error) {
      console.error('Ошибка загрузки статистики кошельков:', error)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const refreshStats = async () => {
    setRefreshing(true)
    try {
      await loadStats()
      toast.success('Статистика кошельков обновлена')
    } catch (error) {
      toast.error('Ошибка обновления статистики')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
        <div className="flex items-center">
          <AlertTriangle className="h-8 w-8 text-warning-600 dark:text-warning-400 mr-3" />
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Кошельки</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              Файл не найден
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Wallet className="h-8 w-8 text-primary-600 dark:text-primary-400 mr-3" />
          <div>
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Загруженных кошельков
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {stats?.validWallets || 0}
              </p>
              {stats?.invalidWallets > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {stats.invalidWallets} {stats.invalidWallets === 1 ? 'ключ не верный' : 'ключей не верных'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Кнопка обновления */}
        {showRefresh && (
          <button
            onClick={refreshStats}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Обновить статистику"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  )
}

export default WalletStats 