/* eslint-disable no-await-in-loop */
import { ethers, upgrades } from 'hardhat';
import {
    SUPPORTED_BRIDGE_CONTRACTS,
    SUPPORTED_BRIDGE_CONTRACTS_PROXY,
    GENESIS_CONTRACT_NAMES,
    SUPPORTED_GER_MANAGERS,
} from './constants';
import { STORAGE_GENESIS } from './storage';
import { logger } from '../logger';
import { getTraceStorageWrites } from '../utils';

/**
 * Get the addresses of the genesis base contracts
 * @param {Array} genesisBase - array of genesis base contracts
 * @returns {Object} - addresses of the genesis base contracts
 */
export async function getAddressesGenesisBase(genesisBase: any) {
    // get the proxy admin address
    const proxyAdminAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN,
    ).address;

    // get the bridge proxy address
    const bridgeProxyAddress = genesisBase.find((account: any) =>
        SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const bridgeImplementationAddress = genesisBase.find((account: any) =>
        SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get the bridge proxy address
    const gerManagerProxyAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.GER_L2_PROXY,
    ).address;

    // get the bridge proxy implementation address
    const gerManagerImplementationAddress = genesisBase.find((account: any) =>
        SUPPORTED_GER_MANAGERS.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const deployerAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN,
    ).address;

    // get the timelock address
    const timelockAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
    ).address;

    return {
        proxyAdminAddress,
        bridgeProxyAddress,
        bridgeImplementationAddress,
        gerManagerProxyAddress,
        gerManagerImplementationAddress,
        deployerAddress,
        timelockAddress,
    };
}

/**
 * Get the minDelay of the timelock from the genesis base (timelock storage)
 * @param {Array} genesisBase - array of genesis base contracts
 * @returns value of the minDelay in storage
 */
export async function getMinDelayTimelock(genesisBase: any) {
    const timelock = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
    );

    // Storage slot 2 is the minDelay
    return timelock.storage[STORAGE_GENESIS.TIMELOCK.MINDELAY];
}

/**
 * Analyze deployment transactions and return transaction hashes for proxyAdmin and implementation
 * @param {String} proxyAddress - address of the proxy contract
 * @param {Array} deploymentTxs - array of transaction hashes related to the deployment
 * @returns {Object} - transaction hashes for implementation and proxyAdmin
 */
export async function analyzeDeploymentTransactions(proxyAddress: string, deploymentTxs: string[]) {
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

    let implementationTxHash: string | undefined;
    let proxyAdminTxHash: string | undefined;

    // Check each transaction to see what contract it created
    // eslint-disable-next-line no-restricted-syntax
    for (const txHash of deploymentTxs) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const receipt = await ethers.provider.getTransactionReceipt(txHash);
            if (receipt?.contractAddress) {
                const createdAddress = receipt.contractAddress;

                if (createdAddress === implAddress) {
                    implementationTxHash = txHash;
                } else if (createdAddress === proxyAdminAddress) {
                    proxyAdminTxHash = txHash;
                }
            }
        } catch (error) {
            // Skip failed transactions
            // eslint-disable-next-line no-continue
            continue;
        }
    }

    return {
        implementationTxHash,
        proxyAdminTxHash,
    };
}

/**
 * Deploy proxy and return all information from deployment
 * @param {Object} implementation - transaction factory.deploy()
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @returns {Object} - proxy address, implementation address, txHashes: { proxy txHash, impl txHash }
 */
export async function deployProxyWithTxCapture(implementation: any, proxyAdmin: any, deployer: any) {
    const deployImplTx = await implementation.deploymentTransaction();
    await deployImplTx.wait();

    // Deploy proxy
    const transparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );

    const proxy = await transparentProxyFactory.deploy(
        implementation.target, // Implementation address
        proxyAdmin, // Use centralized ProxyAdmin
        '0x', // Call data for initialization (empty for separated initialization)
    );

    const deployProxyTx = proxy.deploymentTransaction();
    await deployProxyTx?.wait();

    return {
        proxy: proxy.target.toString().toLowerCase(),
        implementation: implementation.target.toString().toLowerCase(),
        txHashes: {
            proxy: deployProxyTx?.hash,
            implementation: deployImplTx?.hash,
        },
    };
}

