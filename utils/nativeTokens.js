/**
 * Информация о нативных токенах для всех поддерживаемых сетей
 */
const nativeTokens = {
  'eth': {
    name: 'Ethereum',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/coin/logo_url/eth/6443cdccced33e204d90cb723c632917.png'
  },
  'arb': {
    name: 'Arbitrum',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/arb/854f629937ce94bebeb2cd38fb336de7.png'
  },
  'op': {
    name: 'Optimism',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/op/68bef0c9f75488f4e302805ef9c8fc84.png'
  },
  'base': {
    name: 'Base',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/base/ccc1513e4f390542c4fb2f4b88ce9579.png'
  },
  'bsc': {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    logo_url: 'https://static.debank.com/image/chain/logo_url/bsc/bc73fa84b7fc5337905e527dadcbc854.png'
  },
  'matic': {
    name: 'Polygon',
    symbol: 'MATIC',
    logo_url: 'https://static.debank.com/image/chain/logo_url/matic/52ca152c08831e4765506c9bd75767e8.png'
  },
  'avax': {
    name: 'Avalanche',
    symbol: 'AVAX',
    logo_url: 'https://static.debank.com/image/chain/logo_url/avax/4d1649e8a0c7dec9de3491b81807d402.png'
  },
  'xdai': {
    name: 'Gnosis Chain',
    symbol: 'XDAI',
    logo_url: 'https://static.debank.com/image/chain/logo_url/xdai/43c1e09e93e68c9f0f3b132976394529.png'
  },
  'celo': {
    name: 'Celo',
    symbol: 'CELO',
    logo_url: 'https://static.debank.com/image/chain/logo_url/celo/faae2c36714d55db1d7a36aba5868f6a.png'
  },
  'era': {
    name: 'zkSync Era',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/era/2cfcd0c8436b05d811b03935f6c1d7da.png'
  },
  'linea': {
    name: 'Linea',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/linea/32d4ff2cf92c766ace975559c232179c.png'
  },
  'metis': {
    name: 'Metis',
    symbol: 'METIS',
    logo_url: 'https://static.debank.com/image/chain/logo_url/metis/7485c0a61c1e05fdf707113b6b6ac917.png'
  },
  'mnt': {
    name: 'Mantle',
    symbol: 'MNT',
    logo_url: 'https://static.debank.com/image/chain/logo_url/mnt/0af11a52431d60ded59655c7ca7e1475.png'
  },
  'blast': {
    name: 'Blast',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/blast/15132294afd38ce980639a381ee30149.png'
  },
  'mode': {
    name: 'Mode',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/mode/466e6e12f4fd827f8f497cceb0601a5e.png'
  },
  'scrl': {
    name: 'Scroll',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/scrl/1fa5c7e0bfd353ed0a97c1476c9c42d2.png'
  },
  'nova': {
    name: 'Arbitrum Nova',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/nova/06eb2b7add8ba443d5b219c04089c326.png'
  },
  'taiko': {
    name: 'Taiko',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/taiko/7723fbdb38ef181cd07a8b8691671e6b.png'
  },
  'manta': {
    name: 'Manta',
    symbol: 'MANTA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/manta/0e25a60b96a29d6a5b9e524be7565845.png'
  },
  'cyber': {
    name: 'Cyber',
    symbol: 'CYBER',
    logo_url: 'https://static.debank.com/image/coin/logo_url/cyber/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'lisk': {
    name: 'Lisk',
    symbol: 'LSK',
    logo_url: 'https://static.debank.com/image/coin/logo_url/lisk/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'mint': {
    name: 'Mint',
    symbol: 'MINT',
    logo_url: 'https://static.debank.com/image/coin/logo_url/mint/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'world': {
    name: 'World Chain',
    symbol: 'WRLD',
    logo_url: 'https://static.debank.com/image/coin/logo_url/world/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'abs': {
    name: 'Abstract',
    symbol: 'ABS',
    logo_url: 'https://static.debank.com/image/coin/logo_url/abs/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'ape': {
    name: 'ApeChain',
    symbol: 'APE',
    logo_url: 'https://static.debank.com/image/coin/logo_url/ape/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'bob': {
    name: 'BOB',
    symbol: 'BOB',
    logo_url: 'https://static.debank.com/image/coin/logo_url/bob/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'ink': {
    name: 'InkChain',
    symbol: 'INK',
    logo_url: 'https://static.debank.com/image/coin/logo_url/ink/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'pze': {
    name: 'Polygon zkEVM',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/coin/logo_url/pze/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'ron': {
    name: 'Ronin',
    symbol: 'RON',
    logo_url: 'https://static.debank.com/image/coin/logo_url/ron/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'uni': {
    name: 'Unichain',
    symbol: 'UNI',
    logo_url: 'https://static.debank.com/image/coin/logo_url/uni/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'bera': {
    name: 'Berachain',
    symbol: 'BERA',
    logo_url: 'https://static.debank.com/image/coin/logo_url/bera/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'fuse': {
    name: 'Fuse',
    symbol: 'FUSE',
    logo_url: 'https://static.debank.com/image/coin/logo_url/fuse/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'mobm': {
    name: 'MOBM',
    symbol: 'MOBM',
    logo_url: 'https://static.debank.com/image/coin/logo_url/mobm/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'rari': {
    name: 'Rari Chain',
    symbol: 'RARI',
    logo_url: 'https://static.debank.com/image/coin/logo_url/rari/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'vana': {
    name: 'Vana',
    symbol: 'VANA',
    logo_url: 'https://static.debank.com/image/coin/logo_url/vana/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'zero': {
    name: 'Zero Network',
    symbol: 'ZERO',
    logo_url: 'https://static.debank.com/image/coin/logo_url/zero/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'zeta': {
    name: 'ZetaChain',
    symbol: 'ZETA',
    logo_url: 'https://static.debank.com/image/coin/logo_url/zeta/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'plume': {
    name: 'Plume',
    symbol: 'PLUME',
    logo_url: 'https://static.debank.com/image/coin/logo_url/plume/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'gravity': {
    name: 'Gravity',
    symbol: 'GRAV',
    logo_url: 'https://static.debank.com/image/coin/logo_url/gravity/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'morph': {
    name: 'Morph',
    symbol: 'MORPH',
    logo_url: 'https://static.debank.com/image/coin/logo_url/morph/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'sonic': {
    name: 'Sonic',
    symbol: 'SONIC',
    logo_url: 'https://static.debank.com/image/coin/logo_url/sonic/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'swell': {
    name: 'Swell',
    symbol: 'SWELL',
    logo_url: 'https://static.debank.com/image/coin/logo_url/swell/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'story': {
    name: 'Story Protocol',
    symbol: 'STORY',
    logo_url: 'https://static.debank.com/image/coin/logo_url/story/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'zircuit': {
    name: 'Zircuit',
    symbol: 'ZIRCUIT',
    logo_url: 'https://static.debank.com/image/coin/logo_url/zircuit/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'cro': {
    name: 'Cronos',
    symbol: 'CRO',
    logo_url: 'https://static.debank.com/image/coin/logo_url/cro/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'sei': {
    name: 'Sei',
    symbol: 'SEI',
    logo_url: 'https://static.debank.com/image/coin/logo_url/sei/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'boba': {
    name: 'Boba Network',
    symbol: 'BOBA',
    logo_url: 'https://static.debank.com/image/coin/logo_url/boba/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'corn': {
    name: 'Corn',
    symbol: 'CORN',
    logo_url: 'https://static.debank.com/image/coin/logo_url/corn/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'hemi': {
    name: 'Hemi',
    symbol: 'HEMI',
    logo_url: 'https://static.debank.com/image/coin/logo_url/hemi/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'hyper': {
    name: 'Hyper',
    symbol: 'HYPER',
    logo_url: 'https://static.debank.com/image/coin/logo_url/hyper/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'katana': {
    name: 'Katana',
    symbol: 'KATANA',
    logo_url: 'https://static.debank.com/image/coin/logo_url/katana/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'soneium': {
    name: 'Soneium',
    symbol: 'SONE',
    logo_url: 'https://static.debank.com/image/coin/logo_url/soneium/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'b2': {
    name: 'B2',
    symbol: 'B2',
    logo_url: 'https://static.debank.com/image/coin/logo_url/b2/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },

  'zkevm': {
    name: 'Polygon zkEVM',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/coin/logo_url/zkevm/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'hyperliquid': {
    name: 'Hyperliquid',
    symbol: 'HYP',
    logo_url: 'https://static.debank.com/image/coin/logo_url/hyperliquid/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'hychain': {
    name: 'Hychain',
    symbol: 'HYC',
    logo_url: 'https://static.debank.com/image/coin/logo_url/hychain/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'superseed': {
    name: 'Superseed',
    symbol: 'SEED',
    logo_url: 'https://static.debank.com/image/coin/logo_url/superseed/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'sanko': {
    name: 'Sanko',
    symbol: 'SANKO',
    logo_url: 'https://static.debank.com/image/coin/logo_url/sanko/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'game7': {
    name: 'Game7',
    symbol: 'G7',
    logo_url: 'https://static.debank.com/image/coin/logo_url/game7/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  }
};

/**
 * Получение информации о нативном токене для сети
 * @param {string} networkId - Идентификатор сети (например, 'eth', 'arb')
 * @returns {Object|null} - Информация о токене или null
 */
function getNativeTokenInfo(networkId) {
  return nativeTokens[networkId] || null;
}

/**
 * Получение списка всех поддерживаемых сетей с информацией о токенах
 * @returns {Array} - Массив объектов с информацией о сетях и токенах
 */
function getAllSupportedNetworks() {
  return Object.entries(nativeTokens).map(([networkId, tokenInfo]) => ({
    id: networkId,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    logo_url: tokenInfo.logo_url
  }));
}

module.exports = {
  nativeTokens,
  getNativeTokenInfo,
  getAllSupportedNetworks
}; 