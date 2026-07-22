import path = require('path');
import fs = require('fs');
import { ethers } from 'ethers';
import { expect } from 'chai';
import { GENESIS_CONTRACT_NAMES, TIMELOCK_ADMIN_ROLE, EXECUTOR_ROLE, PROPOSER_ROLE, CANCELLER_ROLE } from './constants';
import {
    deployAgglayerBridgeL2,
    deployAgglayerGERL2,
    deployAggOracleCommittee,
    waitForAnvil,
    deployTimelock,
    deployProxyAdmin,
    startAnvil,
    checkAnvilVersion,
    loadState,
    getErc1967Admin,
    getErc1967Implementation,
    getStateObject,
    getAccountFromState,
} from './utils';
import { checkParams } from '../utils';
import { logger } from '../logger';
import artifactTimelock from '../../artifacts/contracts/AgglayerTimelock.sol/AgglayerTimelock.json';
import artifactProxyAdmin from '../../artifacts/@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
import artifactAgglayerBridgeL2 from '../../artifacts/contracts/sovereignChains/AgglayerBridgeL2.sol/AgglayerBridgeL2.json';
import artifactAgglayerGERL2 from '../../artifacts/contracts/sovereignChains/AgglayerGERL2.sol/AgglayerGERL2.json';
import artifactAggOracleCommittee from '../../artifacts/contracts/sovereignChains/AggOracleCommittee.sol/AggOracleCommittee.json';
import artifactTokenWrapped from '../../artifacts/contracts/lib/TokenWrappedBridgeUpgradeable.sol/TokenWrappedBridgeUpgradeable.json';

/**
 * Create a genesis file for anvil
 * This function deploys all the contracts that are needed for the genesis file in the anvil network
 * @param genesisBase - The base genesis file
 * @param initializeParams - The initialize parameters
 * @param config - The configuration object
 * @returns The genesis file
 */