/**
 * Deploy implmentation and proxy for BridgeL2SovereignChain
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @returns {Object} - proxy address, implementation address, txHashes: { proxy txHash, impl txHash }
 */
export async function deployBridgeL2SovereignChain(proxyAdmin: any, deployer: any) {
    // Deploy implementation
    const BridgeFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE, deployer);
    const implementation = await BridgeFactory.deploy();
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    return result;
}

/**
 * Deploy implmentation and proxy for GlobalExitRootManagerL2SovereignChain
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @param {String} bridgeProxyAddress - bridge address (ger constructor)
 * @returns {Object} - proxy address, implementation address, txHashes: { proxy txHash, impl txHash }
 */
export async function deployGlobalExitRootManagerL2SovereignChain(
    proxyAdmin: any,
    deployer: any,
    bridgeProxyAddress: any,
) {
    // Deploy implementation
    const GERManagerFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN, deployer);
    const implementation = await GERManagerFactory.deploy(bridgeProxyAddress);
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    return result;
}

/**
 * Deploy implmentation and proxy for AggOracleCommittee
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @param {String} gerManagerAddress - ger address (aggoracle committee constructor)
 * @returns {Object} - proxy address, implementation address, txHashes: { proxy txHash, impl txHash }
 */
export async function deployAggOracleCommittee(proxyAdmin: any, deployer: any, gerManagerAddress: any) {
    // Deploy implementation
    const GERManagerFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.AGGORACLE_COMMITTEE, deployer);
    const implementation = await GERManagerFactory.deploy(gerManagerAddress);
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    return result;
}

/**
 * Get the expected storage of the proxy contract
 * @param {String} addressProxy - address of the proxy contract
 * @returns {Object} - expected storage of the proxy contract
 */
export async function getExpectedStorageProxy(addressProxy) {
    return {
        [STORAGE_GENESIS.STORAGE_PROXY.ADMIN]: ethers.zeroPadValue(
            await upgrades.erc1967.getAdminAddress(addressProxy as string),
            32,
        ),
        [STORAGE_GENESIS.STORAGE_PROXY.IMPLEMENTATION]: ethers.zeroPadValue(
            await upgrades.erc1967.getImplementationAddress(addressProxy as string),
            32,
        ),
    };
}

/**
 * Get the storage value for slot 104 (deposit count, GER manager, network ID and emergency state)
 * @param {Number} depositCount - last updated deposit count
 * @param {String} GERManager - address of the global exit root manager
 * @param {Number} networkID - network ID
 * @param {Boolean} isEmergencyState - is emergency state
 * @returns {String} - storage value in hexadecimal string
 */
export function getStorage104(depositCount, GERManager, networkID, isEmergencyState) {
    // STORAGE 0x68 --> Slot 104
    // lastUpdatedDepositCount | globalExitRootManager | networkID | isEmergencyState
    const isEmergencyBytes = ethers.toBeHex(isEmergencyState, 1); // 1 byte
    const networkIDBytes = ethers.zeroPadValue(ethers.toBeHex(networkID), 4); // 4 bytes
    const GERManagerBytes = ethers.zeroPadValue(GERManager, 20); // 20 bytes
    const depositCountBytes = ethers.zeroPadValue(ethers.toBeHex(depositCount), 4); // 4 bytes

    // Concat: depositCount + address + networkID + isEmergency
    const packed = ethers.concat([depositCountBytes, GERManagerBytes, networkIDBytes, isEmergencyBytes]);
    const full = ethers.zeroPadValue(packed, 32);

    return full;
}

/**
 * Get the expected storage of the bridge contract
 * @param {Object} initParams - initialization parameters for the bridge contract
 * @param {String} GERManager - address of the global exit root manager
 * @returns {Object} - expected storage of the bridge contract
 */
