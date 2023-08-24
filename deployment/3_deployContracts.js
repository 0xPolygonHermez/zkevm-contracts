/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { create2Deployment } = require('./helpers/deployment-helpers');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const pathOngoingDeploymentJson = path.join(__dirname, './deploy_ongoing.json');

const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

async function main() {
    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(`There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`);
    }

    // Check if there's an ongoing deployment
    let ongoingDeployment = {};
    if (fs.existsSync(pathOngoingDeploymentJson)) {
        ongoingDeployment = require(pathOngoingDeploymentJson);
    }

    // Constant variables
    const networkIDMainnet = 0;
    const attemptsDeployProxy = 20;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        'realVerifier',
        'trustedSequencerURL',
        'networkName',
        'version',
        'trustedSequencer',
        'chainID',
        'admin',
        'trustedAggregator',
        'trustedAggregatorTimeout',
        'pendingStateTimeout',
        'forkID',
        'cdkValidiumOwner',
        'timelockAddress',
        'minDelayTimelock',
        'salt',
        'cdkValidium2DeployerAddress',
        'maticTokenAddress',
        'setupEmptyCommittee',
        'committeeTimelock',
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        realVerifier,
        trustedSequencerURL,
        networkName,
        version,
        trustedSequencer,
        chainID,
        admin,
        trustedAggregator,
        trustedAggregatorTimeout,
        pendingStateTimeout,
        forkID,
        cdkValidiumOwner,
        timelockAddress,
        minDelayTimelock,
        salt,
        cdkValidium2DeployerAddress,
        maticTokenAddress,
        setupEmptyCommittee,
        committeeTimelock,
    } = deployParameters;

    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(`Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`);
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas).div(1000),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas).div(1000),
                    };
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
        console.log('Using pvtKey deployer with address: ', deployer.address);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log('Using MNEMONIC deployer with address: ', deployer.address);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // Load cdkValidium deployer
    const CDKValidiumDeployerFactory = await ethers.getContractFactory('CDKValidiumDeployer', deployer);
    const cdkValidiumDeployerContract = CDKValidiumDeployerFactory.attach(cdkValidium2DeployerAddress);

    // check deployer is the owner of the deployer
    if (await deployer.provider.getCode(cdkValidiumDeployerContract.address) === '0x') {
        throw new Error('cdkValidium deployer contract is not deployed');
    }
    expect(deployer.address).to.be.equal(await cdkValidiumDeployerContract.owner());

    let verifierContract;
    if (!ongoingDeployment.verifierContract) {
        if (realVerifier === true) {
            const VerifierRollup = await ethers.getContractFactory('FflonkVerifier', deployer);
            verifierContract = await VerifierRollup.deploy();
            await verifierContract.deployed();
        } else {
            const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock', deployer);
            verifierContract = await VerifierRollupHelperFactory.deploy();
            await verifierContract.deployed();
        }
        console.log('#######################\n');
        console.log('Verifier deployed to:', verifierContract.address);

        // save an ongoing deployment
        ongoingDeployment.verifierContract = verifierContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        console.log('Verifier already deployed on: ', ongoingDeployment.verifierContract);
        const VerifierRollupFactory = await ethers.getContractFactory('FflonkVerifier', deployer);
        verifierContract = VerifierRollupFactory.attach(ongoingDeployment.verifierContract);
    }

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
    const deployTransactionAdmin = (proxyAdminFactory.getDeployTransaction()).data;
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData('transferOwnership', [deployer.address]);
    const [proxyAdminAddress, isProxyAdminDeployed] = await create2Deployment(
        cdkValidiumDeployerContract,
        salt,
        deployTransactionAdmin,
        dataCallAdmin,
        deployer,
    );

    if (isProxyAdminDeployed) {
        console.log('#######################\n');
        console.log('Proxy admin deployed to:', proxyAdminAddress);
    } else {
        console.log('#######################\n');
        console.log('Proxy admin was already deployed to:', proxyAdminAddress);
    }

    // Deploy implementation PolygonZkEVMBridge
    const PolygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
    const deployTransactionBridge = (PolygonZkEVMBridgeFactory.getDeployTransaction()).data;
    const dataCallNull = null;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = ethers.BigNumber.from(5500000);
    const [bridgeImplementationAddress, isBridgeImplDeployed] = await create2Deployment(
        cdkValidiumDeployerContract,
        salt,
        deployTransactionBridge,
        dataCallNull,
        deployer,
        overrideGasLimit,
    );

    if (isBridgeImplDeployed) {
        console.log('#######################\n');
        console.log('bridge impl deployed to:', bridgeImplementationAddress);
    } else {
        console.log('#######################\n');
        console.log('bridge impl was already deployed to:', bridgeImplementationAddress);
    }

    /*
     * deploy proxy
     * Do not initialize directly the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy', deployer);
    const initializeEmptyDataProxy = '0x';
    const deployTransactionProxy = (transparentProxyFactory.getDeployTransaction(
        bridgeImplementationAddress,
        proxyAdminAddress,
        initializeEmptyDataProxy,
    )).data;

    /*
     * Nonce globalExitRoot: currentNonce + 1 (deploy bridge proxy) + 1(impl globalExitRoot
     * + 1 (deploy data comittee proxy) + 1(impl data committee) + setupCommitte? = +4 or +5
     */
    const nonceDelta = 4 + (setupEmptyCommittee ? 1 : 0);
    const nonceProxyGlobalExitRoot = Number((await ethers.provider.getTransactionCount(deployer.address)))
        + nonceDelta;
    // nonceProxyCDKValidium :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl cdk) = +2
    const nonceProxyCDKValidium = nonceProxyGlobalExitRoot + 2;

    let precalculateGLobalExitRootAddress; let
        precalculateCDKValidiumAddress;

    // Check if the contract is already deployed
    if (ongoingDeployment.PolygonZkEVMGlobalExitRoot && ongoingDeployment.cdkValidiumContract) {
        precalculateGLobalExitRootAddress = ongoingDeployment.PolygonZkEVMGlobalExitRoot;
        precalculateCDKValidiumAddress = ongoingDeployment.cdkValidiumContract;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.PolygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.cdkValidiumContract;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Contracts are not deployed, normal deployment
        precalculateGLobalExitRootAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyGlobalExitRoot });
        precalculateCDKValidiumAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyCDKValidium });
    }

    const dataCallProxy = PolygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize',
        [
            networkIDMainnet,
            precalculateGLobalExitRootAddress,
            precalculateCDKValidiumAddress,
        ],
    );
    const [proxyBridgeAddress, isBridgeProxyDeployed] = await create2Deployment(
        cdkValidiumDeployerContract,
        salt,
        deployTransactionProxy,
        dataCallProxy,
        deployer,
    );
    const PolygonZkEVMBridgeContract = PolygonZkEVMBridgeFactory.attach(proxyBridgeAddress);

    if (isBridgeProxyDeployed) {
        console.log('#######################\n');
        console.log('PolygonZkEVMBridge deployed to:', PolygonZkEVMBridgeContract.address);
    } else {
        console.log('#######################\n');
        console.log('PolygonZkEVMBridge was already deployed to:', PolygonZkEVMBridgeContract.address);

        // If it was already deployed, check that the initialized calldata matches the actual deployment
        expect(precalculateGLobalExitRootAddress).to.be.equal(await PolygonZkEVMBridgeContract.globalExitRootManager());
        expect(precalculateCDKValidiumAddress).to.be.equal(await PolygonZkEVMBridgeContract.polygonZkEVMaddress());
    }

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await PolygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await PolygonZkEVMBridgeContract.networkID());
    console.log('cdkValidiumaddress:', await PolygonZkEVMBridgeContract.polygonZkEVMaddress());

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically (admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, PolygonZkEVMBridgeFactory, 'transparent');

    /*
     * Deployment Data Committee
     */
    let cdkDataCommitteeContract;
    const CDKDataCommitteeContractFactory = await ethers.getContractFactory('CDKDataCommittee', deployer);
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            cdkDataCommitteeContract = await upgrades.deployProxy(
                CDKDataCommitteeContractFactory,
                [],
            );
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of cdkDataCommitteeContract ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('cdkDataCommitteeContract contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('cdkDataCommittee deployed to:', cdkDataCommitteeContract.address);

    if (setupEmptyCommittee) {
        const expectedHash = ethers.utils.solidityKeccak256(['bytes'], [[]]);
        await expect(cdkDataCommitteeContract.connect(deployer)
            .setupCommittee(0, [], []))
            .to.emit(cdkDataCommitteeContract, 'CommitteeUpdated')
            .withArgs(expectedHash);
        console.log('Empty committee seted up');
    }

    /*
     *Deployment Global exit root manager
     */
    let PolygonZkEVMGlobalExitRoot;
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot', deployer);
    if (!ongoingDeployment.PolygonZkEVMGlobalExitRoot) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                PolygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                    initializer: false,
                    constructorArgs: [precalculateCDKValidiumAddress, proxyBridgeAddress],
                    unsafeAllow: ['constructor', 'state-variable-immutable'],
                });
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of PolygonZkEVMGlobalExitRoot ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('PolygonZkEVMGlobalExitRoot contract has not been deployed');
            }
        }

        expect(precalculateGLobalExitRootAddress).to.be.equal(PolygonZkEVMGlobalExitRoot.address);

        console.log('#######################\n');
        console.log('PolygonZkEVMGlobalExitRoot deployed to:', PolygonZkEVMGlobalExitRoot.address);

        // save an ongoing deployment
        ongoingDeployment.PolygonZkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRoot.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        // sanity check
        expect(precalculateGLobalExitRootAddress).to.be.equal(PolygonZkEVMGlobalExitRoot.address);
        // Expect the precalculate address matches de onogin deployment
        PolygonZkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRootFactory.attach(ongoingDeployment.PolygonZkEVMGlobalExitRoot);

        console.log('#######################\n');
        console.log('PolygonZkEVMGlobalExitRoot already deployed on: ', ongoingDeployment.PolygonZkEVMGlobalExitRoot);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically (admin/impl)
        await upgrades.forceImport(ongoingDeployment.PolygonZkEVMGlobalExitRoot, PolygonZkEVMGlobalExitRootFactory, 'transparent');

        // Check against current deployment
        expect(PolygonZkEVMBridgeContract.address).to.be.equal(await PolygonZkEVMBridgeContract.bridgeAddress());
        expect(precalculateCDKValidiumAddress).to.be.equal(await PolygonZkEVMBridgeContract.rollupAddress());
    }

    // deploy CDKValidium
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment CDKValidium #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('PolygonZkEVMGlobalExitRootAddress:', PolygonZkEVMGlobalExitRoot.address);
    console.log('maticTokenAddress:', maticTokenAddress);
    console.log('verifierAddress:', verifierContract.address);
    console.log('PolygonZkEVMBridgeContract:', PolygonZkEVMBridgeContract.address);

    console.log('admin:', admin);
    console.log('chainID:', chainID);
    console.log('trustedSequencer:', trustedSequencer);
    console.log('pendingStateTimeout:', pendingStateTimeout);
    console.log('trustedAggregator:', trustedAggregator);
    console.log('trustedAggregatorTimeout:', trustedAggregatorTimeout);

    console.log('genesisRoot:', genesisRootHex);
    console.log('trustedSequencerURL:', trustedSequencerURL);
    console.log('networkName:', networkName);
    console.log('forkID:', forkID);

    const CDKValidiumFactory = await ethers.getContractFactory('CDKValidium', deployer);

    let cdkValidiumContract;
    let deploymentBlockNumber;
    if (!ongoingDeployment.cdkValidiumContract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                cdkValidiumContract = await upgrades.deployProxy(
                    CDKValidiumFactory,
                    [
                        {
                            admin,
                            trustedSequencer,
                            pendingStateTimeout,
                            trustedAggregator,
                            trustedAggregatorTimeout,
                        },
                        genesisRootHex,
                        trustedSequencerURL,
                        networkName,
                        version,
                    ],
                    {
                        constructorArgs: [
                            PolygonZkEVMGlobalExitRoot.address,
                            maticTokenAddress,
                            verifierContract.address,
                            PolygonZkEVMBridgeContract.address,
                            cdkDataCommitteeContract.address,
                            chainID,
                            forkID,
                        ],
                        unsafeAllow: ['constructor', 'state-variable-immutable'],
                    },
                );
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of cdkValidiumContract ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('CDKValidium contract has not been deployed');
            }
        }

        expect(precalculateCDKValidiumAddress).to.be.equal(cdkValidiumContract.address);

        console.log('#######################\n');
        console.log('cdkValidiumContract deployed to:', cdkValidiumContract.address);

        // save an ongoing deployment
        ongoingDeployment.cdkValidiumContract = cdkValidiumContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Transfer ownership of cdkValidiumContract
        if (cdkValidiumOwner !== deployer.address) {
            await (await cdkValidiumContract.transferOwnership(cdkValidiumOwner)).wait();
        }

        deploymentBlockNumber = (await cdkValidiumContract.deployTransaction.wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateCDKValidiumAddress).to.be.equal(ongoingDeployment.cdkValidiumContract);
        cdkValidiumContract = CDKValidiumFactory.attach(ongoingDeployment.cdkValidiumContract);

        console.log('#######################\n');
        console.log('cdkValidiumContract already deployed on: ', ongoingDeployment.cdkValidiumContract);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(ongoingDeployment.cdkValidiumContract, CDKValidiumFactory, 'transparent');

        const cdkValidiumOwnerContract = await cdkValidiumContract.owner();
        if (cdkValidiumOwnerContract === deployer.address) {
            // Transfer ownership of cdkValidiumContract
            if (cdkValidiumOwner !== deployer.address) {
                await (await cdkValidiumContract.transferOwnership(cdkValidiumOwner)).wait();
            }
        } else {
            expect(cdkValidiumOwner).to.be.equal(cdkValidiumOwnerContract);
        }
        deploymentBlockNumber = 0;
    }

    console.log('\n#######################');
    console.log('#####    Checks  CDKValidium  #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await cdkValidiumContract.globalExitRootManager());
    console.log('maticTokenAddress:', await cdkValidiumContract.matic());
    console.log('verifierAddress:', await cdkValidiumContract.rollupVerifier());
    console.log('PolygonZkEVMBridgeContract:', await cdkValidiumContract.bridgeAddress());

    console.log('admin:', await cdkValidiumContract.admin());
    console.log('chainID:', await cdkValidiumContract.chainID());
    console.log('trustedSequencer:', await cdkValidiumContract.trustedSequencer());
    console.log('pendingStateTimeout:', await cdkValidiumContract.pendingStateTimeout());
    console.log('trustedAggregator:', await cdkValidiumContract.trustedAggregator());
    console.log('trustedAggregatorTimeout:', await cdkValidiumContract.trustedAggregatorTimeout());

    console.log('genesiRoot:', await cdkValidiumContract.batchNumToStateRoot(0));
    console.log('trustedSequencerURL:', await cdkValidiumContract.trustedSequencerURL());
    console.log('networkName:', await cdkValidiumContract.networkName());
    console.log('owner:', await cdkValidiumContract.owner());
    console.log('forkID:', await cdkValidiumContract.forkID());

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(precalculateCDKValidiumAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGLobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress);
    const proxyAdminOwner = await proxyAdminInstance.owner();
    const timelockContractFactory = await ethers.getContractFactory('CDKValidiumTimelock', deployer);

    // TODO test stop here

    let timelockContract;
    if (proxyAdminOwner !== deployer.address) {
        // Check if there's a timelock deployed there that match the current deployment
        timelockContract = timelockContractFactory.attach(proxyAdminOwner);
        expect(precalculateCDKValidiumAddress).to.be.equal(await timelockContract.cdkValidium());

        console.log('#######################\n');
        console.log(
            'Polygon timelockContract already deployed to:',
            timelockContract.address,
        );
    } else {
        // deploy timelock
        console.log('\n#######################');
        console.log('##### Deployment TimelockContract  #####');
        console.log('#######################');
        console.log('minDelayTimelock:', minDelayTimelock);
        console.log('timelockAddress:', timelockAddress);
        console.log('cdkValidiumAddress:', cdkValidiumContract.address);
        timelockContract = await timelockContractFactory.deploy(
            minDelayTimelock,
            [timelockAddress],
            [timelockAddress],
            timelockAddress,
            cdkValidiumContract.address,
        );
        await timelockContract.deployed();
        console.log('#######################\n');
        console.log(
            'Polygon timelockContract deployed to:',
            timelockContract.address,
        );

        // Transfer ownership of the proxyAdmin to timelock
        await upgrades.admin.transferProxyAdminOwnership(timelockContract.address);
    }

    if (committeeTimelock) {
        await (await cdkDataCommitteeContract.transferOwnership(timelockContract.address)).wait();
    }

    console.log('\n#######################');
    console.log('#####  Checks TimelockContract  #####');
    console.log('#######################');
    console.log('minDelayTimelock:', await timelockContract.getMinDelay());
    console.log('cdkValidium:', await timelockContract.cdkValidium());

    const outputJson = {
        cdkValidiumAddress: cdkValidiumContract.address,
        polygonZkEVMBridgeAddress: PolygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: PolygonZkEVMGlobalExitRoot.address,
        cdkDataCommitteeContract: cdkDataCommitteeContract.address,
        maticTokenAddress,
        verifierAddress: verifierContract.address,
        cdkValidiumDeployerContract: cdkValidiumDeployerContract.address,
        deployerAddress: deployer.address,
        timelockContractAddress: timelockContract.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        trustedSequencer,
        trustedSequencerURL,
        chainID,
        networkName,
        admin,
        trustedAggregator,
        proxyAdminAddress,
        forkID,
        salt,
        version,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
