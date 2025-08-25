// Those contracts names came from the genesis creation:
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L294
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L328
// Genesis files have been created previously and so they have old naming, as it shown in the links above
// Those genesis are already imported on different tooling and added as a metadata on-chain. Therefore, this util aims
// to support them too

export const SUPPORTED_GER_MANAGERS = ['PolygonZkEVMGlobalExitRootL2 implementation'];

export const SUPPORTED_BRIDGE_CONTRACTS = ['PolygonZkEVMBridge implementation', 'PolygonZkEVMBridgeV2 implementation'];

export const SUPPORTED_BRIDGE_CONTRACTS_PROXY = ['PolygonZkEVMBridgeV2 proxy', 'PolygonZkEVMBridge proxy'];

export const GENESIS_CONTRACT_NAMES = {
    WETH: 'WETH',
    WETH_PROXY: 'WETH proxy',
    TOKEN_WRAPPED_IMPLEMENTATION: 'TokenWrapped implementation',
    SOVEREIGN_BRIDGE: 'BridgeL2SovereignChain',
    SOVEREIGN_BRIDGE_IMPLEMENTATION: 'BridgeL2SovereignChain implementation',
    SOVEREIGN_BRIDGE_PROXY: 'BridgeL2SovereignChain proxy',
    BYTECODE_STORER: 'BytecodeStorer',
    BRIDGE_V2: 'PolygonZkEVMBridgeV2',
    GER_L2_SOVEREIGN: 'GlobalExitRootManagerL2SovereignChain',
    GER_L2_SOVEREIGN_IMPLEMENTATION: 'GlobalExitRootManagerL2SovereignChain implementation',
    GER_L2_SOVEREIGN_PROXY: 'GlobalExitRootManagerL2SovereignChain proxy',
    GER_L2: 'PolygonZkEVMGlobalExitRootL2',
    GER_L2_IMPLEMENTATION: 'PolygonZkEVMGlobalExitRootL2 implementation',
    GER_L2_PROXY: 'PolygonZkEVMGlobalExitRootL2 proxy',
    PROXY_ADMIN: 'ProxyAdmin',
    POLYGON_TIMELOCK: 'PolygonZkEVMTimelock',
    POLYGON_ZKEVM_DEPLOYER: 'PolygonZkEVMDeployer',
    DEPLOYER: 'deployer',
    AGGORACLE_COMMITTEE: 'AggOracleCommittee',
    AGGORACLE_COMMITTEE_IMPLEMENTATION: 'AggOracleCommittee implementation',
    AGGORACLE_COMMITTEE_PROXY: 'AggOracleCommittee proxy',
    BRIDGE_LIB: 'BridgeLib',
};
