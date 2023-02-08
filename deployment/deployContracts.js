/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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
    const trustedSequencer = deployParameters.trustedSequencerAddress;
    const trustedSequencerURL = deployParameters.trustedSequencerURL || 'http://zkevm-json-rpc:8123';
    const realVerifier = deployParameters.realVerifier || false;
    const { chainID, networkName } = deployParameters;
    const minDelayTimelock = deployParameters.minDelayTimelock || 10; // Should put some default parameter
    const forkID = deployParameters.forkID || 0;
    const version = '0.0.1';

    const pendingStateTimeout = deployParameters.pendingStateTimeout || (60 * 60 * 24 * 7 - 1);
    const trustedAggregatorTimeout = deployParameters.trustedAggregatorTimeout || (60 * 60 * 24 * 7 - 1);

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
    const admin = deployParameters.admin || deployer.address;
    const trustedAggregator = deployParameters.trustedAggregator || deployer.address;
    const timelockAddress = deployParameters.timelockAddress || deployer.address;

    /*
     *Deployment MATIC
     */
    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock', deployer);
    const maticTokenContract = await maticTokenFactory.deploy(
        maticTokenName,
        maticTokenSymbol,
        deployer.address,
        maticTokenInitialBalance,
    );
    await maticTokenContract.deployed();

    console.log('#######################\n');
    console.log('Matic deployed to:', maticTokenContract.address);

    /*
     *Deployment verifier
     */
    let verifierContract;
    if (realVerifier === true) {
        const VerifierRollup = await ethers.getContractFactory('Verifier', deployer);
        verifierContract = await VerifierRollup.deploy();
        await verifierContract.deployed();
    } else {
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock', deployer);
        verifierContract = await VerifierRollupHelperFactory.deploy();
        await verifierContract.deployed();
    }

    console.log('#######################\n');
    console.log('Verifier deployed to:', verifierContract.address);
    /*
     *Deployment Global exit root manager
     */

    /*
     * deploy global exit root manager
     * transaction count + 1(proxyAdmin) + 1(impl globalExitRoot) + 1(proxy globalExitRoot) + 1(impl bridge) = +4
     */
    const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + 4;
    // +1 (proxy bridge) + 1 (impl Zkevm)
    const nonceProxyZkevm = nonceProxyBridge + 2;

    const precalculateBridgeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
    const precalculateZkevmAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });

    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot', deployer);
    let polygonZkEVMGlobalExitRoot;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                initializer: false,
                constructorArgs: [precalculateZkevmAddress, precalculateBridgeAddress],
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

    // deploy PolygonZkEVMBridge
    let polygonZkEVMBridgeFactory;
    if (deployParameters.polygonZkEVMBridgeMock) {
        polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeMock', deployer);
    } else {
        polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
    }

    let polygonZkEVMBridgeContract;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMBridgeContract = await upgrades.deployProxy(
                polygonZkEVMBridgeFactory,
                [
                    networkIDMainnet,
                    polygonZkEVMGlobalExitRoot.address,
                    precalculateZkevmAddress,
                ],
            );
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZkEVMBridgeContract ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('PolygonZkEVMBridge contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('PolygonZkEVMBridge deployed to:', polygonZkEVMBridgeContract.address);

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await polygonZkEVMBridgeContract.networkID());
    console.log('zkEVMaddress:', await polygonZkEVMBridgeContract.polygonZkEVMaddress());

    // deploy PolygonZkEVMMock
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Polygon ZK-EVM #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('PolygonZkEVMGlobalExitRootAddress:', polygonZkEVMGlobalExitRoot.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
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

    const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock', deployer);
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
                        maticTokenContract.address,
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

    console.log('#######################\n');
    console.log('Polygon ZK-EVM deployed to:', polygonZkEVMContract.address);

    expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
    expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);

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

    // fund sequencer account with tokens and ether if it have less than 0.1 ether.
    const balanceEther = await ethers.provider.getBalance(trustedSequencer);
    const minEtherBalance = ethers.utils.parseEther('0.1');
    if (balanceEther < minEtherBalance) {
        const params = {
            to: trustedSequencer,
            value: minEtherBalance,
        };
        await deployer.sendTransaction(params);
    }
    const tokensBalance = ethers.utils.parseEther('100000');
    await (await maticTokenContract.transfer(trustedSequencer, tokensBalance)).wait();

    // fund aggregator account with ether if it have less than 0.1 ether.
    const balanceEtherAggr = await ethers.provider.getBalance(trustedAggregator);
    if (balanceEtherAggr < minEtherBalance) {
        const params = {
            to: trustedAggregator,
            value: minEtherBalance,
        };
        await deployer.sendTransaction(params);
    }

    // approve tokens for trusted sequencer
    if (deployParameters.trustedSequencerPvtKey) {
        const trustedSequencerWallet = new ethers.Wallet(deployParameters.trustedSequencerPvtKey, currentProvider);
        await maticTokenContract.connect(trustedSequencerWallet).approve(polygonZkEVMContract.address, ethers.constants.MaxUint256);
    }

    const outputJson = {
        polygonZkEVMAddress: polygonZkEVMContract.address,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot.address,
        maticTokenAddress: maticTokenContract.address,
        verifierAddress: verifierContract.address,
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
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