export function getExpectedStorageBridge(initParams, GERManager) {
    return {
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.INITIALIZER]: ethers.zeroPadValue('0x03', 32),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.STATUS]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.DEPOSIT_GER_NETWORK_EMERGENCY]: ethers.zeroPadValue(
            getStorage104(0, GERManager, initParams.rollupID, 0),
            32,
        ),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.POLYGON_ROLLUP_MANAGER]: ethers.zeroPadValue('0x00', 32),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.BRIDGE_MANAGER]: ethers.zeroPadValue(initParams.bridgeManager, 32),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.EMERGENCY_BRIDGE_PAUSER]: ethers.zeroPadValue(
            initParams.emergencyBridgePauser,
            32,
        ),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.EMERGENCY_BRIDGE_UNPAUSER]: ethers.zeroPadValue(
            initParams.emergencyBridgeUnpauser,
            32,
        ),
        [STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.PROXIED_TOKENS_MANAGER]: ethers.zeroPadValue(
            initParams.proxiedTokensManager,
            32,
        ),
    };
}

/**
 * Update the expected storage of the bridge token with WETH address and gas token metadata
 * @param {Object} actualStorageBridge - actual storage of the bridge contract
 * @param {Object} sovereignChainBridgeContract - sovereign chain bridge contract instance
 * @param {String} gasTokenMetadata - gas token metadata in hexadecimal string
 * @returns {Object} - updated actual storage of the bridge contract
 */
export async function updateExpectedStorageBridgeToken(
    actualStorageBridge,
    sovereignChainBridgeContract,
    gasTokenMetadata,
) {
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.TOKEN_WETH] = ethers.zeroPadValue(
        (await sovereignChainBridgeContract.WETHToken()).toLowerCase(),
        32,
    );
    // gasTokenMetadata
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA] = ethers.zeroPadValue(
        ethers.toBeHex(gasTokenMetadata.length - 1),
        32,
    );
    let offset = 2 + 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_1] =
        `0x${gasTokenMetadata.slice(2, offset)}`;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_2] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    offset += 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_3] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    offset += 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_4] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    offset += 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_5] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    offset += 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_6] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    offset += 64;
    actualStorageBridge[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_METADATA_7] =
        `0x${gasTokenMetadata.slice(offset, offset + 64)}`;
    return actualStorageBridge;
}

/**
 * Get the expected storage of the GER manager contract
 * @param {Object} initParams - initialization parameters for the GER manager contract
 * @returns {Object} - expected storage of the GER manager contract
 */
export function getExpectedStorageGERManagerL2SovereignChain(initParams) {
    return {
        [STORAGE_GENESIS.STORAGE_GER_SOVEREIGN.GER_REMOVER]: ethers.zeroPadValue(initParams.globalExitRootRemover, 32),
        // Storage 0x34 --> Slot 52
        [STORAGE_GENESIS.STORAGE_GER_SOVEREIGN.GER_UPDATER_INIT]: ethers.zeroPadValue(
            ethers.concat([
                ethers.zeroPadValue(initParams.globalExitRootUpdater, 20),
                '0x00', // initialitzing
                '0x01', // initialitzed
            ]),
            32,
        ),
    };
}

/**
 * Get the storage position of the timelock admin role member
 * @param {String} role - constant role
 * @param {String} address - address of the timelock role
 * @returns {String} - storage position of the timelock admin role member
 */
export function getStorageTimelockAdminRoleMember(role, address) {
    const storagePosition = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [ethers.id(role), 0]);
    return ethers.solidityPackedKeccak256(['uint256', 'uint256'], [address, storagePosition]);
}

/**
 * Get the expected storage of the timelock contract
 * @param {Number} minDelay - minimum delay for the timelock
 * @param {String} timelockContractAddress - address of the timelock contract
 * @returns {Object} - expected storage of the timelock contract
 */
