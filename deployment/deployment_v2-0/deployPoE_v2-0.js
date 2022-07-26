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
    const trustedSequencer = deployer.address;
    const trustedSequencerURL = deployParameters.trustedSequencerURL || "http://zkevm-json-rpc:8123";

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
        Deployment Mock verifier
    */
    const VerifierRollupHelperFactory = await ethers.getContractFactory(
        'VerifierRollupHelperMock',
    );
    const verifierContract = await VerifierRollupHelperFactory.deploy();
    await verifierContract.deployed();

    console.log('#######################\n');
    console.log('Verifier deployed to:', verifierContract.address);
    /*
    *Deployment Global exit root manager
    */
    const precalculateBridgeAddress = await ethers.utils.getContractAddress(
        { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
    );

    const precalculatePoEAddress = await ethers.utils.getContractAddress(
        { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 2 },
    );
    const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
    const globalExitRootManager = await globalExitRootManagerFactory.deploy(precalculatePoEAddress, precalculateBridgeAddress);
    await globalExitRootManager.deployed();

    console.log('#######################\n');
    console.log('globalExitRootManager deployed to:', globalExitRootManager.address);

    /*
     *Deployment Bridge
     */
    const BridgeFactory = await ethers.getContractFactory('BridgeMock');
    const bridgeContract = await BridgeFactory.deploy(networkIDMainnet, globalExitRootManager.address);
    await bridgeContract.deployed();
    expect(bridgeContract.address).to.be.equal(precalculateBridgeAddress);

    console.log('#######################\n');
    console.log('Bridge deployed to:', bridgeContract.address);

    /*
        Deploy proof of efficiency
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

    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
    const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
        globalExitRootManager.address,
        maticTokenContract.address,
        verifierContract.address,
        genesisRootHex,
        trustedSequencer,
        forceBatchAllowed,
        trustedSequencerURL
    );
    await proofOfEfficiencyContract.deployed();
    expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

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

    // calculate address and private Keys:
    const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';
    const menmonic = deployParameters.mnemonic || DEFAULT_MNEMONIC;
    const numAccounts = deployParameters.numFundAccounts || 5;

    const accountsL1Array = [];
    for (let i = 0; i < numAccounts; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.Wallet.fromMnemonic(menmonic, path);
        accountsL1Array.push({
            address: wallet.address,
            pvtKey: wallet.privateKey,
        });

        // fund account with tokens and ether if it have less than 0.5 ether.
        const balanceEther = await ethers.provider.getBalance(wallet.address);
        const minEtherBalance = ethers.utils.parseEther('0.1');
        if (balanceEther < minEtherBalance) {
            const params = {
                to: wallet.address,
                value: minEtherBalance,
            };
            await deployer.sendTransaction(params);
        }
        const tokensBalance = ethers.utils.parseEther('100000');
        await maticTokenContract.transfer(wallet.address, tokensBalance);
        console.log(`Account ${i} funded`);
    }

    const outputJson = {
        proofOfEfficiencyAddress: proofOfEfficiencyContract.address,
        bridgeAddress: bridgeContract.address,
        globalExitRootManagerAddress: globalExitRootManager.address,
        maticTokenAddress: maticTokenContract.address,
        verifierAddress: verifierContract.address,
        deployerAddress: deployer.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        accountsL1Array,
        trustedSequencer: deployer.address,
        forceBatchAllowed,
        trustedSequencerURL
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
