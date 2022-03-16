const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
const { Scalar } = require('ffjavascript');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const {
    MemDB, SMT, stateUtils, getPoseidon, smtUtils,
} = require('@polygon-hermez/zkevm-commonjs');

const { setGenesisBlock } = stateUtils;
const { expect } = require('chai');
const deployParameters = require('./deploy_parameters.json');

async function main() {
    const deployer = (await ethers.getSigners())[0];
    const networkIDMainnet = 0;

    /*
     *Deployment MATIC
     */
    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('2000000000');

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
     *Deployment verifier
     */
    let VerifierFactory;
    if (deployParameters.realVerifier) {
        VerifierFactory = await ethers.getContractFactory(
            'Verifier',
        );
    } else {
        VerifierFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
    }

    const verifierContract = await VerifierFactory.deploy();
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
     *Deploy proof of efficiency
     */

    // generate genesis
    const poseidon = await getPoseidon();
    const { F } = poseidon;
    const db = new MemDB(F);
    const smt = new SMT(db, poseidon, poseidon.F);

    const defaultBalance = Scalar.e(ethers.utils.parseEther('1000'));
    const addressArray = [];
    const amountArray = [];
    const nonceArray = [];

    const { genesis } = deployParameters;
    for (let j = 0; j < genesis.length; j++) {
        const {
            address, balance, nonce,
        } = genesis[j];

        addressArray.push(address);
        amountArray.push(balance ? Scalar.e(balance) : defaultBalance);
        nonceArray.push(nonce ? Scalar.e(nonce) : Scalar.e(0));
    }

    const genesisRoot = await setGenesisBlock(addressArray, amountArray, nonceArray, smt);
    const genesisRootHex = smtUtils.h4toString(genesisRoot);

    console.log('\n#######################');
    console.log('##### Deployment Proof of Efficiency #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('globalExitRootManagerAddress:', globalExitRootManager.address);
    console.log('maticTokenAddress:', maticTokenContract.address);
    console.log('verifierAddress:', verifierContract.address);
    console.log('genesisRoot:', genesisRootHex);

    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
    const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
        globalExitRootManager.address,
        maticTokenContract.address,
        verifierContract.address,
        genesisRootHex,
    );
    await proofOfEfficiencyContract.deployed();
    expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

    console.log('#######################\n');
    console.log('Proof of Efficiency deployed to:', proofOfEfficiencyContract.address);

    const deploymentBlockNumber = (await proofOfEfficiencyContract.deployTransaction.wait()).blockNumber;
    const defaultChainID = await proofOfEfficiencyContract.DEFAULT_CHAIN_ID();

    console.log('\n#######################');
    console.log('#####    Checks    #####');
    console.log('#######################');
    console.log('globalExitRootManagerAddress:', await proofOfEfficiencyContract.globalExitRootManager());
    console.log('maticTokenAddress:', await proofOfEfficiencyContract.matic());
    console.log('verifierMockAddress:', await proofOfEfficiencyContract.rollupVerifier());
    console.log('genesiRoot:', await proofOfEfficiencyContract.currentStateRoot());
    console.log('DEFAULT_CHAIN_ID:', defaultChainID);

    // calculate address and private Keys:
    const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';
    const menmonic = deployParameters.mnemonic || DEFAULT_MNEMONIC;
    const numAccounts = deployParameters.numFundAccounts;

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
        defaultChainID,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        accountsL1Array,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Test
    expect(await proofOfEfficiencyContract.matic()).to.equal(maticTokenContract.address);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
