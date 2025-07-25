import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import toast from 'react-hot-toast';
import { getSupportedNetworks } from '../utils/nativeTokens.js';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Play } from 'lucide-react';
import WalletStats from '../components/WalletStats';
import SubAccountStats from '../components/SubAccountStats';
import { subTransferAPI } from '../utils/api';

function SubTransferPage() {
  const { isConnected } = useWebSocket();
  const [isCollecting, setIsCollecting] = useState(false);
  const [transferPercent, setTransferPercent] = useState('100');
  const [isRandom, setIsRandom] = useState(false);
  const [minPercent, setMinPercent] = useState('');
  const [maxPercent, setMaxPercent] = useState('');
  const [selectedNetworks, setSelectedNetworks] = useState(['base']);
  const [supportedNetworks, setSupportedNetworks] = useState([]);
  
  // Настройки задержки для коллектора
  const [delayMinMs, setDelayMinMs] = useState('60000');
  const [delayMaxMs, setDelayMaxMs] = useState('120000');
  const [walletDelayMinMs, setWalletDelayMinMs] = useState('120000');
  const [walletDelayMaxMs, setWalletDelayMaxMs] = useState('300000');
  const [isConfigValid, setIsConfigValid] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [subAccountsInfo, setSubAccountsInfo] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    // Загружаем список поддерживаемых сетей
    const networks = getSupportedNetworks();
    setSupportedNetworks(networks);
    // Если selectedNetworks пуст, выбираем base если она есть
    if (selectedNetworks.length === 0 && networks.some(n => n.id === 'base')) {
      setSelectedNetworks(['base']);
    }
  }, []);



  // Функция для обработки изменений данных о субаккаунтах
  const handleSubAccountsDataChange = (data) => {
    setSubAccountsInfo(data);
  };

  // Валидация конфигурации при изменении параметров
  useEffect(() => {
    validateConfigClient();
  }, [selectedNetworks, transferPercent, isRandom, minPercent, maxPercent, delayMinMs, delayMaxMs, walletDelayMinMs, walletDelayMaxMs, subAccountsInfo]);

  // Обработчик добавления сети
  const handleAddNetwork = (networkId) => {
    if (networkId && !selectedNetworks.includes(networkId)) {
      setSelectedNetworks(prev => [...prev, networkId]);
    }
  };

  // Обработчик удаления сети
  const handleRemoveNetwork = (networkId) => {
    setSelectedNetworks(prev => prev.filter(id => id !== networkId));
  };

  // Вспомогательные функции для проверки конкретных полей
  const getTransferPercentError = () => {
    if (isRandom) return null;
    if (!transferPercent || transferPercent === '') {
      return 'Введите процент перевода';
    }
    const percent = parseInt(transferPercent);
    if (isNaN(percent) || percent < 1 || percent > 100) {
      return 'Процент перевода должен быть от 1% до 100%';
    }
    return null;
  };

  const getMinPercentError = () => {
    if (!isRandom) return null;
    if (!minPercent || minPercent === '') {
      return 'Введите минимальный процент';
    }
    const min = parseInt(minPercent);
    if (isNaN(min) || min < 1 || min > 100) {
      return 'Минимальный процент должен быть от 1% до 100%';
    }
    return null;
  };

  const getMaxPercentError = () => {
    if (!isRandom) return null;
    if (!maxPercent || maxPercent === '') {
      return 'Введите максимальный процент';
    }
    const max = parseInt(maxPercent);
    const min = parseInt(minPercent);
    if (isNaN(max) || max < 1 || max > 100) {
      return 'Максимальный процент должен быть от 1% до 100%';
    }
    if (!isNaN(min) && min >= max) {
      return 'Максимальный процент должен быть больше минимального';
    }
    return null;
  };

  const getTransactionDelayError = () => {
    if (!delayMinMs || delayMinMs === '' || !delayMaxMs || delayMaxMs === '') {
      return 'Введите значения задержки';
    }
    const min = parseInt(delayMinMs);
    const max = parseInt(delayMaxMs);
    if (isNaN(min) || isNaN(max)) {
      return 'Введите корректные значения задержки';
    }
    if (min >= max) {
      return 'Минимальная задержка должна быть меньше максимальной';
    }
    if (min < 1000 || max < 1000) {
      return 'Задержка должна быть не менее 1 секунды';
    }
    return null;
  };

  const getWalletDelayError = () => {
    if (!walletDelayMinMs || walletDelayMinMs === '' || !walletDelayMaxMs || walletDelayMaxMs === '') {
      return 'Введите значения задержки';
    }
    const min = parseInt(walletDelayMinMs);
    const max = parseInt(walletDelayMaxMs);
    if (isNaN(min) || isNaN(max)) {
      return 'Введите корректные значения задержки';
    }
    if (min >= max) {
      return 'Минимальная задержка должна быть меньше максимальной';
    }
    if (min < 1000 || max < 1000) {
      return 'Задержка должна быть не менее 1 секунды';
    }
    return null;
  };

  // Клиентская валидация конфигурации
  const validateConfigClient = () => {
    const errors = [];

    // Проверяем, что выбрана хотя бы одна сеть
    if (selectedNetworks.length === 0) {
      errors.push('Выберите хотя бы одну сеть для отправки');
    }

    // Проверяем наличие и корректность субаккаунтов
    if (!subAccountsInfo) {
      errors.push('Не удалось загрузить информацию о субаккаунтах');
    } else if (subAccountsInfo.stats.invalidAccounts > 0) {
      errors.push(`Найдено ${subAccountsInfo.stats.invalidAccounts} невалидных адресов в sub_accs.txt`);
    }

    // Проверяем процент перевода для фиксированного режима
    if (!isRandom) {
      if (!transferPercent || transferPercent === '') {
        errors.push('Введите процент перевода');
      } else {
        const percent = parseInt(transferPercent);
        if (isNaN(percent) || percent < 1 || percent > 100) {
          errors.push('Процент перевода должен быть от 1% до 100%');
        }
      }
    }

    // Проверяем случайный процент
    if (isRandom) {
      if (!minPercent || minPercent === '') {
        errors.push('Введите минимальный процент');
      } else {
        const min = parseInt(minPercent);
        if (isNaN(min) || min < 1 || min > 100) {
          errors.push('Минимальный процент должен быть от 1% до 100%');
        }
      }
      
      if (!maxPercent || maxPercent === '') {
        errors.push('Введите максимальный процент');
      } else {
        const max = parseInt(maxPercent);
        if (isNaN(max) || max < 1 || max > 100) {
          errors.push('Максимальный процент должен быть от 1% до 100%');
        }
      }
      
      const min = parseInt(minPercent);
      const max = parseInt(maxPercent);
      if (!isNaN(min) && !isNaN(max) && min >= max) {
        errors.push('Минимальный процент должен быть меньше максимального');
      }
    }

    // Проверяем задержки между транзакциями
    if (!delayMinMs || delayMinMs === '' || !delayMaxMs || delayMaxMs === '') {
      errors.push('Введите значения задержки между транзакциями');
    } else {
      const transactionMin = parseInt(delayMinMs);
      const transactionMax = parseInt(delayMaxMs);
      if (isNaN(transactionMin) || isNaN(transactionMax)) {
        errors.push('Введите корректные значения задержки между транзакциями');
      } else {
        if (transactionMin >= transactionMax) {
          errors.push('Минимальная задержка между транзакциями должна быть меньше максимальной');
        }
        if (transactionMin < 1000 || transactionMax < 1000) {
          errors.push('Задержка между транзакциями должна быть не менее 1 секунды');
        }
      }
    }

    // Проверяем задержки между кошельками
    if (!walletDelayMinMs || walletDelayMinMs === '' || !walletDelayMaxMs || walletDelayMaxMs === '') {
      errors.push('Введите значения задержки между кошельками');
    } else {
      const walletMin = parseInt(walletDelayMinMs);
      const walletMax = parseInt(walletDelayMaxMs);
      if (isNaN(walletMin) || isNaN(walletMax)) {
        errors.push('Введите корректные значения задержки между кошельками');
      } else {
        if (walletMin >= walletMax) {
          errors.push('Минимальная задержка между кошельками должна быть меньше максимальной');
        }
        if (walletMin < 1000 || walletMax < 1000) {
          errors.push('Задержка между кошельками должна быть не менее 1 секунды');
        }
      }
    }

    setValidationErrors(errors);
    setIsConfigValid(errors.length === 0);
    return errors.length === 0;
  };

  const startCollection = async () => {
    // Проверяем валидность конфигурации перед запуском
    if (!validateConfigClient()) {
      toast.error('Пожалуйста, исправьте ошибки в конфигурации');
      return;
    }

    if (selectedNetworks.length === 0) {
      toast.error('Пожалуйста, выберите хотя бы одну сеть для отправки');
      return;
    }

    // Проверяем субаккаунты
    if (!subAccountsInfo) {
      toast.error('Не удалось загрузить информацию о субаккаунтах');
      return;
    }
    
    if (subAccountsInfo.stats.invalidAccounts > 0) {
      toast.error(`Найдено ${subAccountsInfo.stats.invalidAccounts} невалидных адресов. Исправьте файл sub_accs.txt`);
      return;
    }
    
    if (subAccountsInfo.stats.totalAccounts === 0) {
      toast.error('Не найдены валидные субаккаунты. Добавьте адреса в файл sub_accs.txt');
      return;
    }

    setIsCollecting(true);
    
    try {
      const config = {
        transferPercent: parseInt(transferPercent),
        isRandom,
        minPercent: parseInt(minPercent),
        maxPercent: parseInt(maxPercent),
        selectedNetworks: selectedNetworks,
        delayMinMs: parseInt(delayMinMs),
        delayMaxMs: parseInt(delayMaxMs),
        walletDelayMinMs: parseInt(walletDelayMinMs),
        walletDelayMaxMs: parseInt(walletDelayMaxMs),
      };

      const response = await fetch('/api/collector/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (!data.success) {
        toast.error(data.message);
      } else {
        toast.success(data.message);
        // Перенаправляем на страницу мониторинга
        navigate('/monitoring');
      }
    } catch (error) {
      console.error('Ошибка запуска отправки:', error);
      toast.error('Ошибка запуска отправки');
    } finally {
      setIsCollecting(false);
    }
  };



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Отправка нативных токенов</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Автоматическая отправка нативных токенов на субаккаунты
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={startCollection}
            disabled={isCollecting || !isConfigValid || !isConnected || !subAccountsInfo || subAccountsInfo.stats.invalidAccounts > 0}
            className="btn-success"
          >
            <Play className="h-4 w-4 mr-2" />
            {isCollecting ? 'Отправка запущена...' : 'Запуск'}
          </button>
        </div>
      </div>

      {/* Configuration validation status */}
      {isConfigValid && !isCollecting && (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-success-400 mr-2" />
            <span className="text-sm font-medium text-success-800 dark:text-success-200">
              Конфигурация SubTransfer валидна
            </span>
          </div>
        </div>
      )}

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

      {/* Wallet Stats and SubAccount Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <WalletStats showRefresh={true} />
        <SubAccountStats showRefresh={true} onDataChange={handleSubAccountsDataChange} />
      </div>

      <div className="space-y-6">
          {/* Transfer Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            ⚙️ Настройки перевода
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Процент перевода
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={transferPercent}
                  onChange={(e) => setTransferPercent(e.target.value)}
                  className={`input ${getTransferPercentError() ? 'border-error-500' : ''}`}
                  disabled={isRandom}
                />
                {getTransferPercentError() && (
                  <p className="text-xs text-error-600 dark:text-error-400 mt-1">
                    {getTransferPercentError()}
                  </p>
                )}
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="random"
                  checked={isRandom}
                  onChange={(e) => setIsRandom(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="random" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Случайный процент
                </label>
              </div>
            </div>

            {isRandom && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Минимальный процент
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={minPercent}
                    onChange={(e) => setMinPercent(e.target.value)}
                    className={`input ${getMinPercentError() ? 'border-error-500' : ''}`}
                  />
                  {getMinPercentError() && (
                    <p className="text-xs text-error-600 dark:text-error-400 mt-1">
                      {getMinPercentError()}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Максимальный процент
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maxPercent}
                    onChange={(e) => setMaxPercent(e.target.value)}
                    className={`input ${getMaxPercentError() ? 'border-error-500' : ''}`}
                  />
                  {getMaxPercentError() && (
                    <p className="text-xs text-error-600 dark:text-error-400 mt-1">
                      {getMaxPercentError()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Delay Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              ⏱️ Настройки задержки
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Задержка между транзакциями (секунды)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Минимум</label>
                    <input
                      type="number"
                      min="1"
                      value={delayMinMs ? Math.round(parseInt(delayMinMs) / 1000) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !isNaN(parseInt(value))) {
                          setDelayMinMs((parseInt(value) * 1000).toString());
                        } else {
                          setDelayMinMs('');
                        }
                      }}
                      className={`input ${getTransactionDelayError() ? 'border-error-500' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Максимум</label>
                    <input
                      type="number"
                      min="1"
                      value={delayMaxMs ? Math.round(parseInt(delayMaxMs) / 1000) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !isNaN(parseInt(value))) {
                          setDelayMaxMs((parseInt(value) * 1000).toString());
                        } else {
                          setDelayMaxMs('');
                        }
                      }}
                      className={`input ${getTransactionDelayError() ? 'border-error-500' : ''}`}
                    />
                  </div>
                </div>
                {getTransactionDelayError() && (
                  <p className="text-xs text-error-600 dark:text-error-400 mt-1">
                    {getTransactionDelayError()}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Задержка между кошельками (секунды)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Минимум</label>
                    <input
                      type="number"
                      min="1"
                      value={walletDelayMinMs ? Math.round(parseInt(walletDelayMinMs) / 1000) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !isNaN(parseInt(value))) {
                          setWalletDelayMinMs((parseInt(value) * 1000).toString());
                        } else {
                          setWalletDelayMinMs('');
                        }
                      }}
                      className={`input ${getWalletDelayError() ? 'border-error-500' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Максимум</label>
                    <input
                      type="number"
                      min="1"
                      value={walletDelayMaxMs ? Math.round(parseInt(walletDelayMaxMs) / 1000) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !isNaN(parseInt(value))) {
                          setWalletDelayMaxMs((parseInt(value) * 1000).toString());
                        } else {
                          setWalletDelayMaxMs('');
                        }
                      }}
                      className={`input ${getWalletDelayError() ? 'border-error-500' : ''}`}
                    />
                  </div>
                </div>
                {getWalletDelayError() && (
                  <p className="text-xs text-error-600 dark:text-error-400 mt-1">
                    {getWalletDelayError()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Network Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              🌐 Выбор сетей для отправки
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Выберите сети, из которых хотите отправить нативные токены. <span className="text-warning-600 dark:text-warning-400 font-semibold">Убедитесь, что ваша биржа поддерживает депозит в выбранные сети!</span>
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Добавить сеть для отправки
              </label>
              <select
                onChange={(e) => handleAddNetwork(e.target.value)}
                value=""
                className="input"
              >
                <option value="">Выберите сеть...</option>
                {supportedNetworks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name} ({network.symbol})
                  </option>
                ))}
              </select>
            </div>

            {selectedNetworks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Выбранные сети:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedNetworks.map((networkId) => {
                    const network = supportedNetworks.find((n) => n.id === networkId);
                    return (
                      <div
                        key={networkId}
                        className="flex items-center bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm"
                      >
                        <img 
                          src={network?.logo_url} 
                          alt={network?.symbol} 
                          className="w-4 h-4 mr-2"
                          onError={(e) => {
                            // Fallback к текстовому символу если изображение не загрузилось
                            e.target.style.display = 'none';
                            const fallback = document.createElement('span');
                            fallback.className = 'w-4 h-4 flex items-center justify-center text-xs font-bold mr-2';
                            fallback.textContent = network?.symbol?.charAt(0) || '?';
                            e.target.parentNode.insertBefore(fallback, e.target);
                          }}
                        />
                        <span>{network?.name || networkId}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveNetwork(networkId)}
                          className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5 ml-1"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                
                {/* Информация о мультисетевой отправке */}
                {selectedNetworks.length > 1 && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>🎯 Мультисетевая отправка:</strong> Система проверит баланс в каждой выбранной сети и отправит нативные токены из сетей, где они есть.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                      Сети: {selectedNetworks.map(networkId => {
                        const network = supportedNetworks.find(n => n.id === networkId);
                        return `${network?.name} (${network?.symbol})` || networkId;
                      }).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              📖 Как это работает
            </h2>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Выберите сети, из которых хотите отправить нативные токены
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Система проверит баланс в каждой выбранной сети
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Отправит указанный процент баланса на субаккаунты
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                При выборе 100% - переведет весь баланс за вычетом комиссии за газ
              </li>

              <li className="flex items-start">
                <span className="text-warning-500 mr-2">⚠️</span>
                <span className="text-warning-600 dark:text-warning-400 font-semibold">
                  Убедитесь, что ваша биржа поддерживает депозит в выбранные сети!
                </span>
              </li>
            </ul>
          </div>

          
        </div>
    </div>
  );
}

export default SubTransferPage; 