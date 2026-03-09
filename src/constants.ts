import * as ethers from 'ethers';

/// /////////////////////////////////
///   TIMELOCK CONSTANTS    /////////
/// /////////////////////////////////

export const TIMELOCK = {
    /*
     * Since roles are used, most storage is written in pseudoRandom storage slots
     * bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
     * bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
     * bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
     * bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
     * note: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L27
     */
    ROLES: {
        TIMELOCK_ADMIN_ROLE: ethers.id('TIMELOCK_ADMIN_ROLE'),
        PROPOSER_ROLE: ethers.id('PROPOSER_ROLE'),
        EXECUTOR_ROLE: ethers.id('EXECUTOR_ROLE'),
        CANCELLER_ROLE: ethers.id('CANCELLER_ROLE'),
    },
    ROLES_HASH: [
        ethers.id('TIMELOCK_ADMIN_ROLE'),
        ethers.id('PROPOSER_ROLE'),
        ethers.id('EXECUTOR_ROLE'),
        ethers.id('CANCELLER_ROLE'),
    ],
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L27
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L55
    ROLES_MAPPING_STORAGE_POS: 0,
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L34
    MINDELAY_STORAGE_POS: 2,
};

/// /////////////////////////////////
///   STORAGE CONSTANTS    //////////
/// /////////////////////////////////

export const STORAGE_ONE_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000001';

export const STORAGE_ZERO_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const NO_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';

/// /////////////////////////////////
///   ROLE CONSTANTS       //////////
/// /////////////////////////////////

export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
export const ADD_ROLLUP_TYPE_ROLE = ethers.id('ADD_ROLLUP_TYPE_ROLE');
export const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id('OBSOLETE_ROLLUP_TYPE_ROLE');
export const CREATE_ROLLUP_ROLE = ethers.id('CREATE_ROLLUP_ROLE');
export const ADD_EXISTING_ROLLUP_ROLE = ethers.id('ADD_EXISTING_ROLLUP_ROLE');
export const UPDATE_ROLLUP_ROLE = ethers.id('UPDATE_ROLLUP_ROLE');
export const TRUSTED_AGGREGATOR_ROLE = ethers.id('TRUSTED_AGGREGATOR_ROLE');
export const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id('TRUSTED_AGGREGATOR_ROLE_ADMIN');
export const TWEAK_PARAMETERS_ROLE = ethers.id('TWEAK_PARAMETERS_ROLE');
export const SET_FEE_ROLE = ethers.id('SET_FEE_ROLE');
export const STOP_EMERGENCY_ROLE = ethers.id('STOP_EMERGENCY_ROLE');
export const EMERGENCY_COUNCIL_ROLE = ethers.id('EMERGENCY_COUNCIL_ROLE');
export const EMERGENCY_COUNCIL_ADMIN = ethers.id('EMERGENCY_COUNCIL_ADMIN');

export const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id('AGGCHAIN_DEFAULT_VKEY_ROLE');
export const AL_ADD_PP_ROUTE_ROLE = ethers.id('AL_ADD_PP_ROUTE_ROLE');
export const AL_FREEZE_PP_ROUTE_ROLE = ethers.id('AL_FREEZE_PP_ROUTE_ROLE');
export const AL_MULTISIG_ROLE = ethers.id('AL_MULTISIG_ROLE');

/// ////////////////////////////
///   GENESIS CONSTANTS    /////
/// ////////////////////////////

