import path = require('path');
import fs = require('fs');
import zlib from 'zlib';
import { ethers } from 'ethers';
import { expect } from 'chai';
import { GENESIS_CONTRACT_NAMES, TIMELOCK_ADMIN_ROLE, EXECUTOR_ROLE, PROPOSER_ROLE, CANCELLER_ROLE } from './constants';
import {
    getAddressesGenesisBase,
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
    getMinDelayTimelock,
    getBalanceBridge,
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
export async function createGenesisAnvil(_genesisBase: any, initializeParams: any, config: any) {
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
    ];
    checkParams(initializeParams, mandatoryParameters);

    const returnObject = { genesis: {} as any, outputAddresses: {} as any };

    /// ///////////////////////////////////
    ///   GET ADDRESSES BASE GENESIS   ///
    /// ///////////////////////////////////
    logger.info('Get addresses from genesis base');

    // get genesis from genesisBase (skip the root)
    let genesisBase = _genesisBase.genesis;

    // Remove BYTECODE_STORER contract if present
    genesisBase = genesisBase.filter(function (obj) {
        return obj.contractName !== GENESIS_CONTRACT_NAMES.BYTECODE_STORER;
    });

    // get addresses from genesis base
    const genesisBaseAddresses = await getAddressesGenesisBase(genesisBase);

    // get default minDelay from the timelock
    const defaultMinDelayTimelock = Number(await getMinDelayTimelock(genesisBase));

    await checkAnvilVersion();

    const port = config.anvilPort ? config.anvilPort : 8545;
    // start anvil
    const anvil = startAnvil(port);
    logger.info(`Anvil started with PID: ${anvil.pid}`, anvil.pid?.toString());
    const anvilProvider = await waitForAnvil(port);

    /// /////////////////////////
    ///   SET CONFIG VALUES  ///
    /// /////////////////////////
    logger.info('Set parameters values');

    // TIMELOCK_MINDELAY
    let timelockMinDelay;
    // Set the default minDelay from the timelock
    if (config.timelock === undefined || config.timelock.minDelay === undefined) {
        timelockMinDelay = defaultMinDelayTimelock;
    } else {
        // Check if the minDelay is a number
        if (typeof config.timelock.minDelay !== 'number') {
            throw new Error('minDelay must be a number');
        }
        // Check if the minDelay is greater than 0
        if (config.timelock.minDelay <= 0) {
            throw new Error('minDelay must be greater than 0');
        }
        // Check if the minDelay is less than the default minDelay
        if (config.timelock.minDelay < defaultMinDelayTimelock) {
            logger.warn(
                `minDelay is less than the default minDelay (${defaultMinDelayTimelock}). This can cause issues with the timelock.`,
            );
        }

        timelockMinDelay = config.timelock.minDelay;
    }

    // TIMELOCK_OWNER
    let timelockOwner;
    // Set the default owner from the genesis base
    if (config.timelock === undefined || config.timelock.owner === undefined) {
        timelockOwner = genesisBaseAddresses.deployerAddress;
    } else {
        // Check if the owner is a valid address
        if (!ethers.isAddress(config.timelock.owner)) {
            throw new Error('timelock owner must be a valid address');
        }
        timelockOwner = config.timelock.owner;
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
    returnObject.outputAddresses.timelock = timelockContract.address;

    // Deploy proxyAdmin
    logger.info('Deploying ProxyAdmin contract...');
    const proxyAdmin = await deployProxyAdmin(deployer, timelockContract.address);
    logger.info(`ProxyAdmin deployed at address: ${proxyAdmin.address}`);
    returnObject.outputAddresses.proxyAdmin = proxyAdmin.address;

    // deploy AgglayerBridgeL2
    logger.info('Deploying AgglayerBridgeL2 contract...');
    const bridgeDeploymentResult = await deployAgglayerBridgeL2(proxyAdmin.contract, deployer);
    // Get addresses from bridge deployment
    const bridgeProxyAddress = bridgeDeploymentResult.proxyAddress;
    const bridgeImplAddress = bridgeDeploymentResult.implementationAddress;
    logger.info(`AgglayerBridgeL2 deployed at proxy address: ${bridgeProxyAddress}`);
    logger.info(`AgglayerBridgeL2 deployed at implementation address: ${bridgeImplAddress}`);
    // Warn: the bridge proxy address is the same as genesis base
    returnObject.outputAddresses.agglayerBridgeL2Proxy = genesisBaseAddresses.bridgeProxyAddress;
    returnObject.outputAddresses.agglayerBridgeL2Impl = bridgeImplAddress;
    returnObject.outputAddresses.bridgeLib = await bridgeDeploymentResult.contract.bridgeLib();
    returnObject.outputAddresses.wrappedTokenBridgeImpl =
        await bridgeDeploymentResult.contract.getWrappedTokenBridgeImplementation();

    // deploy AgglayerGERL2
    logger.info('Deploying AgglayerGERL2 contract...');
    const gerDeploymentResult = await deployAgglayerGERL2(
        proxyAdmin.contract,
        deployer,
        genesisBaseAddresses.bridgeProxyAddress, // Constructor arguments
    );
    // Get addresses from ger deployment
    const gerProxyAddress = gerDeploymentResult.proxyAddress;
    const gerImplAddress = gerDeploymentResult.implementationAddress;
    logger.info(`AgglayerGERL2 deployed at proxy address: ${gerProxyAddress}`);
    logger.info(`AgglayerGERL2 deployed at implementation address: ${gerImplAddress}`);
    // Warn: the ger proxy address is the same as genesis base
    returnObject.outputAddresses.agglayerGERL2Proxy = genesisBaseAddresses.gerManagerProxyAddress;
    returnObject.outputAddresses.agglayerGERL2Impl = gerImplAddress;

    /// ///////////////////////////////////
    ///   DEPLOY AGGORACLE COMMITTEE   ////
    /// ///////////////////////////////////
    let globalExitRootUpdater;
    let aggOracleImplementationAddress;
    let aggOracleCommitteeAddress;
    let aggOracleCommitteeDeploymentResult;

    if (initializeParams.useAggOracleCommittee === true) {
        checkParams(initializeParams, ['aggOracleCommittee', 'quorum', 'aggOracleOwner']);
        // deploy AggOracleCommittee
        logger.info('Deploying AggOracleCommittee contract...');
        aggOracleCommitteeDeploymentResult = await deployAggOracleCommittee(
            proxyAdmin.contract,
            deployer,
            returnObject.outputAddresses.agglayerGERL2Proxy,
        );
        aggOracleCommitteeAddress = aggOracleCommitteeDeploymentResult.proxyAddress;
        aggOracleImplementationAddress = aggOracleCommitteeDeploymentResult.implementationAddress;
        logger.info(`AggOracleCommittee deployed at proxy address: ${aggOracleCommitteeAddress}`);
        logger.info(`AggOracleCommittee deployed at implementation address: ${aggOracleImplementationAddress}`);
        returnObject.outputAddresses.aggOracleCommittee = aggOracleCommitteeAddress;
        returnObject.outputAddresses.aggOracleCommitteeImpl = aggOracleImplementationAddress;

        initializeParams.globalExitRootUpdater = aggOracleCommitteeAddress;
        globalExitRootUpdater = aggOracleCommitteeAddress;

        /// ///////////////////////////////////////
        ///   INITIALIZE AGGORACLE COMMITTEE   ///
        /// //////////////////////////////////////
        logger.info('initializing AggOracleCommittee contract...');
        await aggOracleCommitteeDeploymentResult.contract.initialize(
            initializeParams.aggOracleOwner,
            initializeParams.aggOracleCommittee,
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

    await bridgeDeploymentResult.contract.initialize(
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        genesisBaseAddresses.gerManagerProxyAddress, // Global exit root manager address from base genesis
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
        returnObject.outputAddresses.WETHToken = await bridgeDeploymentResult.contract.WETHToken();
        [name, symbol, decimals] = ethers.AbiCoder.defaultAbiCoder().decode(
            ['string', 'string', 'uint8'],
            await bridgeDeploymentResult.contract.gasTokenMetadata(),
        );
    }

    logger.info('Initializing AgglayerGERL2 contract...');

    // Initialize the AgglayerGERL2 contract
    await gerDeploymentResult.contract.initialize(globalExitRootUpdater, globalExitRootRemover);

    const hex = await anvilProvider.send('anvil_dumpState', []);
    const buf = Buffer.from(hex.slice(2), 'hex');
    const json = zlib.gunzipSync(buf).toString('utf8');

    const state = JSON.parse(json);
    // set old proxy bridge address
    state.accounts[genesisBaseAddresses.bridgeProxyAddress] = state.accounts[bridgeDeploymentResult.proxyAddress];
    delete state.accounts[bridgeDeploymentResult.proxyAddress];

    // set old balance bridge
    state.accounts[genesisBaseAddresses.bridgeProxyAddress].balance = getBalanceBridge(genesisBase);

    // set old proxy bridge address in WETH
    expect(
        state.accounts[returnObject.outputAddresses.WETHToken.toLocaleLowerCase()].storage[
            '0x863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00'
        ].slice(24, 64),
    ).to.be.equal(bridgeProxyAddress.slice(2));
    state.accounts[returnObject.outputAddresses.WETHToken.toLocaleLowerCase()].storage[
        '0x863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00'
    ] = state.accounts[returnObject.outputAddresses.WETHToken.toLocaleLowerCase()].storage[
        '0x863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00'
    ].replace(
        bridgeProxyAddress.slice(2),
        returnObject.outputAddresses.agglayerBridgeL2Proxy.slice(2).toLocaleLowerCase(),
    );

    // set old proxy ger address
    state.accounts[genesisBaseAddresses.gerManagerProxyAddress] = state.accounts[gerDeploymentResult.proxyAddress];
    delete state.accounts[gerDeploymentResult.proxyAddress];

    // delete create2 deployer deterministic anvil
    delete state.accounts['0x4e59b44847b379578588920ca78fbf26c0b4956c'];

    // unset balance timelockOwner
    state.accounts[timelockOwner.toLocaleLowerCase()].balance = '0x0';

    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisAnvil/state.json'),
        JSON.stringify(state, null, 2),
    );

    logger.info(`File out: ${path.join(__dirname, '../../tools/createSovereignGenesisAnvil/state.json')}`);

    await anvil.kill('SIGINT');
    await anvilProvider.destroy();

    const newAnvil = startAnvil(port);
    logger.info(`Anvil started with PID: ${newAnvil.pid}`, newAnvil.pid?.toString());
    const newAnvilProvider = await waitForAnvil(port);
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
        returnObject.outputAddresses.agglayerBridgeL2Proxy,
        artifactAgglayerBridgeL2.abi,
        newAnvilProvider,
    );

    expect(
        (
            await getErc1967Admin(newAnvilProvider, returnObject.outputAddresses.agglayerBridgeL2Proxy)
        ).toLocaleLowerCase(),
    ).to.be.equal(proxyAdmin.address.toLocaleLowerCase());
    expect(
        (
            await getErc1967Implementation(newAnvilProvider, returnObject.outputAddresses.agglayerBridgeL2Proxy)
        ).toLocaleLowerCase(),
    ).to.be.equal(bridgeImplAddress.toLocaleLowerCase());
    expect((await newAgglayerBridgeL2.getWrappedTokenBridgeImplementation()).toLocaleLowerCase()).to.be.equal(
        returnObject.outputAddresses.wrappedTokenBridgeImpl.toLocaleLowerCase(),
    );
    expect(await newAgglayerBridgeL2.bridgeLib()).to.be.equal(returnObject.outputAddresses.bridgeLib);
    expect(await newAgglayerBridgeL2.networkID()).to.be.equal(rollupID);
    expect((await newAgglayerBridgeL2.bridgeManager()).toLocaleLowerCase()).to.be.equal(
        bridgeManager.toLocaleLowerCase(),
    );
    expect((await newAgglayerBridgeL2.globalExitRootManager()).toLocaleLowerCase()).to.be.equal(
        returnObject.outputAddresses.agglayerGERL2Proxy.toLocaleLowerCase(),
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
            expect(await newAgglayerBridgeL2.WETHToken()).to.be.equal(returnObject.outputAddresses.WETHToken);
            const newWETH = new ethers.Contract(
                returnObject.outputAddresses.WETHToken,
                artifactTokenWrapped.abi,
                newAnvilProvider,
            );
            expect(
                (await getErc1967Admin(newAnvilProvider, returnObject.outputAddresses.WETHToken)).toLocaleLowerCase(),
            ).to.be.equal(proxiedTokensManager.toLocaleLowerCase());
            expect(
                (
                    await getErc1967Implementation(newAnvilProvider, returnObject.outputAddresses.WETHToken)
                ).toLocaleLowerCase(),
            ).to.be.equal(returnObject.outputAddresses.wrappedTokenBridgeImpl.toLocaleLowerCase());
            expect(await newWETH.name()).to.be.equal('Wrapped Ether');
            expect(await newWETH.symbol()).to.be.equal('WETH');
            expect(await newWETH.decimals()).to.be.equal(18);
            expect((await newWETH.bridgeAddress()).toLocaleLowerCase()).to.be.equal(
                returnObject.outputAddresses.agglayerBridgeL2Proxy.toLocaleLowerCase(),
            );
        } else {
            logger.info('Sanity check sovereignWETHAddress...');
            expect(await newAgglayerBridgeL2.WETHToken()).to.be.equal(sovereignWETHAddress);
        }
    }

    logger.info('Sanity checks AgglayerGERL2...');
    // AgglayerGERL2 contract
    const newAgglayerGERL2 = new ethers.Contract(
        returnObject.outputAddresses.agglayerGERL2Proxy,
        artifactAgglayerGERL2.abi,
        newAnvilProvider,
    );

    expect(
        (await getErc1967Admin(newAnvilProvider, returnObject.outputAddresses.agglayerGERL2Proxy)).toLocaleLowerCase(),
    ).to.be.equal(proxyAdmin.address.toLocaleLowerCase());
    expect(
        (
            await getErc1967Implementation(newAnvilProvider, returnObject.outputAddresses.agglayerGERL2Proxy)
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
            returnObject.outputAddresses.agglayerGERL2Proxy.toLocaleLowerCase(),
        );
        expect(await newAggOracleCommittee.quorum()).to.be.equal(initializeParams.quorum);
        expect(await newAggOracleCommittee.owner()).to.be.equal(initializeParams.aggOracleOwner);
        for (let i = 0; i < initializeParams.aggOracleCommittee.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            expect(await newAggOracleCommittee.aggOracleMembers(i)).to.be.equal(initializeParams.aggOracleCommittee[i]);
        }
    }

    await newAnvil.kill('SIGINT');
    await newAnvilProvider.destroy();

    returnObject.genesis = state.accounts;

    return returnObject;
}