export async function createGenesisAnvil(initializeParams: any) {
    logger.info('Start createGenesisAnvil tool');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    // Check initialize params
    const mandatoryParameters = [
        'rollupID',
        'gasTokenAddress',
        'gasTokenNetwork',
        'gasTokenMetadata',
        'bridgeManager',
        'sovereignWETHAddress',
        'sovereignWETHAddressIsNotMintable',
        'globalExitRootRemover',
        'emergencyBridgePauser',
        'emergencyBridgeUnpauser',
        'proxiedTokensManager',
        'useAggOracleCommittee',
        'timelockOwner',
        'timelockMinDelay',
        'bridgeContractAddress',
        'bridgeBalance',
        'gerManagerAddress',
        'anvilPort',
    ];
    checkParams(initializeParams, mandatoryParameters);

    const { anvilPort, timelockOwner, timelockMinDelay, bridgeContractAddress, bridgeBalance, gerManagerAddress } =
        initializeParams;

    const returnObject = { genesis: {} as any, outputAddresses: {} as any };

    await checkAnvilVersion();

    // start anvil
    const anvil = startAnvil(anvilPort);
    logger.info(`Anvil started with PID: ${anvil.pid}`, anvil.pid?.toString());
    const anvilProvider = await waitForAnvil(anvilPort);

    /// /////////////////////////
    ///   SET CONFIG VALUES  ///
    /// /////////////////////////
    logger.info('Set parameters values');

    // TIMELOCK_MINDELAY
    // Check if the minDelay is a number
    if (typeof timelockMinDelay !== 'number') {
        throw new Error('minDelay must be a number');
    }
    // Check if the minDelay is greater than 0
    if (timelockMinDelay <= 0) {
        throw new Error('minDelay must be greater than 0');
    }

    // TIMELOCK_OWNER
    // Check if the owner is a valid address
    if (!ethers.isAddress(timelockOwner)) {
        throw new Error('timelock owner must be a valid address');
    }

    /// ///////////////////////////////////
    ///   DEPLOY SOVEREIGN CONTRACTS   ///
    /// ///////////////////////////////////

    // Load deployer
    await anvilProvider.send('anvil_impersonateAccount', [timelockOwner]);
    await anvilProvider.send('anvil_setBalance', [timelockOwner, '0xffffffffffffffff']); // 18 ethers aprox

    // if deployer is on localhost (anvil), all deployments are done in anvil
    const deployer = await anvilProvider.getSigner(timelockOwner);
    returnObject.outputAddresses.timelockOwner = timelockOwner;

    // Deplo timelock
    logger.info('Deploying Timelock contract...');
    const timelockContract = await deployTimelock(deployer, timelockMinDelay);
    logger.info(`Timelock deployed at address: ${timelockContract.address}`);
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK] = timelockContract.address;

    // Deploy proxyAdmin
    logger.info('Deploying ProxyAdmin contract...');
    const proxyAdmin = await deployProxyAdmin(deployer, timelockContract.address);
    logger.info(`ProxyAdmin deployed at address: ${proxyAdmin.address}`);
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.PROXY_ADMIN] = proxyAdmin.address;

    // deploy AgglayerBridgeL2
    logger.info('Deploying AgglayerBridgeL2 contract...');
    const bridgeDeploymentResult = await deployAgglayerBridgeL2(proxyAdmin.contract, deployer);
    // Get addresses from bridge deployment
    const bridgeProxyAddressNew = bridgeDeploymentResult.proxyAddress;
    const bridgeImplAddress = bridgeDeploymentResult.implementationAddress;
    logger.info(`AgglayerBridgeL2 deployed at proxy address: ${bridgeContractAddress}`);
    logger.info(`AgglayerBridgeL2 deployed at implementation address: ${bridgeImplAddress}`);

    logger.info(
        `Change address bridge proxy to original address: ${bridgeProxyAddressNew} to ${bridgeContractAddress}`,
    );
    // get code, nonce and storage of deployed bridge proxy and set to original address
    const codeBridgeProxy = await anvilProvider.getCode(bridgeProxyAddressNew);
    const nonceBridgeProxy = await anvilProvider.getTransactionCount(bridgeProxyAddressNew, 'latest');
    await anvilProvider.send('anvil_setCode', [bridgeContractAddress, codeBridgeProxy]);
    await anvilProvider.send('anvil_setCode', [bridgeProxyAddressNew, '0x']);
    await anvilProvider.send('anvil_setNonce', [bridgeContractAddress, nonceBridgeProxy]);
    await anvilProvider.send('anvil_setNonce', [bridgeProxyAddressNew, 0]);
    const storageBridge = (await getAccountFromState(anvilProvider, bridgeProxyAddressNew)).storage;
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const slot in storageBridge) {
        logger.info(`Migrating storage slot ${slot} from ${bridgeProxyAddressNew} to ${bridgeContractAddress}`);
        // eslint-disable-next-line no-await-in-loop
        const value = await anvilProvider.getStorage(bridgeProxyAddressNew, slot);
        // eslint-disable-next-line no-await-in-loop
        await anvilProvider.send('anvil_setStorageAt', [bridgeContractAddress, slot, value]);
        // eslint-disable-next-line no-await-in-loop
        await anvilProvider.send('anvil_setStorageAt', [bridgeProxyAddressNew, slot, ethers.ZeroHash]);
    }

    const bridgeL2Contract = new ethers.Contract(bridgeContractAddress, artifactAgglayerBridgeL2.abi, deployer);
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY] = bridgeContractAddress;
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION] = bridgeImplAddress;
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.BRIDGE_LIB] = await bridgeL2Contract.bridgeLib();
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION] =
        await bridgeL2Contract.getWrappedTokenBridgeImplementation();

    // deploy AgglayerGERL2
    logger.info('Deploying AgglayerGERL2 contract...');
    const gerDeploymentResult = await deployAgglayerGERL2(
        proxyAdmin.contract,
        deployer,
        bridgeContractAddress, // Constructor arguments
    );

    // Get addresses from ger deployment
    const gerProxyAddressNew = gerDeploymentResult.proxyAddress;
    const gerImplAddress = gerDeploymentResult.implementationAddress;
    logger.info(`AgglayerGERL2 deployed at proxy address: ${gerProxyAddressNew}`);
    logger.info(`AgglayerGERL2 deployed at implementation address: ${gerImplAddress}`);

    logger.info(`Change address ger proxy to original address: ${gerProxyAddressNew} to ${gerManagerAddress}`);

    // get code, nonce and storage of deployed ger proxy and set to original address
    const codeGerProxy = await anvilProvider.getCode(gerProxyAddressNew);
    const nonceGerProxy = await anvilProvider.getTransactionCount(gerProxyAddressNew, 'latest');
    await anvilProvider.send('anvil_setCode', [gerManagerAddress, codeGerProxy]);
    await anvilProvider.send('anvil_setCode', [gerProxyAddressNew, '0x']);
    await anvilProvider.send('anvil_setNonce', [gerManagerAddress, nonceGerProxy]);
    await anvilProvider.send('anvil_setNonce', [gerProxyAddressNew, 0]);
    const storageGer = (await getAccountFromState(anvilProvider, gerProxyAddressNew)).storage;
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const slot in storageGer) {
        logger.info(`Migrating storage slot ${slot} from ${gerProxyAddressNew} to ${gerManagerAddress}`);
        // eslint-disable-next-line no-await-in-loop
        const value = await anvilProvider.getStorage(gerProxyAddressNew, slot);
        // eslint-disable-next-line no-await-in-loop
        await anvilProvider.send('anvil_setStorageAt', [gerManagerAddress, slot, value]);
        // eslint-disable-next-line no-await-in-loop
        await anvilProvider.send('anvil_setStorageAt', [gerProxyAddressNew, slot, ethers.ZeroHash]);
    }

    const gerL2Contract = new ethers.Contract(gerManagerAddress, artifactAgglayerGERL2.abi, deployer);

    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY] = gerManagerAddress;
    returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_IMPLEMENTATION] = gerImplAddress;

    /// ///////////////////////////////////
    ///   DEPLOY AGGORACLE COMMITTEE   ////
    /// ///////////////////////////////////
    let globalExitRootUpdater;
    let aggOracleImplementationAddress;
    let aggOracleCommitteeAddress;
    let aggOracleCommitteeDeploymentResult;

    if (initializeParams.useAggOracleCommittee === true) {
        checkParams(initializeParams, ['aggOracleMembers', 'quorum', 'aggOracleOwner']);
        // deploy AggOracleCommittee
        logger.info('Deploying AggOracleCommittee contract...');
        aggOracleCommitteeDeploymentResult = await deployAggOracleCommittee(
            proxyAdmin.contract,
            deployer,
            returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY],
        );
        aggOracleCommitteeAddress = aggOracleCommitteeDeploymentResult.proxyAddress;
        aggOracleImplementationAddress = aggOracleCommitteeDeploymentResult.implementationAddress;
        logger.info(`AggOracleCommittee deployed at proxy address: ${aggOracleCommitteeAddress}`);
        logger.info(`AggOracleCommittee deployed at implementation address: ${aggOracleImplementationAddress}`);
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.AGG_ORACLE_PROXY] = aggOracleCommitteeAddress;
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.AGG_ORACLE_IMPL] = aggOracleImplementationAddress;

        initializeParams.globalExitRootUpdater = aggOracleCommitteeAddress;
        globalExitRootUpdater = aggOracleCommitteeAddress;

        /// ///////////////////////////////////////
        ///   INITIALIZE AGGORACLE COMMITTEE   ///
        /// //////////////////////////////////////
        logger.info('initializing AggOracleCommittee contract...');
        await aggOracleCommitteeDeploymentResult.contract.initialize(
            initializeParams.aggOracleOwner,
            initializeParams.aggOracleMembers,
            initializeParams.quorum,
        );
    } else {
        checkParams(initializeParams, ['globalExitRootUpdater']);
        globalExitRootUpdater = initializeParams.globalExitRootUpdater;
    }

    /// ///////////////////////////////////////
    ///   INITIALIZE SOVEREIGN CONTRACTS   ///
    /// //////////////////////////////////////

    logger.info('Initializing AgglayerBridgeL2 contract...');
    // Initialize the AgglayerBridgeL2 contract
    const {
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        globalExitRootRemover,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    } = initializeParams;

    await bridgeL2Contract.initialize(
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        gerManagerAddress, // Global exit root manager address from base genesis
        ethers.ZeroAddress, // Polygon rollup manager address always zero for sovereign chains
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    );

    let name;
    let symbol;
    let decimals;

    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        logger.info('Rollup with custom gas token, adding WETH address to output...');
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.WETH_PROXY] = await bridgeL2Contract.WETHToken();
        [name, symbol, decimals] = ethers.AbiCoder.defaultAbiCoder().decode(
            ['string', 'string', 'uint8'],
            await bridgeL2Contract.gasTokenMetadata(),
        );
    }

    logger.info('Initializing AgglayerGERL2 contract...');

    // Initialize the AgglayerGERL2 contract
    await gerL2Contract.initialize(globalExitRootUpdater, globalExitRootRemover);

    /// ///////////////////////////////
    ///       GET STATE ANVIL       ///
    /// ///////////////////////////////

    const state = await getStateObject(anvilProvider);

    // set old balance bridge
    state.accounts[bridgeContractAddress.toLocaleLowerCase()].balance = bridgeBalance;

    // unset balance timelockOwner
    state.accounts[timelockOwner.toLocaleLowerCase()].balance = '0x0';

    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisAnvil/state.json'),
        JSON.stringify(state, null, 2),
    );

    logger.info(`File out: ${path.join(__dirname, '../../tools/createSovereignGenesisAnvil/state.json')}`);

    await anvil.kill('SIGINT');
    await anvilProvider.destroy();

    const newAnvil = startAnvil(anvilPort);
    logger.info(`Anvil started with PID: ${newAnvil.pid}`, newAnvil.pid?.toString());
    const newAnvilProvider = await waitForAnvil(anvilPort);
    await loadState(newAnvilProvider, state);

    /// /////////////////////////
    ///   SANTITY CHECKS      ///
    /// /////////////////////////

    logger.info('Sanity checks timelock...');
    // Timelock contract
    const newTimelockContract = new ethers.Contract(timelockContract.address, artifactTimelock.abi, newAnvilProvider);

    expect(await newTimelockContract.getMinDelay()).to.be.equal(timelockMinDelay);
    expect(await newTimelockContract.hasRole(TIMELOCK_ADMIN_ROLE, deployer.address)).to.be.equal(true);
    expect(await newTimelockContract.hasRole(EXECUTOR_ROLE, deployer.address)).to.be.equal(true);
    expect(await newTimelockContract.hasRole(PROPOSER_ROLE, deployer.address)).to.be.equal(true);
    expect(await newTimelockContract.hasRole(CANCELLER_ROLE, deployer.address)).to.be.equal(true);

    logger.info('Sanity checks ProxyAdmin...');
    // ProxyAdmin contract
    const newProxyAdmin = new ethers.Contract(proxyAdmin.address, artifactProxyAdmin.abi, newAnvilProvider);
    expect((await newProxyAdmin.owner()).toLocaleLowerCase()).to.be.equal(timelockContract.address.toLocaleLowerCase());

    logger.info('Sanity checks AgglayerBridgeL2...');
    // AgglayerBridgeL2 contract
    const newAgglayerBridgeL2 = new ethers.Contract(
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY],
        artifactAgglayerBridgeL2.abi,
        newAnvilProvider,
    );

    expect(
        (
            await getErc1967Admin(
                newAnvilProvider,
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY],
            )
        ).toLocaleLowerCase(),
    ).to.be.equal(proxyAdmin.address.toLocaleLowerCase());
    expect(
        (
            await getErc1967Implementation(
                newAnvilProvider,
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY],
            )
        ).toLocaleLowerCase(),
    ).to.be.equal(bridgeImplAddress.toLocaleLowerCase());
    expect((await newAgglayerBridgeL2.getWrappedTokenBridgeImplementation()).toLocaleLowerCase()).to.be.equal(
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION].toLocaleLowerCase(),
    );
    expect(await newAgglayerBridgeL2.bridgeLib()).to.be.equal(
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.BRIDGE_LIB],
    );
    expect(await newAgglayerBridgeL2.networkID()).to.be.equal(rollupID);
    expect((await newAgglayerBridgeL2.bridgeManager()).toLocaleLowerCase()).to.be.equal(
        bridgeManager.toLocaleLowerCase(),
    );
    expect((await newAgglayerBridgeL2.globalExitRootManager()).toLocaleLowerCase()).to.be.equal(
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY].toLocaleLowerCase(),
    );
    expect(await newAgglayerBridgeL2.polygonRollupManager()).to.be.equal(ethers.ZeroAddress);
    expect((await newAgglayerBridgeL2.emergencyBridgePauser()).toLocaleLowerCase()).to.be.equal(
        emergencyBridgePauser.toLocaleLowerCase(),
    );
    expect((await newAgglayerBridgeL2.emergencyBridgeUnpauser()).toLocaleLowerCase()).to.be.equal(
        emergencyBridgeUnpauser.toLocaleLowerCase(),
    );
    expect((await newAgglayerBridgeL2.getProxiedTokensManager()).toLocaleLowerCase()).to.be.equal(
        proxiedTokensManager.toLocaleLowerCase(),
    );
    expect(await newAgglayerBridgeL2.lastUpdatedDepositCount()).to.be.equal(0);
    expect(await newAgglayerBridgeL2.isEmergencyState()).to.be.equal(false);

    // Token Wrapped
    logger.info('Sanity checks TokenWrapped...');
    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        logger.info('Sanity check gas token...');
        expect((await newAgglayerBridgeL2.gasTokenAddress()).toLocaleLowerCase()).to.be.equal(
            gasTokenAddress.toLocaleLowerCase(),
        );
        const [nameNew, symbolNew, decimalsNew] = ethers.AbiCoder.defaultAbiCoder().decode(
            ['string', 'string', 'uint8'],
            await newAgglayerBridgeL2.gasTokenMetadata(),
        );
        expect(nameNew).to.be.equal(name);
        expect(symbolNew).to.be.equal(symbol);
        expect(decimalsNew).to.be.equal(decimals);
        if (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress)) {
            logger.info('Sanity check WETH token...');
            expect(await newAgglayerBridgeL2.WETHToken()).to.be.equal(
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.WETH_PROXY],
            );
            const newWETH = new ethers.Contract(
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.WETH_PROXY],
                artifactTokenWrapped.abi,
                newAnvilProvider,
            );
            expect(
                (
                    await getErc1967Admin(
                        newAnvilProvider,
                        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.WETH_PROXY],
                    )
                ).toLocaleLowerCase(),
            ).to.be.equal(proxiedTokensManager.toLocaleLowerCase());
            expect(
                (
                    await getErc1967Implementation(
                        newAnvilProvider,
                        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.WETH_PROXY],
                    )
                ).toLocaleLowerCase(),
            ).to.be.equal(
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION].toLocaleLowerCase(),
            );
            expect(await newWETH.name()).to.be.equal('Wrapped Ether');
            expect(await newWETH.symbol()).to.be.equal('WETH');
            expect(await newWETH.decimals()).to.be.equal(18);
            expect((await newWETH.bridgeAddress()).toLocaleLowerCase()).to.be.equal(
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY].toLocaleLowerCase(),
            );
        } else {
            logger.info('Sanity check sovereignWETHAddress...');
            expect(await newAgglayerBridgeL2.WETHToken()).to.be.equal(sovereignWETHAddress);
        }
    }

    logger.info('Sanity checks AgglayerGERL2...');
    // AgglayerGERL2 contract
    const newAgglayerGERL2 = new ethers.Contract(
        returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY],
        artifactAgglayerGERL2.abi,
        newAnvilProvider,
    );

    expect(
        (
            await getErc1967Admin(
                newAnvilProvider,
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY],
            )
        ).toLocaleLowerCase(),
    ).to.be.equal(proxyAdmin.address.toLocaleLowerCase());
    expect(
        (
            await getErc1967Implementation(
                newAnvilProvider,
                returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY],
            )
        ).toLocaleLowerCase(),
    ).to.be.equal(gerImplAddress.toLocaleLowerCase());

    expect((await newAgglayerGERL2.globalExitRootUpdater()).toLocaleLowerCase()).to.be.equal(
        globalExitRootUpdater.toLocaleLowerCase(),
    );
    expect((await newAgglayerGERL2.globalExitRootRemover()).toLocaleLowerCase()).to.be.equal(
        globalExitRootRemover.toLocaleLowerCase(),
    );

    // AggOracleCommittee
    if (initializeParams.useAggOracleCommittee === true) {
        logger.info('Sanity checks AggOracleCommittee...');
        const newAggOracleCommittee = new ethers.Contract(
            aggOracleCommitteeAddress,
            artifactAggOracleCommittee.abi,
            newAnvilProvider,
        );
        expect((await getErc1967Admin(newAnvilProvider, aggOracleCommitteeAddress)).toLocaleLowerCase()).to.be.equal(
            proxyAdmin.address.toLocaleLowerCase(),
        );
        expect(
            (await getErc1967Implementation(newAnvilProvider, aggOracleCommitteeAddress)).toLocaleLowerCase(),
        ).to.be.equal(aggOracleImplementationAddress.toLocaleLowerCase());
        expect((await newAggOracleCommittee.globalExitRootManagerL2Sovereign()).toLocaleLowerCase()).to.be.equal(
            returnObject.outputAddresses[GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY].toLocaleLowerCase(),
        );
        expect(await newAggOracleCommittee.quorum()).to.be.equal(initializeParams.quorum);
        expect(await newAggOracleCommittee.owner()).to.be.equal(initializeParams.aggOracleOwner);
        for (let i = 0; i < initializeParams.aggOracleMembers.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            expect(await newAggOracleCommittee.aggOracleMembers(i)).to.be.equal(initializeParams.aggOracleMembers[i]);
        }
    }

    await newAnvil.kill('SIGINT');
    await newAnvilProvider.destroy();

    returnObject.genesis = state.accounts;

    return returnObject;
}
