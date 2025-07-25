import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { statsAPI } from '../utils/api'

const WebSocketContext = createContext()

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState({
    isRunning: false,
    currentWallet: null,
    currentNetwork: null,
    progress: { completed: 0, total: 0 },
    logs: [],
    startTime: null,
    stats: { successful: 0, failed: 0 }
  })
  const [logs, setLogs] = useState([])
  
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = () => {
    try {
      const wsUrl = `ws://${window.location.hostname}:3001`
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('WebSocket подключен')
        setIsConnected(true)
        reconnectAttempts.current = 0
        
        // Убираем предыдущие уведомления об ошибках
        toast.dismiss('ws-error')
        toast.dismiss('ws-connection-failed')
        
        toast.success('Подключение к локальному серверу установлено', {
          id: 'ws-connection',
          duration: 3000
        })
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          switch (message.type) {
            case 'status':
              if (message.data && typeof message.data === 'object') {
                setBridgeStatus(message.data)
              } else {
                console.warn('Некорректные данные статуса:', message.data)
              }
              break
              
            case 'log':
              const logEntry = message.data
              if (logEntry && typeof logEntry === 'object' && logEntry.timestamp) {
                // Все логи идут в общий массив для страницы мониторинга
                const logMessage = typeof logEntry.message === 'string' ? logEntry.message : ''
                setLogs(prev => {
                  const newLogs = [...prev, logEntry]
                  return newLogs.slice(-500)
                })
                
                // Показываем важные логи как toast уведомления (только для строковых сообщений)
                if (typeof logEntry.message === 'string') {
                  const logMessage = logEntry.message;
                  
                  if (logEntry.type === 'error') {
                    toast.error(logMessage, { 
                      duration: 6000,
                      id: `error-${Date.now()}`
                    })
                  } else if (logEntry.type === 'success' && logMessage.includes('завершен')) {
                    toast.success(logMessage, {
                      duration: 4000,
                      id: `success-${Date.now()}`
                    })
                  }
                }
                // Для объектных сообщений (операции с токенами) не показываем toast уведомления
              } else {
                console.warn('Некорректные данные лога:', logEntry)
              }
              break
              
            default:
              console.log('Неизвестный тип сообщения:', message.type)
          }
        } catch (error) {
          console.error('Ошибка парсинга WebSocket сообщения:', error, 'Данные:', event.data)
          // Не закрываем соединение из-за одной ошибки парсинга
        }
      }

      wsRef.current.onclose = (event) => {
        console.log('WebSocket отключен:', event.code, event.reason)
        setIsConnected(false)
        
        // Попытка переподключения
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
          
          console.log(`Переподключение через ${delay}ms (попытка ${reconnectAttempts.current}/${maxReconnectAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          toast.error('Не удалось подключиться к локальному серверу', {
            id: 'ws-connection-failed',
            duration: 5000
          })
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket ошибка:', error)
        
        // Показываем ошибку только при первой попытке подключения
        if (reconnectAttempts.current === 0 && !isConnected) {
          toast.error('Ошибка подключения к локальному серверу', {
            id: 'ws-error',
            duration: 4000
          })
        }
      }

    } catch (error) {
      console.error('Ошибка создания WebSocket соединения:', error)
      toast.error('Не удалось создать подключение к локальному серверу')
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    setIsConnected(false)
  }

  useEffect(() => {
    // Небольшая задержка перед первым подключением
    const timer = setTimeout(() => {
      connect()
    }, 500)

    return () => {
      clearTimeout(timer)
      disconnect()
    }
  }, [])

  const clearLogs = async () => {
    try {
      // Сбрасываем статистику на сервере
      await statsAPI.reset()
      
      // Очищаем логи локально
      setLogs([])
    } catch (error) {
      console.error('Ошибка сброса статистики:', error)
      // Даже если сброс статистики не удался, очищаем логи
      setLogs([])
    }
  }



  const value = {
    isConnected,
    bridgeStatus,
    logs,
    clearLogs,
    connect,
    disconnect
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
} 