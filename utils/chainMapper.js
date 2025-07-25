/**
 * Маппер для преобразования идентификаторов сетей между EVM сетями и Relay API
 */
class ChainMapper {
  constructor() {
    // Соответствие между идентификаторами EVM сетей и chainId
    this.debankToChainId = {
      'eth': 1, // Ethereum
      'arb': 42161, // Arbitrum
      'op': 10, // Optimism
      'base': 8453, // Base
      'bsc': 56, // Binance Smart Chain
      'matic': 137, // Polygon
      'avax': 43114, // Avalanche
      'xdai': 100, // Gnosis Chain
      'celo': 42220, // Celo
      'era': 324, // zkSync Era
      'linea': 59144, // Linea
      'metis': 1088, // Metis
      'mnt': 5000, // Mantle
      'blast': 81457, // Blast
      'mode': 34443, // Mode
      'scrl': 534352, // Scroll
      'nova': 42170, // Arbitrum Nova
      'taiko': 167000, // Taiko
      'manta': 169, // Manta
      'cyber': 7560, // Cyber
      'lisk': 1135, // Lisk
      'mint': 185, // Mint
      'world': 480, // World Chain
      'abs': 2741, // Abstract
      'ape': 33139, // ApeChain
      'bob': 60808, // BOB
      'ink': 57073, // InkChain
      'pze': 1101, // Polygon zkEVM
      'ron': 2020, // Ronin
      'uni': 130, // Unichain
      'bera': 80084, // Berachain
      'fuse': 122, // Fuse
      'mobm': 7878, // MOBM
      'rari': 1380012617, // Rari Chain
      'vana': 1480, // Vana
      'zero': 543210, // Zero Network
      'zeta': 7000, // ZetaChain
      'plume': 161221135, // Plume
      'gravity': 1625, // Gravity
      'morph': 2818, // Morph
      'sonic': 146, // Sonic
      'swell': 1923, // Swell
      'story': 1513, // Story Protocol
      'zircuit': 48900, // Zircuit
      'cro': 25, // Cronos
      'sei': 1329, // Sei
      'boba': 288, // Boba Network
      'corn': 21000000, // Corn
      'hemi': 43111, // Hemi
      'hyper': 998, // Hyper
      'katana': 1001, // Katana
      'soneium': 1868, // Soneium
      'b2': 223, // B2

      'zkevm': 1101, // Polygon zkEVM
      'hyperliquid': 1337, // Hyperliquid
      'hychain': 2911, // Hychain
      'superseed': 5330, // Superseed
      'sanko': 1996, // Sanko
      'game7': 2187, // Game7
    };
    
    // Обратное соответствие
    this.chainIdToDebank = {};
    for (const [debankId, chainId] of Object.entries(this.debankToChainId)) {
      this.chainIdToDebank[chainId] = debankId;
    }
  }
  
  /**
   * Преобразование идентификатора EVM сети в chainId для Relay API
* @param {string} debankId - Идентификатор сети в формате EVM
   * @returns {number|null} - chainId или null, если не найден
   */
  getChainId(debankId) {
    return this.debankToChainId[debankId] || null;
  }
  
  /**
   * Преобразование chainId в идентификатор EVM сети
* @param {number|string} chainId - chainId сети
* @returns {string|null} - Идентификатор EVM сети или null, если не найден
   */
  getDebankId(chainId) {
    // Преобразуем в число для надежности
    const numericChainId = Number(chainId);
    return this.chainIdToDebank[numericChainId] || null;
  }
  
  /**
   * Проверяет, поддерживается ли EVM сеть для бриджа через Relay
* @param {string} debankId - Идентификатор сети в формате EVM
   * @returns {boolean} - true если поддерживается
   */
  isSupported(debankId) {
    return debankId in this.debankToChainId;
  }
  
  /**
   * Получение списка поддерживаемых EVM сетей
* @returns {Array<string>} - Массив идентификаторов EVM сетей
   */
  getSupportedDebankNetworks() {
    return Object.keys(this.debankToChainId);
  }
  
  /**
   * Получение списка поддерживаемых chainId
   * @returns {Array<number>} - Массив chainId
   */
  getSupportedChainIds() {
    return Object.values(this.debankToChainId);
  }
}

// Экспортируем singleton
const chainMapper = new ChainMapper();
module.exports = chainMapper; 