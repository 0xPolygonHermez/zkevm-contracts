import { 
    SUPPORTED_BRIDGE_CONTRACTS,
    SUPPORTED_BRIDGE_CONTRACTS_PROXY
} from "./constants";

export async function getAddressesGenesisBase(genesisBase: any) {
    const mainnetZkEVMDeployerAddress = genesisBase.find(
        (account: any) => account.contractName === 'PolygonZkEVMDeployer',
    ).address;
    
    const mainnetZkEVMTimelockAddress = genesisBase.find(
        (account: any) => account.contractName === 'PolygonZkEVMTimelock',
    ).address;
    
    const mainnetProxyAdminAddress = genesisBase.find((account: any) => account.contractName === 'ProxyAdmin').address;
    
    const mainnetZkEVMBridgeImplementationAddress = genesisBase.find(
        (account: any) => account.contractName === 'PolygonZkEVMBridge implementation',
    ).address;
    
    const mainnetZkEVMBridgeProxyAddress = genesisBase.find(
        (account: any) => account.contractName === 'PolygonZkEVMBridge proxy',
    ).address;
    
    const mainnetGlobalExitRootL2ImplementationAddress = genesisBase.find(
        (account: any) => account.contractName === 'PolygonZkEVMGlobalExitRootL2 implementation',
    ).address;
    
    const keylessDeployerMainnet = genesisBase.find(
        (account: any) => account.accountName === 'keyless Deployer',
    ).address;

    const bridgeProxyAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS.includes(account.contractName),
    ).address;

    // get brudge proxu implelentation
    const bridgeProxyImplementationAddress = genesisBase.find(
        (account: any) => SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(account.contractName),
    ).address;

    return {
        mainnetZkEVMDeployerAddress,
        mainnetZkEVMTimelockAddress,
        mainnetProxyAdminAddress,
        mainnetZkEVMBridgeImplementationAddress,
        mainnetZkEVMBridgeProxyAddress,
        mainnetGlobalExitRootL2ImplementationAddress,
        keylessDeployerMainnet,
    };
}