/* eslint-disable no-await-in-loop */
import { ethers, JsonRpcProvider } from 'ethers';
import { spawn, spawnSync } from 'child_process';
import zlib from 'zlib';
import {
    SUPPORTED_BRIDGE_CONTRACTS,
    SUPPORTED_BRIDGE_CONTRACTS_PROXY,
    GENESIS_CONTRACT_NAMES,
    SUPPORTED_GER_MANAGERS,
    SUPPORTED_GER_MANAGERS_PROXY,
} from './constants';
import { logger } from '../logger';
import artifactTimelock from '../../artifacts/contracts/AgglayerTimelock.sol/AgglayerTimelock.json';
import artifactProxyAdmin from '../../artifacts/@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
import artifactTransparentUpgradeableProxy from '../../artifacts/@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import artifactAgglayerBridgeL2 from '../../artifacts/contracts/sovereignChains/AgglayerBridgeL2.sol/AgglayerBridgeL2.json';
import artifactAgglayerGERL2 from '../../artifacts/contracts/sovereignChains/AgglayerGERL2.sol/AgglayerGERL2.json';
import artifactAggOracleCommittee from '../../artifacts/contracts/sovereignChains/AggOracleCommittee.sol/AggOracleCommittee.json';
import { AgglayerBridgeL2, AgglayerGERL2, AggOracleCommittee } from '../../typechain-types';
import { ProxyAdmin } from '../../typechain-types/@openzeppelin/contracts4/proxy/transparent';

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
    const gerManagerProxyAddress = genesisBase.find((account: any) =>
        SUPPORTED_GER_MANAGERS_PROXY.includes(account.contractName),
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
 * Get the balance of the bridge proxy contract from genesis base
 * @param {Array} genesisBase - array of genesis base contracts
 * @returns {String} - balance of the bridge proxy contract
 */
export function getBalanceBridge(genesisBase: any) {
    // get the bridge proxy address
    return genesisBase.find((account: any) => SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName)).balance;
}

/**
 * Get the minDelay of the timelock from the genesis base (timelock storage)
 * @param {Array} genesisBase - array of genesis base contracts
 * @returns value of the minDelay in storage
 */
export async function getMinDelayTimelock(genesisBase: any) {
    const STORAGE_MINDELAY = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const timelock = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
    );

    // Storage slot 2 is the minDelay
    return timelock.storage[STORAGE_MINDELAY];
}

/**
 * Deploy timelock contract
 * @param {ethers.Signer} deployer - signer to deploy the contract
 * @param {number} timelockMinDelay - minimum delay in seconds for the timelock
 * @returns {Object} - contract instance and address of the deployed timelock
 */
export async function deployTimelock(deployer: ethers.Signer, timelockMinDelay: number) {
    const timelockContractFactory = new ethers.ContractFactory(
        artifactTimelock.abi,
        artifactTimelock.bytecode,
        deployer,
    );
    const timelock = await timelockContractFactory.deploy(
        timelockMinDelay,
        [deployer],
        [deployer],
        deployer,
        ethers.ZeroAddress, // PolygonRollupManager address not needed in L2
    );
    await timelock.deploymentTransaction();
    return { contract: timelock, address: timelock.target.toString().toLowerCase() };
}

/**
 * Deploy proxy admin contract
 * @param {ethers.Signer} deployer - signer to deploy the contract
 * @param {String} timelockAddress - timelock address to set as owner
 * @returns {Object} - contract instance and address of the deployed proxy admin
 */
export async function deployProxyAdmin(deployer: ethers.Signer, timelockAddress: string) {
    const proxyAdminFactory = new ethers.ContractFactory(artifactProxyAdmin.abi, artifactProxyAdmin.bytecode, deployer);
    const proxyAdmin = (await proxyAdminFactory.deploy()) as ProxyAdmin;
    await proxyAdmin.deploymentTransaction();
    await proxyAdmin.transferOwnership(timelockAddress);
    return { contract: proxyAdmin, address: proxyAdmin.target.toString().toLowerCase() };
}

