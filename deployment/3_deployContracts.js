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
        'supernets2Owner',
        'timelockAddress',
        'minDelayTimelock',
        'salt',
        'supernets2DeployerAddress',
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
        supernets2Owner,
        timelockAddress,
        minDelayTimelock,
        salt,
        supernets2DeployerAddress,
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

    // Load supernets2 deployer
    const Supernets2DeployerFactory = await ethers.getContractFactory('Supernets2Deployer', deployer);
    const supernets2DeployerContract = Supernets2DeployerFactory.attach(supernets2DeployerAddress);

    // check deployer is the owner of the deployer
    if (await deployer.provider.getCode(supernets2DeployerContract.address) === '0x') {
        throw new Error('supernets2 deployer contract is not deployed');
    }
    expect(deployer.address).to.be.equal(await supernets2DeployerContract.owner());

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
        supernets2DeployerContract,
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
        supernets2DeployerContract,
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
    // nonceProxySupernets2 :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl supernets) = +2
    const nonceProxySupernets2 = nonceProxyGlobalExitRoot + 2;

    let precalculateGLobalExitRootAddress; let
        precalculateSupernets2Address;

    // Check if the contract is already deployed
    if (ongoingDeployment.PolygonZkEVMGlobalExitRoot && ongoingDeployment.supernets2Contract) {
        precalculateGLobalExitRootAddress = ongoingDeployment.PolygonZkEVMGlobalExitRoot;
        precalculateSupernets2Address = ongoingDeployment.supernets2Contract;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.PolygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.supernets2Contract;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Contracts are not deployed, normal deployment
        precalculateGLobalExitRootAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyGlobalExitRoot });
        precalculateSupernets2Address = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxySupernets2 });
    }

    const dataCallProxy = PolygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize',
        [
            networkIDMainnet,
            precalculateGLobalExitRootAddress,
            precalculateSupernets2Address,
        ],
    );
    const [proxyBridgeAddress, isBridgeProxyDeployed] = await create2Deployment(
        supernets2DeployerContract,
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
        expect(precalculateSupernets2Address).to.be.equal(await PolygonZkEVMBridgeContract.polygonZkEVMaddress());
    }

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await PolygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await PolygonZkEVMBridgeContract.networkID());
    console.log('supernets2address:', await PolygonZkEVMBridgeContract.polygonZkEVMaddress());

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically (admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, PolygonZkEVMBridgeFactory, 'transparent');

    /*
     * Deployment Data Committee
     */
    let supernets2DataCommitteeContract;
    const Supernets2DataCommitteeContractFactory = await ethers.getContractFactory('Supernets2DataCommittee', deployer);
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            supernets2DataCommitteeContract = await upgrades.deployProxy(
                Supernets2DataCommitteeContractFactory,
                [],
            );
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of supernets2DataCommitteeContract ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('supernets2DataCommitteeContract contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('supernets2DataCommittee deployed to:', supernets2DataCommitteeContract.address);

    if (setupEmptyCommittee) {
        const expectedHash = ethers.utils.solidityKeccak256(['bytes'], [[]]);
        await expect(supernets2DataCommitteeContract.connect(deployer)
            .setupCommittee(0, [], []))
            .to.emit(supernets2DataCommitteeContract, 'CommitteeUpdated')
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
                    constructorArgs: [precalculateSupernets2Address, proxyBridgeAddress],
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
        expect(precalculateSupernets2Address).to.be.equal(await PolygonZkEVMBridgeContract.rollupAddress());
    }

    // deploy Supernets2M
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Supernets2 #####');
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

    const Supernets2Factory = await ethers.getContractFactory('Supernets2', deployer);

    let supernets2Contract;
    let deploymentBlockNumber;
    if (!ongoingDeployment.supernets2Contract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                supernets2Contract = await upgrades.deployProxy(
                    Supernets2Factory,
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
                            supernets2DataCommitteeContract.address,
                            chainID,
                            forkID,
                        ],
                        unsafeAllow: ['constructor', 'state-variable-immutable'],
                    },
                );
                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of supernets2Contract ', error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('Supernets2 contract has not been deployed');
            }
        }

        expect(precalculateSupernets2Address).to.be.equal(supernets2Contract.address);

        console.log('#######################\n');
        console.log('supernets2Contract deployed to:', supernets2Contract.address);

        // save an ongoing deployment
        ongoingDeployment.supernets2Contract = supernets2Contract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Transfer ownership of supernets2Contract
        if (supernets2Owner !== deployer.address) {
            await (await supernets2Contract.transferOwnership(supernets2Owner)).wait();
        }

        deploymentBlockNumber = (await supernets2Contract.deployTransaction.wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateSupernets2Address).to.be.equal(ongoingDeployment.supernets2Contract);
        supernets2Contract = Supernets2Factory.attach(ongoingDeployment.supernets2Contract);

        console.log('#######################\n');
        console.log('supernets2Contract already deployed on: ', ongoingDeployment.supernets2Contract);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(ongoingDeployment.supernets2Contract, Supernets2Factory, 'transparent');

        const supernets2OwnerContract = await supernets2Contract.owner();
        if (supernets2OwnerContract === deployer.address) {
            // Transfer ownership of supernets2Contract
            if (supernets2Owner !== deployer.address) {
                await (await supernets2Contract.transferOwnership(supernets2Owner)).wait();
            }
        } else {
            expect(supernets2Owner).to.be.equal(supernets2OwnerContract);
        }
        deploymentBlockNumber = 0;
    }

    console.log('\n#######################');
    console.log('#####    Checks  Supernets2  #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await supernets2Contract.globalExitRootManager());
    console.log('maticTokenAddress:', await supernets2Contract.matic());
    console.log('verifierAddress:', await supernets2Contract.rollupVerifier());
    console.log('PolygonZkEVMBridgeContract:', await supernets2Contract.bridgeAddress());

    console.log('admin:', await supernets2Contract.admin());
    console.log('chainID:', await supernets2Contract.chainID());
    console.log('trustedSequencer:', await supernets2Contract.trustedSequencer());
    console.log('pendingStateTimeout:', await supernets2Contract.pendingStateTimeout());
    console.log('trustedAggregator:', await supernets2Contract.trustedAggregator());
    console.log('trustedAggregatorTimeout:', await supernets2Contract.trustedAggregatorTimeout());

    console.log('genesiRoot:', await supernets2Contract.batchNumToStateRoot(0));
    console.log('trustedSequencerURL:', await supernets2Contract.trustedSequencerURL());
    console.log('networkName:', await supernets2Contract.networkName());
    console.log('owner:', await supernets2Contract.owner());
    console.log('forkID:', await supernets2Contract.forkID());

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(precalculateSupernets2Address)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGLobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress);
    const proxyAdminOwner = await proxyAdminInstance.owner();
    const timelockContractFactory = await ethers.getContractFactory('Supernets2Timelock', deployer);

    // TODO test stop here

    let timelockContract;
    if (proxyAdminOwner !== deployer.address) {
        // Check if there's a timelock deployed there that match the current deployment
        timelockContract = timelockContractFactory.attach(proxyAdminOwner);
        expect(precalculateSupernets2Address).to.be.equal(await timelockContract.supernets2());

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
        console.log('supernets2Address:', supernets2Contract.address);
        timelockContract = await timelockContractFactory.deploy(
            minDelayTimelock,
            [timelockAddress],
            [timelockAddress],
            timelockAddress,
            supernets2Contract.address,
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
        await (await supernets2DataCommitteeContract.transferOwnership(timelockContract.address)).wait();
    }

    console.log('\n#######################');
    console.log('#####  Checks TimelockContract  #####');
    console.log('#######################');
    console.log('minDelayTimelock:', await timelockContract.getMinDelay());
    console.log('supernets2:', await timelockContract.supernets2());

    const outputJson = {
        supernets2Address: supernets2Contract.address,
        polygonZkEVMBridgeAddress: PolygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: PolygonZkEVMGlobalExitRoot.address,
        supernets2DataCommitteeContract: supernets2DataCommitteeContract.address,
        maticTokenAddress,
        verifierAddress: verifierContract.address,
        supernets2DeployerContract: supernets2DeployerContract.address,
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