export function getExpectedStoragePolygonZkEVMTimelock(minDelay, timelockContractAddress, deployer) {
    const timelockAdminRole = ethers.keccak256(ethers.toUtf8Bytes('TIMELOCK_ADMIN_ROLE'));
    const storageTimelockAdminRoleSelf = getStorageTimelockAdminRoleMember(
        'TIMELOCK_ADMIN_ROLE',
        timelockContractAddress,
    );
    const storageTimelockAdminRole = getStorageTimelockAdminRoleMember('TIMELOCK_ADMIN_ROLE', deployer);
    const storageProposerRole = getStorageTimelockAdminRoleMember('PROPOSER_ROLE', deployer);
    const storageCancellerRole = getStorageTimelockAdminRoleMember('EXECUTOR_ROLE', deployer);
    const storageExecutorRole = getStorageTimelockAdminRoleMember('CANCELLER_ROLE', deployer);
    return {
        [STORAGE_GENESIS.TIMELOCK.TIMELOCK_ADMIN_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.PROPOSER_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.CANCELLER_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.EXECUTOR_ROLE]: timelockAdminRole,
        [storageTimelockAdminRoleSelf]: ethers.zeroPadValue('0x01', 32),
        [storageTimelockAdminRole]: ethers.zeroPadValue('0x01', 32),
        [storageProposerRole]: ethers.zeroPadValue('0x01', 32),
        [storageCancellerRole]: ethers.zeroPadValue('0x01', 32),
        [storageExecutorRole]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.MINDELAY]: ethers.zeroPadValue(ethers.toBeHex(minDelay), 32),
    };
}

/**
 * Get the expected storage of the TokenWrappedBridgeUpgradeable contract
 * @param {Object} sovereignChainBridgeContract - sovereign chain bridge contract instance
 * @param {String} tokenWrappedAddress - address of the token wrapped contract
 * @returns {Object} - expected storage of the TokenWrappedBridgeUpgradeable contract
 */
export async function getExpectedStorageTokenWrappedBridgeUpgradeable(
    sovereignChainBridgeContract,
    tokenWrappedAddress,
) {
    // Add proxy WETH
    const wethAddressProxy = await sovereignChainBridgeContract.WETHToken();
    const tokenWrappedBridgeUpgradeableInit: { [key: string]: any } = {};
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.STORAGE_PROXY.IMPLEMENTATION] = ethers.zeroPadValue(
        tokenWrappedAddress,
        32,
    );
    const adminWethProxy = await upgrades.erc1967.getAdminAddress(wethAddressProxy as string);
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.STORAGE_PROXY.ADMIN] = ethers.zeroPadValue(adminWethProxy, 32);
    // proxy storage init
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER] =
        ethers.zeroPadValue('0x01', 32);
    const wethNameEncoded = '0x577261707065642045746865720000000000000000000000000000000000001a';
    const wehtSymbolEncoded = '0x5745544800000000000000000000000000000000000000000000000000000008';
    const wethVersionEncoded = '0x3100000000000000000000000000000000000000000000000000000000000002';
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_NAME] =
        wethNameEncoded;
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_SYMBOL] =
        wehtSymbolEncoded;
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_EIP712_HASHEDNAME] =
        ethers.zeroPadValue('0x', 32);
    tokenWrappedBridgeUpgradeableInit[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_EIP712_HASHEDVERSION
    ] = ethers.zeroPadValue('0x', 32);
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_EIP712_NAME] =
        wethNameEncoded;
    tokenWrappedBridgeUpgradeableInit[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_EIP712_VERSION] =
        wethVersionEncoded;
    // 18 decimals
    tokenWrappedBridgeUpgradeableInit[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_DECIMALS_BRIDGE_ADDRESS
    ] = ethers.zeroPadValue(`${sovereignChainBridgeContract.target}${ethers.toBeHex(18).slice(2).toLowerCase()}`, 32);

    return tokenWrappedBridgeUpgradeableInit;
}

/**
 * Get the expected storage of the AggOracleCommittee contract
 * @param {Object} initParams - initial parameters
 * @param {String} aggOracleCommitteeContract - address of the aggOracleCommittee
 * @returns {Object} - expected storage of the AggOracleCommittee contract
 */
