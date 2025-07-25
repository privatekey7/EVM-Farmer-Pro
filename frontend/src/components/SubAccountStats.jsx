import React, { useState, useEffect } from 'react'
import { Users, RefreshCw, AlertTriangle } from 'lucide-react'
import { subTransferAPI } from '../utils/api'
import toast from 'react-hot-toast'

const SubAccountStats = ({ className = '', showRefresh = false, onDataChange = null }) => {
  const [subAccountsInfo, setSubAccountsInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showSubAccountDetails, setShowSubAccountDetails] = useState(false)

  const loadSubAccountsInfo = async () => {
    try {
      console.log('Загружаем информацию о субаккаунтах...')
      const response = await subTransferAPI.getSubAccounts()
      console.log('Ответ API:', response)
      if (response.data && response.data.success) {
        setSubAccountsInfo(response.data)
        if (onDataChange) {
          onDataChange(response.data)
        }
      } else {
        console.error('API вернул ошибку:', response.data)
        setSubAccountsInfo(null)
        if (onDataChange) {
          onDataChange(null)
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки информации о субаккаунтах:', error)
      console.error('Детали ошибки:', error.response?.data || error.message)
      setSubAccountsInfo(null)
      if (onDataChange) {
        onDataChange(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const refreshStats = async () => {
    setRefreshing(true)
    try {
      await loadSubAccountsInfo()
      toast.success('Информация о субаккаунтах обновлена')
    } catch (error) {
      toast.error('Ошибка обновления информации о субаккаунтах')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSubAccountsInfo()
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

  if (!subAccountsInfo) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
        <div className="flex items-center">
          <Users className="h-8 w-8 text-blue-500 dark:text-blue-400 mr-3" />
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Субаккаунты</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              0
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Не забудьте указать субаккаунты в sub_accs.txt
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
          <Users className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Субаккаунтов
            </p>
            <div className="flex items-center space-x-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {subAccountsInfo?.stats?.totalAccounts || 0}
              </p>
                             {subAccountsInfo && subAccountsInfo.stats.totalAccounts === 0 && subAccountsInfo.stats.totalLines > 0 && (
                 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                   <AlertTriangle className="h-3 w-3 mr-1" />
                   Файл пуст
                 </span>
               )}
              {subAccountsInfo && subAccountsInfo.stats.invalidAccounts > 0 && (
                <div className="relative">
                  <span 
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200 cursor-help"
                    onMouseEnter={() => setShowSubAccountDetails(true)}
                    onMouseLeave={() => setShowSubAccountDetails(false)}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {subAccountsInfo.stats.invalidAccounts} {subAccountsInfo.stats.invalidAccounts === 1 ? 'адрес неверный' : 'адресов неверных'}
                  </span>
                  
                  {/* Tooltip с деталями */}
                  {showSubAccountDetails && subAccountsInfo.invalidAccounts && (
                    <div className="absolute z-10 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                      <div className="text-xs font-medium text-gray-900 dark:text-white mb-2">
                        Невалидные адреса:
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {subAccountsInfo.invalidAccounts.map((invalid, index) => (
                          <div key={index} className="text-xs text-red-600 dark:text-red-400">
                            Строка {invalid.line}: "{invalid.address}" - {invalid.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Мягкое предупреждение для пустого файла */}
            {subAccountsInfo && subAccountsInfo.stats.totalAccounts === 0 && subAccountsInfo.stats.totalLines === 0 && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Не забудьте указать субаккаунты в sub_accs.txt
              </p>
            )}
          </div>
        </div>

        {/* Кнопка обновления */}
        {showRefresh && (
          <button
            onClick={refreshStats}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Обновить информацию о субаккаунтах"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  )
}

export default SubAccountStats 