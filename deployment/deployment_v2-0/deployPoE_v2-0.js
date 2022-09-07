const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
const { Scalar } = require('ffjavascript');

const pathOutputJson = path.join(__dirname, './deploy_output.json');

const { expect } = require('chai');
const deployParameters = require('./deploy_parameters.json');
const genesis = require("./genesis.json")

async function main() {
    const deployer = (await ethers.getSigners())[0];
    const networkIDMainnet = 0;
    const forceBatchAllowed = Boolean(deployParameters.forceBatchAllowed);
    const trustedSequencer = deployParameters.trustedSequencerAddress;
    const trustedSequencerURL = deployParameters.trustedSequencerURL || "http://zkevm-json-rpc:8123";
    const realVerifier = deployParameters.realVerifier || false;
    /*
        Deployment MATIC
    */
    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
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
        Deployment verifier
    */
    let verifierContract;
    if (realVerifier === true) {
        const VerifierRollup = await ethers.getContractFactory(
            'Verifier',
        );
        verifierContract = await VerifierRollup.deploy();
        await verifierContract.deployed();
    }
    else {
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();
        await verifierContract.deployed();
    }

    console.log('#######################\n');
    console.log('Verifier deployed to:', verifierContract.address);
    /*
    *Deployment Global exit root manager
    */
    // deploy global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
    globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });

    // deploy bridge
    const bridgeFactory = await ethers.getContractFactory('Bridge');
    bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });

    // deploy PoE
    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
    proofOfEfficiencyContract = await upgrades.deployProxy(ProofOfEfficiencyFactory, [], { initializer: false });

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

    await (await proofOfEfficiencyContract.initialize(
        globalExitRootManager.address,
        maticTokenContract.address,
        verifierContract.address,
        genesisRootHex,
        trustedSequencer,
        forceBatchAllowed,
        trustedSequencerURL
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
        trustedSequencer: trustedSequencer,
        forceBatchAllowed,
        trustedSequencerURL
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
