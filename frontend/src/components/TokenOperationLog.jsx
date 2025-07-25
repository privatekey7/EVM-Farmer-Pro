import React from 'react';
import { CheckCircle, AlertCircle, Activity, ArrowRight } from 'lucide-react';

const TokenOperationLog = ({ log }) => {
  // Если это не операция с токеном, возвращаем обычное отображение
  if (typeof log.message !== 'object' || log.message.type !== 'token_operation') {
    return (
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getLogIcon(log.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
          </div>
        </div>
      </div>
    );
  }

  const { operation, data } = log.message;
  const { token, chain, target, status, output, error, reason, from, to } = data;

  const getOperationIcon = () => {
    switch (operation) {
      case 'swap':
        return '🔄';
      case 'bridge':
        return '🌉';
      case 'unwrap':
        return '🔓';
      default:
        return '⚡';
    }
  };

  const getOperationText = () => {
    switch (operation) {
      case 'swap':
        return 'Свап';
      case 'bridge':
        return 'Бридж';
      case 'unwrap':
        return 'Анврап';
      default:
        return 'Отправка';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'error':
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'started':
        return 'text-blue-600 dark:text-blue-400';
      case 'skipped':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'started':
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'success':
        return 'Выполнено';
      case 'error':
      case 'failed':
        return 'Ошибка';
      case 'started':
        return 'Выполняется';
      case 'skipped':
        return 'Пропущено';
      default:
        return 'Неизвестно';
    }
  };

  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="flex items-center space-x-3 p-3 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
      {/* Иконка токена */}
      <div className="flex-shrink-0">
        {token.logo_url ? (
          <img 
            src={token.logo_url} 
            alt={token.symbol}
            className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300"
          style={{ display: token.logo_url ? 'none' : 'flex' }}
        >
          {token.symbol.substring(0, 2)}
        </div>
      </div>

      {/* Информация об операции */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {getOperationIcon()} {getOperationText()}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {token.amount} {token.symbol}
          </span>
          {token.usd_value && parseFloat(token.usd_value) > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (${token.usd_value})
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2 mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {from ? shortenAddress(from) : chain}
          </span>
          <ArrowRight className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {to ? shortenAddress(to) : (target === 'субакаунт' ? 'субакаунт' : target)}
          </span>
          {output && (
            <>
              <span className="text-xs text-gray-400">→</span>
              <span className="text-xs text-green-600 dark:text-green-400">
                {output}
              </span>
            </>
          )}
        </div>

        {(error || reason) && (
          <div className={`mt-1 text-xs ${
            status === 'skipped' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {reason || error}
          </div>
        )}
      </div>

      {/* Статус операции */}
      <div className="flex flex-col items-end space-y-1 mr-12">
        <div className="flex items-center space-x-1">
          <span className={`text-xs ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {getStatusIcon()}
        </div>
      </div>
    </div>
  );
};

// Функция для обычных логов
const getLogIcon = (type) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-success-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-error-500" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-warning-500" />;
    default:
      return <Activity className="h-4 w-4 text-blue-500" />;
  }
};

export default TokenOperationLog; 