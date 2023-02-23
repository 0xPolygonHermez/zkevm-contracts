/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { deployPolygonZkEVMDeployer, create2Deployment } = require('./helpers/deployment-helpers');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

async function main() {
    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(`There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`);
    }

    // Constant variables
    const networkIDMainnet = 0;
    const attemptsDeployProxy = 20;

    // Check deploy parameters
    const trustedSequencerURL = deployParameters.trustedSequencerURL || 'http://zkevm-json-rpc:8123';
    const realVerifier = deployParameters.realVerifier || false;
    const minDelayTimelock = deployParameters.minDelayTimelock || 10; // Should put some default parameter
    const forkID = deployParameters.forkID || 0;
    const version = deployParameters.version || '0.0.1';
    const pendingStateTimeout = deployParameters.pendingStateTimeout || (60 * 60 * 24 * 7 - 1); // 1 week minus 1
    const trustedAggregatorTimeout = deployParameters.trustedAggregatorTimeout || (60 * 60 * 24 * 7 - 1); // 1 week minus 1
    const { chainID, networkName, maticTokenAddress } = deployParameters;
    const isTestnet = deployParameters.testnet || false;
    // Salt used for create2 deployment
    const salt = deployParameters.salt || ethers.constants.HashZero;

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
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),
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
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // Check trusted address from deploy parameters
    const trustedSequencer = deployParameters.trustedSequencerAddress;
    const { trustedAggregator } = deployParameters;
    const admin = deployParameters.admin || deployer.address;
    const timelockAddress = deployParameters.timelockAddress || deployer.address;
    const zkEVMOwner = deployParameters.zkEVMOwner || deployer.address;

    /*
     *Deployment verifier
     */
    let verifierContract;
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

    // Deploy PolygonZkEVMDeployer if is not deployed already using keyless deployment
    const [zkEVMDeployerContract, keylessDeployer]  = await deployPolygonZkEVMDeployer(deployer);

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
    const deployTransactionAdmin = (proxyAdminFactory.getDeployTransaction()).data;
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData('transferOwnership', [deployer.address]);
    const proxyAdminAddress = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionAdmin, dataCallAdmin, deployer);

    console.log('#######################\n');
    console.log('Proxy admin deployed to:', proxyAdminAddress);

    // Deploy implementation PolygonZkEVMBridg
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
    const deployTransactionBridge = (polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = ethers.BigNumber.from(5500000);
    const bridgeImplementationAddress = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit,
    );

    console.log('#######################\n');
    console.log('bridge impl deployed to:', bridgeImplementationAddress);

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
     * Nonce globalExitRoot: 1 (deploy bridge proxy) + 1(impl globalExitRoot) = +2
     */
    const nonceProxyGlobalExitRoot = Number((await ethers.provider.getTransactionCount(deployer.address))) + 2;
    // nonceProxyZkevm :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl Zkevm) = +2
    const nonceProxyZkevm = nonceProxyGlobalExitRoot + 2;

    const precalculateGLobalExitRootAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyGlobalExitRoot });
    const precalculateZkevmAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });

    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize',
        [
            networkIDMainnet,
            precalculateGLobalExitRootAddress,
            precalculateZkevmAddress,
        ],
    );
    const proxyBridgeAddress = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionProxy, dataCallProxy, deployer);
    const polygonZkEVMBridgeContract = polygonZkEVMBridgeFactory.attach(proxyBridgeAddress);

    console.log('#######################\n');
    console.log('PolygonZkEVMBridge deployed to:', polygonZkEVMBridgeContract.address);

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await polygonZkEVMBridgeContract.networkID());
    console.log('zkEVMaddress:', await polygonZkEVMBridgeContract.polygonZkEVMaddress());

    // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, polygonZkEVMBridgeFactory, 'transparent');

    /*
     *Deployment Global exit root manager
     */
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot', deployer);
    let polygonZkEVMGlobalExitRoot;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                initializer: false,
                constructorArgs: [precalculateZkevmAddress, proxyBridgeAddress],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZkEVMGlobalExitRoot ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('polygonZkEVMGlobalExitRoot contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('polygonZkEVMGlobalExitRoot deployed to:', polygonZkEVMGlobalExitRoot.address);

    // deploy PolygonZkEVMMock
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Polygon ZK-EVM #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('PolygonZkEVMGlobalExitRootAddress:', polygonZkEVMGlobalExitRoot.address);
    console.log('maticTokenAddress:', maticTokenAddress);
    console.log('verifierAddress:', verifierContract.address);
    console.log('polygonZkEVMBridgeContract:', polygonZkEVMBridgeContract.address);

    console.log('admin:', admin);
    console.log('chainID:', chainID);
    console.log('trustedSequencer:', trustedSequencer);
    console.log('pendingStateTimeout:', pendingStateTimeout);
    console.log('trustedAggregator:', trustedAggregator);
    console.log('trustedAggregatorTimeout:', trustedAggregatorTimeout);

    console.log('genesisRoot:', genesisRootHex);
    console.log('trustedSequencerURL:', trustedSequencerURL);
    console.log('networkName:', networkName);
    console.log('networkName:', forkID);

    let PolygonZkEVMFactory;
    if (isTestnet) {
        PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMTestnet', deployer);
    } else {
        PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM', deployer);
    }

    let polygonZkEVMContract;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMContract = await upgrades.deployProxy(
                PolygonZkEVMFactory,
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
                        polygonZkEVMGlobalExitRoot.address,
                        maticTokenAddress,
                        verifierContract.address,
                        polygonZkEVMBridgeContract.address,
                        chainID,
                        forkID,
                    ],
                    unsafeAllow: ['constructor', 'state-variable-immutable'],
                },
            );
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZkEVMContract ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('PolygonZkEVM contract has not been deployed');
        }
    }
    console.log('\n#######################');
    console.log('#####    Checks  PolygonZkEVMMock  #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMContract.globalExitRootManager());
    console.log('maticTokenAddress:', await polygonZkEVMContract.matic());
    console.log('verifierAddress:', await polygonZkEVMContract.rollupVerifier());
    console.log('polygonZkEVMBridgeContract:', await polygonZkEVMContract.bridgeAddress());

    console.log('admin:', await polygonZkEVMContract.admin());
    console.log('chainID:', await polygonZkEVMContract.chainID());
    console.log('trustedSequencer:', await polygonZkEVMContract.trustedSequencer());
    console.log('pendingStateTimeout:', await polygonZkEVMContract.pendingStateTimeout());
    console.log('trustedAggregator:', await polygonZkEVMContract.trustedAggregator());
    console.log('trustedAggregatorTimeout:', await polygonZkEVMContract.trustedAggregatorTimeout());

    console.log('genesiRoot:', await polygonZkEVMContract.batchNumToStateRoot(0));
    console.log('trustedSequencerURL:', await polygonZkEVMContract.trustedSequencerURL());
    console.log('networkName:', await polygonZkEVMContract.networkName());
    console.log('owner:', await polygonZkEVMContract.owner());
    console.log('forkID:', await polygonZkEVMContract.forkID());

    console.log('#######################\n');
    console.log('Polygon ZK-EVM deployed to:', polygonZkEVMContract.address);

    expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);
    expect(precalculateGLobalExitRootAddress).to.be.equal(polygonZkEVMGlobalExitRoot.address);
    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(precalculateZkevmAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGLobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    // Unactivate the forced Batches checking flag
    if (isTestnet && deployParameters.disallowForceBatches) {
        await (await polygonZkEVMContract.setForcedBatchesAllowed(1)).wait();
    }

    // Transfer ownership of polygonZkEVMContract
    if (zkEVMOwner !== deployer.address) {
        await (await polygonZkEVMContract.transferOwnership(zkEVMOwner)).wait();
    }
    /*
     *Deployment Time lock
     */
    console.log('\n#######################');
    console.log('##### Deployment TimelockContract  #####');
    console.log('#######################');
    console.log('minDelayTimelock:', minDelayTimelock);
    console.log('timelockAddress:', timelockAddress);
    console.log('zkEVMAddress:', polygonZkEVMContract.address);

    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = await timelockContractFactory.deploy(
        minDelayTimelock,
        [timelockAddress],
        [timelockAddress],
        timelockAddress,
        polygonZkEVMContract.address,
    );
    await timelockContract.deployed();

    console.log('#######################\n');
    console.log(
        'Polygon timelockContract deployed to:',
        timelockContract.address,
    );

    console.log('\n#######################');
    console.log('#####  Checks TimelockContract  #####');
    console.log('#######################');
    console.log('minDelayTimelock:', await timelockContract.getMinDelay());
    console.log('polygonZkEVM:', polygonZkEVMContract.address);

    // Transfer ownership of the proxyAdmin to timelock
    await upgrades.admin.transferProxyAdminOwnership(timelockContract.address);

    const deploymentBlockNumber = (await polygonZkEVMContract.deployTransaction.wait()).blockNumber;

    const outputJson = {
        polygonZkEVMAddress: polygonZkEVMContract.address,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot.address,
        maticTokenAddress,
        verifierAddress: verifierContract.address,
        zkEVMDeployerContract: zkEVMDeployerContract.address,
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
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