export async function getExpectedStorageAggOracleCommittee(initParams, aggOracleCommitteeContract) {
    const expectedStorageAggOracleCommittee: { [key: string]: any } = {};
    expectedStorageAggOracleCommittee[STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.INITIALIZER] = ethers.zeroPadValue(
        '0x01',
        32,
    );
    expectedStorageAggOracleCommittee[STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.QUORUM] = ethers.zeroPadValue(
        ethers.toBeHex(initParams.quorum),
        32,
    );
    expectedStorageAggOracleCommittee[STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.OWNER] = ethers.zeroPadValue(
        initParams.aggOracleOwner,
        32,
    );
    expectedStorageAggOracleCommittee[STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.AGG_ORACLE_MEMBERS] =
        `0x${initParams.aggOracleCommittee.length.toString(16).padStart(64, '0')}`;
    const keccakSlot0 = ethers.keccak256(STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.AGG_ORACLE_MEMBERS);

    initParams.aggOracleCommittee.forEach(async (address, index) => {
        const memberAddress = ethers.zeroPadValue(address, 32);

        const paddedSlot = STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.ADDRESS_TO_LAST_PROPOSED_GER;
        const mappingSlot = ethers.keccak256(ethers.concat([memberAddress, paddedSlot]));
        expectedStorageAggOracleCommittee[mappingSlot] = await aggOracleCommitteeContract.INITIAL_PROPOSED_GER();

        // The dynamic array is stored at slot 0 (aggOracleMembers)
        // Length is at slot 0, elements start at keccak256(0)
        const slot = ethers.toBeHex(BigInt(keccakSlot0) + BigInt(index), 32);
        expectedStorageAggOracleCommittee[slot] = memberAddress;

        const memberKey = BigInt(STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE.AGG_ORACLE_FIRST_MEMBER);
        const newMemberKey = memberKey + BigInt(index);
        const storageKey = `0x${newMemberKey.toString(16).padStart(64, '0')}`;
        expectedStorageAggOracleCommittee[storageKey] = memberAddress;
    });
    return expectedStorageAggOracleCommittee;
}

/**
 * This function will return the actual storage of the contract in slots of modificationsStorage
 * @param {String} modificationsStorage - modifications storage object
 * @returns {Object} - actual storage
 */
export async function getActualStorage(modificationsStorage, address) {
    const actualStorage: { [key: string]: any } = {};
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in modificationsStorage) {
        // eslint-disable-next-line no-await-in-loop
        actualStorage[key] = await ethers.provider.getStorage(address, key);
    }
    return actualStorage;
}

/**
 * Function to build a new genesis object using genesisInfo
 * @param newGenesis genesisBase object, to which new information will be added
 * @param genesisInfo Object containing all the information required to update newGenesis
 *                    { contractName, address, storage, genesisObject, deployedInside }
 */
export async function buildGenesis(genesisInfo: any[]) {
    const newGenesis = [];
    for (let i = 0; i < genesisInfo.length; i++) {
        const contract = genesisInfo[i];
        contract.bytecode = await ethers.provider.getCode(contract.address);
        contract.nonce = await ethers.provider.getTransactionCount(contract.address);
        if (contract.isProxy) {
            contract.address = contract.genesisContract.address;
            contract.balance = contract.genesisContract.balance;
        } else {
            contract.balance = await ethers.provider.getBalance(contract.address);
        }
        newGenesis.push(contract);
    }
    return newGenesis;
}

/**
 * Check if two objects are deeply equal
 * @param {Object} a - first object
 * @param {Object} b - second object
 * @returns {Boolean} - true if objects are deeply equal, false otherwise
 */
export function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        logger.error(`Type error: a: ${a}, b: ${b}`);
        return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
        logger.error(`Length mismatch: a: ${keysA.length}, b: ${keysB.length}`);
        logger.error(`Keys: ${keysA}`);
        logger.error(`Keys: ${keysB}`);
        return false;
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            logger.error(`Key mismatch: ${key} in a: ${a[key]}, in b: ${b[key]}`);
            return false;
        }
    }

    return true;
}

/**
 * Check if txhash have the expected storage writes length
 * @param {Object} txHash - transaction hash
 * @param {Object} expectedLength - expected storage writes length
 */
export async function checkExpectedStorageLength(txHash, expectedLength) {
    const lengthStorage = Object.keys(await getTraceStorageWrites(txHash)).length;
    if (lengthStorage !== expectedLength) {
        throw new Error('Storage not expected');
    }
}
