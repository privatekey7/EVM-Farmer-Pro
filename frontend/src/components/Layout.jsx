import React from 'react'
import { NavLink } from 'react-router-dom'
import { 
  Settings, 
  Activity, 
  Target,
  DollarSign,
  Wifi, 
  WifiOff,
  Zap,
  Play,
  Square,
  Sun,
  Moon
} from 'lucide-react'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../utils/cn'

const Layout = ({ children }) => {
  const { isConnected, bridgeStatus } = useWebSocket()
  const { isDark, toggleTheme } = useTheme()

  const navItems = [
    {
      to: '/bridge_and_swap',
      icon: Settings,
      label: 'Bridge & Swap'
    },
    {
      to: '/subtransfer',
      icon: Target,
      label: 'SubTransfer'
    },
    {
      to: '/stablefix',
      icon: DollarSign,
      label: 'StableFix'
    },
    {
      to: '/monitoring',
      icon: Activity,
      label: 'Мониторинг'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Zap className="h-8 w-8 text-primary-600 dark:text-primary-400 mr-3" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  EVM Farmer Pro
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Профессиональная платформа для автоматизации
                </p>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center space-x-4">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-yellow-500" />
                ) : (
                  <Moon className="h-4 w-4 text-gray-600" />
                )}
              </button>

              {/* Connection status */}
              <div className="flex items-center">
                {isConnected ? (
                  <div className="flex items-center text-success-600 dark:text-success-400">
                    <Wifi className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">Подключен</span>
                  </div>
                ) : (
                  <div className="flex items-center text-error-600 dark:text-error-400">
                    <WifiOff className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">Отключен</span>
                  </div>
                )}
              </div>

              {/* Bridge status */}
              <div className="flex items-center">
                {bridgeStatus.isRunning ? (
                  <div className="flex items-center text-warning-600 dark:text-warning-400">
                    <Play className="h-4 w-4 mr-1 animate-pulse" />
                    <span className="text-sm font-medium">Выполняется</span>
                  </div>
                ) : (
                  <div className="flex items-center text-gray-500 dark:text-gray-400">
                    <Square className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">Остановлен</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar navigation */}
          <aside className="w-64 flex-shrink-0">
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                      )
                    }
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>

            {/* Progress indicator (when bridge is running) */}
            {bridgeStatus.isRunning && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Прогресс выполнения
                </h3>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                  <div 
                    className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${bridgeStatus.progress.total > 0 
                        ? (bridgeStatus.progress.completed / bridgeStatus.progress.total) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    {bridgeStatus.progress.completed} / {bridgeStatus.progress.total}
                  </span>
                  <span>
                    {bridgeStatus.progress.total > 0 
                      ? Math.round((bridgeStatus.progress.completed / bridgeStatus.progress.total) * 100)
                      : 0}%
                  </span>
                </div>
                
                {bridgeStatus.currentWallet && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="truncate">
                      🔄 {bridgeStatus.currentWallet}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Statistics */}
            {bridgeStatus.stats && (bridgeStatus.stats.successful > 0 || bridgeStatus.stats.failed > 0) && (
              <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Статистика
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Успешно:</span>
                    <span className="text-success-600 dark:text-success-400 font-medium">
                      {bridgeStatus.stats.successful}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Ошибки:</span>
                    <span className="text-error-600 dark:text-error-400 font-medium">
                      {bridgeStatus.stats.failed}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Page content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

export default Layout 