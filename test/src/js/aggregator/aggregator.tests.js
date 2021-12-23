const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Scalar } = require('ffjavascript');
const Aggregator = require('../../../../src/js/aggregator/aggregator');
const Sequencer = require('../../../../src/js/sequencer/sequencer');

describe('Aggregator test', async () => {
    let deployer;
    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let sequencerSigner;
    let sequencer;
    let aggregatorSigner;
    let aggregator;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');
    const maticAmount = ethers.utils.parseEther('1');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

    before('Deploy contract', async () => {
        // load signers
        [deployer, aggregatorSigner, sequencerSigner] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance,
        );
        await maticTokenContract.deployed();

        // deploy bridge
        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );
        const BridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiency');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            bridgeContract.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencerSigner.address, ethers.utils.parseEther('100'));
    });

    // Wallets
    const wallet1 = new ethers.Wallet('0x1111111111111111111111111111111111111111111111111111111111111111');
    const wallet2 = new ethers.Wallet('0x2222222222222222222222222222222222222222222222222222222222222222');
    const wallet3 = new ethers.Wallet('0x3333333333333333333333333333333333333333333333333333333333333333');

    it('Initialize Aggregator', async () => {
        // set initial rollupDB
        const rollupDB = {};
        rollupDB[`${wallet1.address}`] = {
            nonce: 1,
            balance: `0x${Scalar.e(111).toString(16)}`,
        };
        rollupDB[`${wallet2.address}`] = {
            nonce: 22,
            balance: `0x${Scalar.e(222222200000000000000000000).toString(16)}`,
        };
        rollupDB[`${wallet3.address}`] = {
            nonce: 3,
            balance: `0x${Scalar.e(3333333333333333).toString(16)}`,
        };
        // initialize aggregator interface
        aggregator = new Aggregator(aggregatorSigner, proofOfEfficiencyContract, rollupDB);
    });

    it('Initialize Sequencer & sendBatch', async () => {
        // initialize sequencer interface
        sequencer = new Sequencer(sequencerSigner, proofOfEfficiencyContract, 'URL', aggregator);
        // register sequencer
        await sequencer.registerSequencer();

        // a new batch is prepared
        const tx0 = {
            to: wallet2.address,
            nonce: 1,
            data: '',
            value: '0x01',
            gasLimit: 2100,
            gasPrice: 2000000000,
            chainId: 1,
        };
        const signedTxA = await wallet1.signTransaction(tx0);
        await sequencer.addTx(signedTxA);

        const tx1 = {
            to: wallet3.address,
            nonce: 22,
            data: '',
            value: '0x2C68AF0BB140000',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        const signedTxB = await wallet2.signTransaction(tx1);
        await sequencer.addTx(signedTxB);

        const tx2 = {
            to: wallet1.address,
            nonce: 3,
            data: '',
            value: '0x6FC23AC00',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        const signedTxC = await wallet3.signTransaction(tx2);
        await sequencer.addTx(signedTxC);

        // approve matic tokens
        maticTokenContract.connect(sequencerSigner).approve(proofOfEfficiencyContract.address, maticAmount);
        // send batch
        await sequencer.sendBatch(maticAmount);
    });

    it('Validate Batch', async () => {
        const txVerifyBatch = await aggregator.verifyBatch();
        expect(txVerifyBatch.events.some((event) => event.event === 'VerifyBatch')).to.be.equal(true);
        const newLocalExitRoot = await bridgeContract.lastRollupExitRoot();
        expect(newLocalExitRoot).to.be.equal(aggregator.state.newLocalExitRoot);
        const currentStateRoot = await proofOfEfficiencyContract.currentStateRoot();
        expect(currentStateRoot).to.be.equal(aggregator.state.newStateRoot);
    });
});
