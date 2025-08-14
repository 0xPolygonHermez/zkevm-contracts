import { ethers, upgrades } from 'hardhat';
import { SUPPORTED_BRIDGE_CONTRACTS, SUPPORTED_BRIDGE_CONTRACTS_PROXY, GENESIS_CONTRACT_NAMES } from './constants';
import { STORAGE_GENESIS } from './storage';
import { getStorageWrites } from '../utils';

/**
 * Function to get the storage modifications of a tx from the txHash
 * @param {string} txHash - transaction hash
 * @returns {Object} - storage writes: { depth: {"key": "value"} }
 */
export async function getTraceStorageWrites(txHash: any) {
    const trace = await ethers.provider.send('debug_traceTransaction', [
        txHash,
        {
            enableMemory: false,
            disableStack: false,
            disableStorage: false,
            enableReturnData: false,
        },
    ]);

    const computedStorageWrites = getStorageWrites(trace);
    return computedStorageWrites;
}

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
        SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const bridgeImplementationAddress = genesisBase.find((account: any) =>
        SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
    ).address;

    // get the bridge proxy address
    const gerManagerProxyAddress = genesisBase.find((account: any) =>
        SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const gerManagerImplementationAddress = genesisBase.find((account: any) =>
        SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
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
 * Deploy proxy and capture all deployment transaction hashes
 *
 * @example
 * ```typescript
 * const factory = await ethers.getContractFactory("MyContract", deployer);
 * const result = await deployProxyWithTxCapture(factory, [], {
 *     initializer: false,
 *     unsafeAllow: ['constructor'],
 * });
 *
 * console.log('Proxy address:', result.contract.target);
 * console.log('Proxy tx hash:', result.txHashes.proxy);
 * console.log('Implementation tx hash:', result.txHashes.implementation);
 * console.log('ProxyAdmin tx hash:', result.txHashes.proxyAdmin);
 * ```
 */
export async function deployProxyWithTxCapture(factory: any, initializerArgs: any[] = [], options: any = {}) {
    // Get current block number before deployment
    const blockBefore = await ethers.provider.getBlockNumber();

    // Deploy the proxy
    const contract = await upgrades.deployProxy(factory, initializerArgs, options);
    await contract.waitForDeployment();

    // Get current block number after deployment
    const blockAfter = await ethers.provider.getBlockNumber();
    // Collect all transactions from blocks during deployment
    const deploymentTxs: string[] = [];
    for (let blockNum = blockBefore + 1; blockNum <= blockAfter; blockNum++) {
        // eslint-disable-next-line no-await-in-loop
        const block = await ethers.provider.getBlock(blockNum, false);
        if (block && block.transactions) {
            // eslint-disable-next-line no-restricted-syntax
            for (const txHash of block.transactions) {
                deploymentTxs.push(txHash);
            }
        }
    }

    // Get proxy transaction hash
    const proxyTx = await contract.deploymentTransaction();
    const proxyTxHash = proxyTx?.hash;

    // Get implementation and proxyAdmin transaction hashes
    const deploymentInfo = await analyzeDeploymentTransactions(contract.target as string, deploymentTxs);

    return {
        contract,
        txHashes: {
            proxy: proxyTxHash,
            implementation: deploymentInfo.implementationTxHash,
            proxyAdmin: deploymentInfo.proxyAdminTxHash,
        },
    };
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
 * Get the expected storage of the timelock contract
 * @param {Number} minDelay - minimum delay for the timelock
 * @returns {Object} - expected storage of the timelock contract
 */
export function getExpectedStoragePolygonZkEVMTimelock(minDelay) {
    const timelockAdminRole = ethers.keccak256(ethers.toUtf8Bytes('TIMELOCK_ADMIN_ROLE'));
    return {
        [STORAGE_GENESIS.TIMELOCK.TIMELOCK_ADMIN_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.PROPOSER_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.CANCELLER_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.EXECUTOR_ROLE]: timelockAdminRole,
        [STORAGE_GENESIS.TIMELOCK.TIMELOCK_ADMIN_ROLE_MEMBER_CONTRACT]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.TIMELOCK_ADMIN_ROLE_MEMBER]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.PROPOSER_ROLE_MEMBER]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.CANCELLER_ROLE_MEMBER]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.EXECUTOR_ROLE_MEMBER]: ethers.zeroPadValue('0x01', 32),
        [STORAGE_GENESIS.TIMELOCK.MINDELAY]: ethers.zeroPadValue(ethers.toBeHex(minDelay), 32),
    };
}

/**
 * This function will return the actual storage of the contract in slots of modificationsStorage
 * @param {String} modificationsStorage - modifications storage object
 * @returns {Object} - actual storage
 */
export async function getActualStorage(modificationsStorage, address) {
    const actualStorage = {};
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in modificationsStorage) {
        // eslint-disable-next-line no-await-in-loop
        actualStorage[key] = await ethers.provider.getStorage(address, key);
    }
    return actualStorage;
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
        return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    // eslint-disable-next-line no-restricted-syntax
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }

    return true;
}
