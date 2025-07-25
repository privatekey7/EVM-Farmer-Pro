import { getSupportedNetworks } from './nativeTokens.js';

// Полный список поддерживаемых сетей с логотипами
export const SUPPORTED_NETWORKS = getSupportedNetworks();

// Целевые сети для режима collect_to_target (полный список как в исключениях)
export const TARGET_NETWORKS = SUPPORTED_NETWORKS;

// Специальные сети для режима swap_to_native
export const SWAP_TARGET_NETWORKS = [
  { id: 'all_chains', name: 'Все сети' },
  ...SUPPORTED_NETWORKS
]; 