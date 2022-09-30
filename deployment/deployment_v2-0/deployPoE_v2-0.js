/* eslint-disable no-await-in-loop */
const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
const { Scalar } = require('ffjavascript');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');

const { expect } = require('chai');
const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

async function main() {
    const networkIDMainnet = 0;
    const forceBatchAllowed = Boolean(deployParameters.forceBatchAllowed);
    const trustedSequencer = deployParameters.trustedSequencerAddress;
    const trustedSequencerURL = deployParameters.trustedSequencerURL || 'http://zkevm-json-rpc:8123';
    const realVerifier = deployParameters.realVerifier || false;
    const { chainID, networkName } = deployParameters;
    const atemptsDeployProxy = 20;

    let currentProvider = ethers.provider;
    if(deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK != "hardhat") {
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            if (deployParameters.multiplierGas) {
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),
                    };
                }
                currentProvider.getFeeData = overrideFeeData;
            } else {
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            }  
        }
    }
    
    let deployer;
    if(deployParameters.privateKey) {
        deployer = new ethers.Wallet(deployParameters.privateKey);
        deployer = deployer.connect(currentProvider);
    } else {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, `m/44'/60'/0'/0/0`).connect(currentProvider);
    }

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
    for (let i = 0; i < atemptsDeployProxy; i++) {
        try {
            globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });
            break;
        }
        catch (error) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of globalExitRootManager ", error);
        }
    }

    // deploy bridge
    const bridgeFactory = await ethers.getContractFactory('Bridge', deployer);
    let bridgeContract;
    for (let i = 0; i < atemptsDeployProxy; i++) {
        try {
            bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });
            break;
        }
        catch (error) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of bridgeContract ", error);
        }
    }

    // deploy PoE
    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock', deployer);
    let proofOfEfficiencyContract;
    for (let i = 0; i < atemptsDeployProxy; i++) {
        try {
            proofOfEfficiencyContract = await upgrades.deployProxy(ProofOfEfficiencyFactory, [], { initializer: false });
            break;
        }
        catch (error) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of proofOfEfficiencyContract ", error);
        }
    }

    await globalExitRootManager.initialize(proofOfEfficiencyContract.address, bridgeContract.address);

    console.log('#######################\n');
    console.log('globalExitRootManager deployed to:', globalExitRootManager.address);

    /*
     * Initialize Bridge
     */
    await bridgeContract.initialize(networkIDMainnet, globalExitRootManager.address);

    console.log('#######################\n');
    console.log('Bridge deployed to:', bridgeContract.address);

    /*
     * Initialize proof of efficiency
     */
    // Check genesis file
    const genesisRootHex = genesis.root;

    console.log('\n#######################');
    console.log('##### Deployment Proof of Efficiency #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('globalExitRootManagerAddress:', globalExitRootManager.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
    console.log('verifierAddress:', verifierContract.address);
    console.log('genesisRoot:', genesisRootHex);
    console.log('trustedSequencer:', trustedSequencer);
    console.log('forceBatchAllowed:', forceBatchAllowed);
    console.log('trustedSequencerURL:', trustedSequencerURL);
    console.log('chainID:', chainID);
    console.log('networkName:', networkName);

    await (await proofOfEfficiencyContract.initialize(
        globalExitRootManager.address,
        maticTokenContract.address,
        verifierContract.address,
        genesisRootHex,
        trustedSequencer,
        forceBatchAllowed,
        trustedSequencerURL,
        chainID,
        networkName,
    )).wait();

    console.log('#######################\n');
    console.log('Proof of Efficiency deployed to:', proofOfEfficiencyContract.address);

    const deploymentBlockNumber = (await proofOfEfficiencyContract.deployTransaction.wait()).blockNumber;

    console.log('\n#######################');
    console.log('#####    Checks    #####');
    console.log('#######################');
    console.log('globalExitRootManagerAddress:', await proofOfEfficiencyContract.globalExitRootManager());
    console.log('maticTokenAddress:', await proofOfEfficiencyContract.matic());
    console.log('verifierMockAddress:', await proofOfEfficiencyContract.rollupVerifier());
    console.log('genesiRoot:', await proofOfEfficiencyContract.currentStateRoot());
    console.log('trustedSequencer:', await proofOfEfficiencyContract.trustedSequencer());
    console.log('forceBatchAllowed:', await proofOfEfficiencyContract.forceBatchAllowed());
    console.log('trustedSequencerURL:', await proofOfEfficiencyContract.trustedSequencerURL());
    console.log('chainID:', Number(await proofOfEfficiencyContract.chainID()));
    console.log('networkName:', await proofOfEfficiencyContract.networkName());

    // fund account with tokens and ether if it have less than 0.1 ether.
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
    await maticTokenContract.transfer(trustedSequencer, tokensBalance);

    const outputJson = {
        proofOfEfficiencyAddress: proofOfEfficiencyContract.address,
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
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
