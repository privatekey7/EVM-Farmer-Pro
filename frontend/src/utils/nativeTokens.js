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
    symbol: 'POL',
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
    logo_url: 'https://static.debank.com/image/chain/logo_url/cyber/3a3c0c5da5fa8876c8c338afae0db478.png'
  },
  'lisk': {
    name: 'Lisk',
    symbol: 'LSK',
    logo_url: 'https://static.debank.com/image/chain/logo_url/lisk/4d4970237c52104a22e93993de3dcdd8.png'
  },
  'mint': {
    name: 'Mint',
    symbol: 'MINT',
    logo_url: 'https://static.debank.com/image/chain/logo_url/mint/86404f93cd4e51eafcc2e244d417c03f.png'
  },
  'world': {
    name: 'World Chain',
    symbol: 'WRLD',
    logo_url: 'https://static.debank.com/image/chain/logo_url/world/3e8c6af046f442cf453ce79a12433e2f.png'
  },
  'abs': {
    name: 'Abstract',
    symbol: 'ABS',
    logo_url: 'https://static.debank.com/image/chain/logo_url/abs/c59200aadc06c79d7c061cfedca85c38.png'
  },
  'ape': {
    name: 'ApeChain',
    symbol: 'APE',
    logo_url: 'https://static.debank.com/image/chain/logo_url/ape/290d3884861ae5e09394c913f788168d.png'
  },
  'bob': {
    name: 'BOB',
    symbol: 'BOB',
    logo_url: 'https://static.debank.com/image/chain/logo_url/bob/4e0029be99877775664327213a8da60e.png'
  },
  'ink': {
    name: 'InkChain',
    symbol: 'INK',
    logo_url: 'https://static.debank.com/image/chain/logo_url/ink/af5b553a5675342e28bdb794328e8727.png'
  },
  'pze': {
    name: 'Polygon zkEVM',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/pze/a2276dce2d6a200c6148fb975f0eadd3.png'
  },
  'ron': {
    name: 'Ronin',
    symbol: 'RON',
    logo_url: 'https://static.debank.com/image/chain/logo_url/ron/6e0f509804bc83bf042ef4d674c1c5ee.png'
  },
  'uni': {
    name: 'Unichain',
    symbol: 'UNI',
    logo_url: 'https://static.debank.com/image/chain/logo_url/uni/7e9011cb7bd0d19deb7727280aa5c8b1.png'
  },
  'bera': {
    name: 'Berachain',
    symbol: 'BERA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/bera/89db55160bb8bbb19464cabf17e465bc.png'
  },
  'fuse': {
    name: 'Fuse',
    symbol: 'FUSE',
    logo_url: 'https://static.debank.com/image/chain/logo_url/fuse/7a21b958761d52d04ff0ce829d1703f4.png'
  },
  'mobm': {
    name: 'MOBM',
    symbol: 'MOBM',
    logo_url: 'https://static.debank.com/image/coin/logo_url/mobm/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'rari': {
    name: 'Rari Chain',
    symbol: 'RARI',
    logo_url: 'https://static.debank.com/image/chain/logo_url/rari/67fc6abba5cfc6bb3a57bb6afcf5afee.png'
  },
  'vana': {
    name: 'Vana',
    symbol: 'VANA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/vana/b2827795c1556eeeaeb58cb3411d0b15.png'
  },
  'zero': {
    name: 'Zero Network',
    symbol: 'ZERO',
    logo_url: 'https://static.debank.com/image/chain/logo_url/zero/d9551d98b98482204b93544f90b43985.png'
  },
  'zeta': {
    name: 'ZetaChain',
    symbol: 'ZETA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/zeta/d0e1b5e519d99c452a30e83a1263d1d0.png'
  },
  'plume': {
    name: 'Plume',
    symbol: 'PLUME',
    logo_url: 'https://static.debank.com/image/chain/logo_url/plume/f74d0d202dd8af7baf6940864ee79006.png'
  },
  'gravity': {
    name: 'Gravity',
    symbol: 'GRAV',
    logo_url: 'https://static.debank.com/image/chain/logo_url/gravity/fa9a1d29f671b85a653f293893fa27e3.png'
  },
  'morph': {
    name: 'Morph',
    symbol: 'MORPH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/morph/2b5255a6c3a36d4b39e1dea02aa2f097.png'
  },
  'sonic': {
    name: 'Sonic',
    symbol: 'SONIC',
    logo_url: 'https://static.debank.com/image/chain/logo_url/sonic/8ba4d8395618ec1329ea7142b0fde642.png'
  },
  'swell': {
    name: 'Swell',
    symbol: 'SWELL',
    logo_url: 'https://static.debank.com/image/chain/logo_url/swell/3e98b1f206af5f2c0c2cc4d271ee1070.png'
  },
  'story': {
    name: 'Story Protocol',
    symbol: 'STORY',
    logo_url: 'https://static.debank.com/image/chain/logo_url/story/d2311c0952f9801e0d42e3b87b4bd755.png'
  },
  'zircuit': {
    name: 'Zircuit',
    symbol: 'ZIRCUIT',
    logo_url: 'https://static.debank.com/image/chain/logo_url/zircuit/0571a12255432950da5112437058fa5b.png'
  },
  'cro': {
    name: 'Cronos',
    symbol: 'CRO',
    logo_url: 'https://static.debank.com/image/chain/logo_url/croze/e9572bb5f00a04dd2e828dae75456abe.png'
  },
  'sei': {
    name: 'Sei',
    symbol: 'SEI',
    logo_url: 'https://static.debank.com/image/chain/logo_url/sei/34ddf58f678be2db5b2636b59c9828b5.png'
  },
  'boba': {
    name: 'Boba Network',
    symbol: 'BOBA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/boba/e43d79cd8088ceb3ea3e4a240a75728f.png'
  },
  'corn': {
    name: 'Corn',
    symbol: 'CORN',
    logo_url: 'https://static.debank.com/image/chain/logo_url/corn/2ac7405fee5fdeee5964ba0bcf2216f4.png'
  },
  'hemi': {
    name: 'Hemi',
    symbol: 'HEMI',
    logo_url: 'https://static.debank.com/image/chain/logo_url/hemi/db2e74d52c77b941d01f9beae0767ab6.png'
  },
  'hyper': {
    name: 'Hyper',
    symbol: 'HYPER',
    logo_url: 'https://static.debank.com/image/chain/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png'
  },
  'katana': {
    name: 'Katana',
    symbol: 'KATANA',
    logo_url: 'https://static.debank.com/image/chain/logo_url/katana/0202d6aecd963a9c0b2afb56c4d731b5.png'
  },
  'soneium': {
    name: 'Soneium',
    symbol: 'SONE',
    logo_url: 'https://static.debank.com/image/chain/logo_url/soneium/35014ebaa414b336a105ff2115ba2116.png'
  },
  'b2': {
    name: 'B2',
    symbol: 'B2',
    logo_url: 'https://static.debank.com/image/chain/logo_url/b2/6ca6c8bc33af59c5b9273a2b7efbd236.png'
  },

  'zkevm': {
    name: 'Polygon zkEVM',
    symbol: 'ETH',
    logo_url: 'https://static.debank.com/image/chain/logo_url/pze/a2276dce2d6a200c6148fb975f0eadd3.png'
  },
  'hyperliquid': {
    name: 'Hyperliquid',
    symbol: 'HYP',
    logo_url: 'https://static.debank.com/image/chain/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png'
  },
  'hychain': {
    name: 'Hychain',
    symbol: 'HYC',
    logo_url: 'https://static.debank.com/image/coin/logo_url/hychain/0d7c45b4c1709e33e7a7e90e4d10e382c6d3599c.png'
  },
  'superseed': {
    name: 'Superseed',
    symbol: 'SEED',
    logo_url: 'https://icons.llamao.fi/icons/chains/rsz_superseed.jpg'
  },
  'sanko': {
    name: 'Sanko',
    symbol: 'SANKO',
    logo_url: 'https://icons.llamao.fi/icons/chains/rsz_sanko.jpg'
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
export function getNativeTokenInfo(networkId) {
  return nativeTokens[networkId] || null;
}

/**
 * Получение списка всех поддерживаемых сетей с информацией о токенах
 * @returns {Array} - Массив объектов с информацией о сетях и токенах
 */
export function getSupportedNetworks() {
  return Object.entries(nativeTokens).map(([networkId, tokenInfo]) => ({
    id: networkId,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    logo_url: tokenInfo.logo_url
  }));
}

export default {
  nativeTokens,
  getNativeTokenInfo,
  getSupportedNetworks
}; 