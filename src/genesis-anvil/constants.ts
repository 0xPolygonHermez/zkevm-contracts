// Those contracts names came from the genesis creation:
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L294
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L328
// Genesis files have been created previously and so they have old naming, as it shown in the links above
// Those genesis are already imported on different tooling and added as a metadata on-chain. Therefore, this util aims
// to support them too

import { GENESIS_CONTRACT_NAMES } from '../utils-common-aggchain';

export const SUPPORTED_GER_MANAGERS = [
    'PolygonZkEVMGlobalExitRootL2 implementation',
    GENESIS_CONTRACT_NAMES.GER_L2_IMPLEMENTATION,
];

export const SUPPORTED_GER_MANAGERS_PROXY = [GENESIS_CONTRACT_NAMES.GER_L2_PROXY, 'PolygonZkEVMGlobalExitRootL2 proxy'];

export const SUPPORTED_BRIDGE_CONTRACTS = ['PolygonZkEVMBridge implementation', 'AgglayerBridge implementation'];

export const SUPPORTED_TIMELOCKS = [GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK, GENESIS_CONTRACT_NAMES.AGGLAYER_TIMELOCK];

export const SUPPORTED_BRIDGE_CONTRACTS_PROXY = ['AgglayerBridge proxy', 'PolygonZkEVMBridge proxy'];

export { GENESIS_CONTRACT_NAMES };

export const TIMELOCK_ADMIN_ROLE = ethers.id('TIMELOCK_ADMIN_ROLE');
export const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
export const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
export const CANCELLER_ROLE = ethers.id('CANCELLER_ROLE');
