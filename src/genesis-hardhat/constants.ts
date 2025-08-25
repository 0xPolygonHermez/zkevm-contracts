// Those contracts names came from the genesis creation:
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L294
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L328
// Genesis files have been created previously and so they have old naming, as it shown in the links above
// Those genesis are already imported on different tooling and added as a metadata on-chain. Therefore, this util aims
// to support them too

import { GENESIS_CONTRACT_NAMES } from "../utils-common-aggchain";

export const SUPPORTED_GER_MANAGERS = ['LegacyAgglayerGERL2 implementation'];

export const SUPPORTED_BRIDGE_CONTRACTS = ['PolygonZkEVMBridge implementation', 'AgglayerBridge implementation'];

export const SUPPORTED_BRIDGE_CONTRACTS_PROXY = ['AgglayerBridge proxy', 'PolygonZkEVMBridge proxy'];

export { GENESIS_CONTRACT_NAMES };
