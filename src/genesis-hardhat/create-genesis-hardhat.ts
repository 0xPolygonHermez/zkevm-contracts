import hre, { ethers, upgrades, hardhatArguments } from "hardhat";
import { BridgeL2SovereignChain, GlobalExitRootManagerL2SovereignChain, ProxyAdmin } from "../../typechain-types";
import { GENESIS_CONTRACT_NAMES } from "./constants";
import { getAddressesGenesisBase, getTraceStorageWrites } from "./utils";
import { checkParams, getOwnerOfProxyAdminFromProxy } from '../../src/utils';
import { logger } from "../../src/logger";

/**
 * Create a genesis file for hardhat
 * This function deployes all the contracts that are needed for the genesis file in the hardhdat network
 * @param genesisBase - The base genesis file
 * @param initializeParams - The initialize parameters
 * @param config - The configuration object
 * @returns The genesis file
 */
export async function createGenesisHardhat(_genesisBase: any, initializeParams: any, config: any) {
    logger.info('createGenesisHardhat tool');

    /////////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /////////////////////////////
    logger.info('Check initial parameters');

    // Check initialize params
    const mandatoryUpgradeParameters = [
        'rollupID',
        'gasTokenAddress',
        'gasTokenNetwork',
        'gasTokenMetadata',
        'bridgeManager',
        'sovereignWETHAddress',
        'sovereignWETHAddressIsNotMintable',
        'globalExitRootUpdater',
        'globalExitRootRemover',
        'emergencyBridgePauser',
        'emergencyBridgeUnpauser',
        'proxiedTokensManager',
    ];
    checkParams(initializeParams, mandatoryUpgradeParameters);

    //////////////////////////////////////
    ///   GET ADDRESSES BASE GENESIS   ///
    //////////////////////////////////////
    logger.info('Get addresses from genesis base');

    // get genesis from genesisBase (skip the root)
    const genesisBase = _genesisBase.genesis;

    // get addresses from genesis base
    const genesisBaseAddresses = await getAddressesGenesisBase(genesisBase);
    console.log(genesisBaseAddresses);
    // switch network hardhat
    const previousNetwork: string = hardhatArguments.network || 'hardhat';
    await hre.switchNetwork('hardhat');

    //////////////////////////////////////
    ///   DEPLOY SOVEREIGN CONTRACTS   ///
    //////////////////////////////////////
    const genesisInfo = [];

    // get deployer
    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [genesisBaseAddresses.deployerAddress]);
    await ethers.provider.send('hardhat_setBalance', [genesisBaseAddresses.deployerAddress, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(genesisBaseAddresses.deployerAddress);
    console.log(genesisBaseAddresses.deployerAddress);

    // deploy BridgeL2SovereignChain
    const BridgeL2SovereignChainFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE, deployer);
    const sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
        initializer: false,
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    })) as unknown as BridgeL2SovereignChain;

    const txDeployBridge = await sovereignChainBridgeContract.deploymentTransaction();
    genesisInfo.push({
        isProxy: true,
        name: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE,
        address: sovereignChainBridgeContract.target,
        storagesWrites: await getTraceStorageWrites(txDeployBridge),
        deployedAddresses: [
            {
                name: GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
                address: await sovereignChainBridgeContract.wrappedTokenBytecodeStorer()
            },
            {
                name: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
                address: await sovereignChainBridgeContract.getWrappedTokenBridgeImplementation(),
            },
        ]
    });

    // deploy GlobalExitRootManagerL2SovereignChain
    const gerManagerL2SovereignChainFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN, deployer);
    const gerManagerContract = (await upgrades.deployProxy(gerManagerL2SovereignChainFactory, [], {
        initializer: false,
        constructorArgs: [genesisBaseAddresses.bridgeProxyAddress], // Constructor arguments
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    })) as unknown as GlobalExitRootManagerL2SovereignChain;

    // deploy timelock
    const timelockContractFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK, deployer);
    const timelockContract = await timelockContractFactory.deploy(
        0, // could be optional. Read from base-genesis
        [deployer],
        [deployer],
        deployer,
        ethers.ZeroAddress, // PolygonRollupManager address not needed in L2
    );
    
    const txDeployTimelock = await timelockContract.deploymentTransaction();   

    // Transfer ownership of the proxyAdmon to the timelock
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const proxyAdminFactory = await ethers.getContractFactory('@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin');
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (await proxyAdminInstance.connect(deployer).transferOwnership(genesisBaseAddresses.timelockAddress as string)).wait();

    ////////////////////////////////////
    ///   SANITY CHECKS DEPLOYMENT   ///
    ////////////////////////////////////

    // Check admin of the proxy is the same in the bridge and the GER manager
    const test1 = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const test2 = await upgrades.erc1967.getAdminAddress(gerManagerContract.target as string);

    // test1 is address of the ProxyAdmin, I want to retirve the owner()
    console.log(test1);
    console.log(test2);

    const owner1 = await getOwnerOfProxyAdminFromProxy(sovereignChainBridgeContract.target);
    console.log(owner1);

    const owner2 = await getOwnerOfProxyAdminFromProxy(gerManagerContract.target);
    console.log(owner2);
    // switch network previous network
    await hre.switchNetwork(previousNetwork);
}