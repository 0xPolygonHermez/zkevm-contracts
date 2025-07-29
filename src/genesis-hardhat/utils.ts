import { 
    SUPPORTED_BRIDGE_CONTRACTS,
    SUPPORTED_BRIDGE_CONTRACTS_PROXY,
    GENESIS_CONTRACT_NAMES
} from "./constants";

import { getStorageWrites } from '../../src/utils';

export async function getTraceStorageWrites(tx: any) {
    const trace = await ethers.provider.send('debug_traceTransaction', [
        tx.hash,
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

export async function getAddressesGenesisBase(genesisBase: any) {
    // get the proxy admin address
    const proxyAdminAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN).address;
    
    // get the bridge proxy address
    const bridgeProxyAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const bridgeImplementationAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
    ).address;

    // get the bridge proxy address
    const gerManagerProxyAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const gerManagerImplementationAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
    ).address;

    // get the bridge proxy implementation address
    const deployerAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN).address;

    // get the timelock address
    const timelockAddress = genesisBase.find(
        (account: any) => account.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK).address;

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