// Функция для задержки между транзакциями
async function transactionDelay() {
    // Получаем настройки из глобального объекта или используем значения по умолчанию
    let minDelayMs = 30000; // значение по умолчанию (30 сек)
    let maxDelayMs = 60000; // значение по умолчанию (60 сек)
    
    if (typeof global !== 'undefined' && global.getConfig) {
        try {
            const config = global.getConfig();
            minDelayMs = config.transaction?.delayMinMs || 30000;
            maxDelayMs = config.transaction?.delayMaxMs || 60000;
        } catch (error) {
            // Используем значения по умолчанию
        }
    }
    
    // Генерируем случайное число в диапазоне
    const delayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
    const delaySec = Math.round(delayMs / 1000);
    
    // Отправляем лог в UI (убрали дублирование с консолью)
    if (typeof global !== 'undefined' && global.broadcastLog) {
        global.broadcastLog(`⏳ Задержка между транзакциями: ${delaySec} сек`, 'info');
    } else {
        // Fallback для консоли если UI недоступен
        console.log(`   ⏳ Задержка между транзакциями: ${delaySec} сек`);
    }
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
}

// Функция для задержки между кошельками
async function walletDelay() {
    // Получаем настройки из глобального объекта или используем значения по умолчанию
    let minDelayMs = 120000; // значение по умолчанию (2 мин)
    let maxDelayMs = 300000; // значение по умолчанию (5 мин)
    
    if (typeof global !== 'undefined' && global.getConfig) {
        try {
            const config = global.getConfig();
            minDelayMs = config.transaction?.walletDelayMinMs || 120000;
            maxDelayMs = config.transaction?.walletDelayMaxMs || 300000;
        } catch (error) {
            // Используем значения по умолчанию
        }
    }
    
    // Генерируем случайное число в диапазоне
    const delayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
    const delaySec = Math.round(delayMs / 1000);
    
    // Отправляем лог в UI
    if (typeof global !== 'undefined' && global.broadcastLog) {
        global.broadcastLog(`⏳ Задержка между кошельками: ${delaySec} сек`, 'info');
    } else {
        // Fallback для консоли если UI недоступен
        console.log(`   ⏳ Задержка между кошельками: ${delaySec} сек`);
    }
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
}

module.exports = {
    transactionDelay,
    walletDelay
}; 