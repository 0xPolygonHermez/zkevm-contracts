/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');

const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

async function main() {
    const networkIDMainnet = 0;
    const forceBatchAllowed = Boolean(deployParameters.forceBatchAllowed);
    const trustedSequencer = deployParameters.trustedSequencerAddress;
    const trustedSequencerURL = deployParameters.trustedSequencerURL || 'http://zkevm-json-rpc:8123';
    const realVerifier = deployParameters.realVerifier || false;
    const { chainID, networkName } = deployParameters;

    const pendingStateTimeout = deployParameters.pendingStateTimeout || (60 * 60 * 24 * 7 - 1);
    const trustedAggregatorTimeout = deployParameters.trustedAggregatorTimeout || (60 * 60 * 24 * 7 - 1);

    const attemptsDeployProxy = 20;

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

    let deployer;
    if (deployParameters.privateKey) {
        deployer = new ethers.Wallet(deployParameters.privateKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }
    const admin = deployParameters.admin || deployer.address;
    const trustedAggregator = deployParameters.trustedAggregator || deployer.address;

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

    // deploy global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager', deployer);
    let globalExitRootManager;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of globalExitRootManager ', error.error.reason);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('GlobalExitRootManager contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('globalExitRootManager deployed to:', globalExitRootManager.address);

    // deploy bridge
    let bridgeFactory;
    if (deployParameters.bridgeMock) {
        bridgeFactory = await ethers.getContractFactory('BridgeMock', deployer);
    } else {
        bridgeFactory = await ethers.getContractFactory('Bridge', deployer);
    }

    let bridgeContract;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of bridgeContract ', error.error.reason);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('Bridge contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('Bridge deployed to:', bridgeContract.address);

    // deploy PoE
    const PolygonZKEVMFactory = await ethers.getContractFactory('PolygonZKEVMMock', deployer);
    let polygonZKEVMContract;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZKEVMContract = await upgrades.deployProxy(PolygonZKEVMFactory, [], { initializer: false });
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZKEVMContract ', error.error.reason);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('PolygonZKEVM contract has not been deployed');
        }
    }

    console.log('#######################\n');
    console.log('Polygon ZK-EVM deployed to:', polygonZKEVMContract.address);

    /*
     * Initialize globalExitRootManager
     */
    await globalExitRootManager.initialize(polygonZKEVMContract.address, bridgeContract.address);

    /*
     * Initialize Bridge
     */
    await (await bridgeContract.initialize(
        networkIDMainnet,
        globalExitRootManager.address,
        polygonZKEVMContract.address,
    )).wait();

    console.log('\n#######################');
    console.log('#####    Checks Bridge   #####');
    console.log('#######################');
    console.log('globalExitRootManagerAddress:', await bridgeContract.globalExitRootManager());
    console.log('networkID:', await bridgeContract.networkID());
    console.log('poeAddress:', await bridgeContract.poeAddress());
    console.log('owner:', await bridgeContract.owner());

    /*
     * Initialize Polygon ZK-EVM
     */
    // Check genesis file
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Polygon ZK-EVM #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('globalExitRootManagerAddress:', globalExitRootManager.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
    console.log('verifierAddress:', verifierContract.address);
    console.log('bridgeContract:', bridgeContract.address);

    console.log('admin:', admin);
    console.log('chainID:', chainID);
    console.log('trustedSequencer:', trustedSequencer);
    console.log('pendingStateTimeout:', pendingStateTimeout);
    console.log('forceBatchAllowed:', forceBatchAllowed);
    console.log('trustedAggregator:', trustedAggregator);
    console.log('trustedAggregatorTimeout:', trustedAggregatorTimeout);

    console.log('genesisRoot:', genesisRootHex);
    console.log('trustedSequencerURL:', trustedSequencerURL);
    console.log('networkName:', networkName);

    await (await polygonZKEVMContract.initialize(
        globalExitRootManager.address,
        maticTokenContract.address,
        verifierContract.address,
        bridgeContract.address,
        {
            admin,
            chainID,
            trustedSequencer,
            pendingStateTimeout,
            forceBatchAllowed,
            trustedAggregator,
            trustedAggregatorTimeout,
        },
        genesisRootHex,
        trustedSequencerURL,
        networkName,
    )).wait();

    const deploymentBlockNumber = (await polygonZKEVMContract.deployTransaction.wait()).blockNumber;

    console.log('\n#######################');
    console.log('#####    Checks  PoE  #####');
    console.log('#######################');
    console.log('globalExitRootManagerAddress:', await polygonZKEVMContract.globalExitRootManager());
    console.log('maticTokenAddress:', await polygonZKEVMContract.matic());
    console.log('verifierAddress:', await polygonZKEVMContract.rollupVerifier());
    console.log('bridgeContract:', await polygonZKEVMContract.bridgeAddress());

    console.log('admin:', await polygonZKEVMContract.admin());
    console.log('chainID:', await polygonZKEVMContract.chainID());
    console.log('trustedSequencer:', await polygonZKEVMContract.trustedSequencer());
    console.log('pendingStateTimeout:', await polygonZKEVMContract.pendingStateTimeout());
    console.log('forceBatchAllowed:', await polygonZKEVMContract.forceBatchAllowed());
    console.log('trustedAggregator:', await polygonZKEVMContract.trustedAggregator());
    console.log('trustedAggregatorTimeout:', await polygonZKEVMContract.trustedAggregatorTimeout());

    console.log('genesiRoot:', await polygonZKEVMContract.batchNumToStateRoot(0));
    console.log('trustedSequencerURL:', await polygonZKEVMContract.trustedSequencerURL());
    console.log('networkName:', await polygonZKEVMContract.networkName());
    console.log('owner:', await polygonZKEVMContract.owner());

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

    // approve tokens
    if (deployParameters.trustedSequencerPvtKey) {
        const trustedSequencerWallet = new ethers.Wallet(deployParameters.trustedSequencerPvtKey, currentProvider);
        await maticTokenContract.connect(trustedSequencerWallet).approve(polygonZKEVMContract.address, ethers.constants.MaxUint256);
    }
    const outputJson = {
        polygonZKEVMAddress: polygonZKEVMContract.address,
        bridgeAddress: bridgeContract.address,
        globalExitRootManagerAddress: globalExitRootManager.address,
        maticTokenAddress: maticTokenContract.address,
        verifierAddress: verifierContract.address,
        deployerAddress: deployer.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        trustedSequencer,
        forceBatchAllowed,
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