/**
 * Deploy proxy and return all information from deployment
 * @param {Object} implementation - transaction factory.deploy()
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @returns {Object} - proxy address, implementation address
 */
export async function deployProxyWithTxCapture(implementation: any, proxyAdmin: any, deployer: any) {
    const deployImplTx = await implementation.deploymentTransaction();
    await deployImplTx.wait();

    // Deploy proxy
    const transparentProxyFactory = new ethers.ContractFactory(
        artifactTransparentUpgradeableProxy.abi,
        artifactTransparentUpgradeableProxy.bytecode,
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
        proxyAddress: proxy.target.toString().toLowerCase(),
        implementationAddress: implementation.target.toString().toLowerCase(),
    };
}

/**
 * Deploy implmentation and proxy for AgglayerBridgeL2
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @returns {Object} - contract, proxy address, implementation address,
 */
export async function deployAgglayerBridgeL2(proxyAdmin: any, deployer: any) {
    // Deploy implementation
    const bridgeFactory = new ethers.ContractFactory(
        artifactAgglayerBridgeL2.abi,
        artifactAgglayerBridgeL2.bytecode,
        deployer,
    );
    const implementation = await bridgeFactory.deploy();
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    const contract = new ethers.Contract(
        result.proxyAddress,
        artifactAgglayerBridgeL2.abi,
        deployer,
    ) as unknown as AgglayerBridgeL2;
    return {
        contract,
        proxyAddress: result.proxyAddress,
        implementationAddress: result.implementationAddress,
    };
}

/**
 * Deploy implmentation and proxy for AgglayerGERL2
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @param {String} bridgeProxyAddress - bridge address (ger constructor)
 * @returns {Object} - contract, proxy address, implementation address
 */
export async function deployAgglayerGERL2(proxyAdmin: any, deployer: any, bridgeProxyAddress: any) {
    // Deploy implementation
    const GERManagerFactory = new ethers.ContractFactory(
        artifactAgglayerGERL2.abi,
        artifactAgglayerGERL2.bytecode,
        deployer,
    );

    const implementation = await GERManagerFactory.deploy(bridgeProxyAddress);
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    const contract = new ethers.Contract(
        result.proxyAddress,
        artifactAgglayerGERL2.abi,
        deployer,
    ) as unknown as AgglayerGERL2;
    return {
        contract,
        proxyAddress: result.proxyAddress,
        implementationAddress: result.implementationAddress,
    };
}

/**
 * Deploy implmentation and proxy for AggOracleCommittee
 * @param {String} proxyAdmin - proxy admin, for proxy deployment
 * @param {Array} deployer - deployer for deploy transactions
 * @param {String} gerManagerAddress - ger address (aggoracle committee constructor)
 * @returns {Object} - contract, proxy address, implementation address
 */
export async function deployAggOracleCommittee(proxyAdmin: any, deployer: any, gerManagerAddress: any) {
    // Deploy implementation
    const AggOracleCommitteeFactory = new ethers.ContractFactory(
        artifactAggOracleCommittee.abi,
        artifactAggOracleCommittee.bytecode,
        deployer,
    );
    const implementation = await AggOracleCommitteeFactory.deploy(gerManagerAddress);
    const result = await deployProxyWithTxCapture(implementation, proxyAdmin, deployer);
    const contract = new ethers.Contract(
        result.proxyAddress,
        artifactAggOracleCommittee.abi,
        deployer,
    ) as unknown as AggOracleCommittee;
    return {
        contract,
        proxyAddress: result.proxyAddress,
        implementationAddress: result.implementationAddress,
    };
}

/**
 * Get the admin address of an ERC1967 proxy contract
 * @param {JsonRpcProvider} provider - RPC provider instance
 * @param {String} proxyAddress - address of the proxy contract
 * @returns {String} - admin address of the proxy
 */