export const GENESIS_CONTRACT_NAMES = {
    WETH: 'WETH',
    WETH_PROXY: 'WETH proxy',
    TOKEN_WRAPPED_IMPLEMENTATION: 'TokenWrapped implementation',
    SOVEREIGN_BRIDGE: 'AgglayerBridgeL2',
    SOVEREIGN_BRIDGE_IMPLEMENTATION: 'AgglayerBridgeL2 implementation',
    SOVEREIGN_BRIDGE_PROXY: 'AgglayerBridgeL2 proxy',
    BYTECODE_STORER: 'BytecodeStorer',
    BRIDGE_V2: 'AgglayerBridge',
    BRIDGE_V2_IMPLEMENTATION: 'AgglayerBridge implementation',
    BRIDGE_V2_PROXY: 'AgglayerBridge proxy',
    GER_L2_SOVEREIGN: 'AgglayerGERL2',
    GER_L2_SOVEREIGN_IMPLEMENTATION: 'AgglayerGERL2 implementation',
    GER_L2_SOVEREIGN_PROXY: 'AgglayerGERL2 proxy',
    GER_L2: 'LegacyAgglayerGERL2',
    GER_L2_IMPLEMENTATION: 'LegacyAgglayerGERL2 implementation',
    GER_L2_PROXY: 'LegacyAgglayerGERL2 proxy',
    PROXY_ADMIN: 'ProxyAdmin',
    POLYGON_TIMELOCK: 'PolygonZkEVMTimelock',
    POLYGON_DEPLOYER: 'PolygonZkEVMDeployer',
    BRIDGE_LIB: `BridgeLib`,
    AGG_ORACLE_PROXY: 'AggOracleCommittee proxy',
    AGG_ORACLE_IMPL: 'AggOracleCommittee implementation',
    ROLLUP_MANAGER_IMPLEMENTATION: 'AgglayerManager implementation',
    AGGLAYER_GATEWAY_IMPLEMENTATION: 'AgglayerGateway implementation',
    GER_IMPLEMENTATION: 'AgglayerGER implementation',
};

// The following contract names came from the genesis creation from different tags of agglayer-contracts repository.
// Genesis files have been created previously and so they could have old naming.
// Those genesis are already imported on different tooling and added as a metadata on-chain. Therefore, these arrays aim
// to support them too.

// TokenWrapped implementation
export const SUPPORT_TOKEN_WRAPPED_IMPLEMENTATION = [
    'TokenWrapped Implementation', // https://github.com/agglayer/agglayer-contracts/blob/v11.0.0-rc.3/deployment/v2/1_createGenesis.ts#L193
    // https://github.com/agglayer/agglayer-contracts/blob/v12.1.0/deployment/v2/1_createGenesis.ts#L195
    GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
];

// L2 GER Manager implementation
export const SUPPORT_GER_MANAGER_IMPLEMENTATION = [
    'PolygonZkEVMGlobalExitRootL2 implementation', // https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/1_createGenesis.ts#L328
    // https://github.com/agglayer/agglayer-contracts/blob/v12.1.0/deployment/v2/1_createGenesis.ts#L368
    GENESIS_CONTRACT_NAMES.GER_L2_IMPLEMENTATION,
];

// L2 GER Manager proxy
export const SUPPORT_GER_MANAGER_PROXY = [
    'PolygonZkEVMGlobalExitRootL2 proxy', // https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/1_createGenesis.ts#L346
    // https://github.com/agglayer/agglayer-contracts/blob/v12.1.0/deployment/v2/1_createGenesis.ts#L386
    GENESIS_CONTRACT_NAMES.GER_L2_PROXY,
];

// L2 Bridge implementation
export const SUPPORT_BRIDGE_IMPLEMENTATION = [
    'PolygonZkEVMBridge implementation', // https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/1_createGenesis.ts#L294
    'PolygonZkEVMBridgeV2 implementation', // https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/1_createGenesis.ts#L319
    // https://github.com/agglayer/agglayer-contracts/blob/v12.1.0/deployment/v2/1_createGenesis.ts#L334
    GENESIS_CONTRACT_NAMES.BRIDGE_V2_IMPLEMENTATION,
];

// L2 Bridge proxy
export const SUPPORT_BRIDGE_PROXY = [
    'PolygonZkEVMBridge proxy', // https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/1_createGenesis.ts#L309
    'PolygonZkEVMBridgeV2 proxy', // https://github.com/agglayer/agglayer-contracts/blob/v11.0.0-rc.3/deployment/v2/1_createGenesis.ts#L333
    // https://github.com/agglayer/agglayer-contracts/blob/v12.1.0/deployment/v2/1_createGenesis.ts#L349
    GENESIS_CONTRACT_NAMES.BRIDGE_V2_PROXY,
];