export async function getErc1967Admin(provider: JsonRpcProvider, proxyAddress: string): Promise<string> {
    const ERC1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
    const raw = await provider.getStorage(proxyAddress, ERC1967_ADMIN_SLOT);
    const admin = `0x${raw.slice(26)}`;
    return admin;
}

/**
 * Get the implementation address of an ERC1967 proxy contract
 * @param {JsonRpcProvider} provider - RPC provider instance
 * @param {String} proxyAddress - address of the proxy contract
 * @returns {String} - implementation address of the proxy
 */
export async function getErc1967Implementation(provider: JsonRpcProvider, proxyAddress: string): Promise<string> {
    const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const raw = await provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT);
    const implementation = `0x${raw.slice(26)}`;
    return implementation;
}

/**
 * Check if Anvil is installed and has a supported version
 * @throws {Error} - if Anvil is not installed or version is lower than 1.4.0
 */
export async function checkAnvilVersion() {
    // check anvil version: 1.5.1-nightly
    const r = spawnSync('anvil', ['--version'], { encoding: 'utf8' });
    if (r.status !== 0) {
        throw new Error('Anvil must be installed.');
    }
    const versionString = r.stdout.trim();
    const version = versionString.match(/Version:\s*(\S+)/)?.[1];
    logger.info(`Version anvil: ${version}`);

    const numberVersion = version?.split('-')[0];
    if (Number(numberVersion?.split('.')[1]) < 4) {
        throw new Error(`A version higher than 1.4.0 is required.`);
    }
}

/**
 * Start Anvil process on the specified port
 * @param {number} port - port number to run Anvil on
 * @returns {ChildProcess} - spawned Anvil process
 */
export function startAnvil(port: number) {
    logger.warn(`Make sure port ${port.toString()} is free for anvil.`);
    return spawn('anvil', ['--port', port.toString(), '--accounts', '0'], { stdio: 'inherit' });
}

/**
 * Load state into Anvil instance
 * @param {JsonRpcProvider} provider - RPC provider instance
 * @param {any} stateJson - state JSON object to load
 */
export async function loadState(provider: JsonRpcProvider, stateJson: any) {
    const json = JSON.stringify(stateJson);
    const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
    const encoded = `0x${gz.toString('hex')}`;
    await provider.send('anvil_loadState', [encoded]);
}

/**
 * Wait for Anvil server to be ready and responding to RPC calls
 * @param {String} url - RPC endpoint URL, defaults to http://127.0.0.1:8545
 * @param {Number} retries - maximum number of retry attempts, defaults to 50
 * @param {Number} delayMs - delay between retries in milliseconds, defaults to 200
 * @throws {Error} - if Anvil does not start within the retry limit
 */
export async function waitForAnvil(port = 8545, retries = 50, delayMs = 200) {
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port.toString()}`);

    for (let i = 0; i < retries; i++) {
        try {
            await provider.getBlockNumber();
            logger.info('Anvil is ready');
            return provider;
        } catch {
            await new Promise((r) => {
                setTimeout(r, delayMs);
            });
        }
    }

    throw new Error('Anvil did not start in time');
}

/**
 * Dump and decompress the current state from Anvil instance
 * @param {JsonRpcProvider} provider - RPC provider instance
 * @returns {Object} - parsed state object from Anvil
 */
export async function getStateObject(provider: JsonRpcProvider) {
    const hex = await provider.send('anvil_dumpState', []);
    const buf = Buffer.from(hex.slice(2), 'hex');
    const json = zlib.gunzipSync(buf).toString('utf8');
    const state = JSON.parse(json);
    return state;
}

/**
 * Get account data from the Anvil state by address
 * @param {JsonRpcProvider} provider - RPC provider instance
 * @param {String} address - account address to retrieve
 * @returns {Object} - account state data from Anvil
 */
export async function getAccountFromState(provider: JsonRpcProvider, address: string) {
    const state = await getStateObject(provider);
    return state.accounts[address.toLocaleLowerCase()];
}
