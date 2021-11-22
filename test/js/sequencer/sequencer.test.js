const { expect } = require('chai');
const { ethers } = require('hardhat');
const SequencerInterface = require('../../../js/sequencer/sequencer');

describe('Sequencer test', async () => {
    let deployer;
    let sequencer;
    let userAWallet;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let sequencerInterface;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');
    const maticAmount = ethers.utils.parseEther('1');

    before('Deploy contract', async () => {
        // load signers
        [deployer, sequencer, userAWallet] = await ethers.getSigners();

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
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencer.address, ethers.utils.parseEther('100'));
    });

    it('Initialize Sequencer', async () => {
        sequencerInterface = new SequencerInterface(sequencer, proofOfEfficiencyContract, 'URL');
    });
    it('Register Sequencer', async () => {
        await sequencerInterface.registerSequencer();
    });
    it('SendBatch 1 tx', async () => {
        // create wallet
        const wallet = ethers.Wallet.createRandom();
        // transaction
        const tx = {
            from: wallet.address,
            to: userAWallet.address,
            nonce: 0,
            data: '',
            value: 0,
            gasLimit: 2100,
            gasPrice: 2000000000,
            chainId: 1,
        };
        // sign transaction
        const txB = await wallet.signTransaction(tx);
        const signedTx = ethers.utils.parseTransaction(txB);
        // add tx to sequencer
        await sequencerInterface.addTx(signedTx);
        // approve matic tokens
        maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount);
        // send batch with previous transaction
        await sequencerInterface.sendBatch(maticAmount);
    });

    it('SendBatch 3 tx', async () => {
        // create wallet
        const wallet = new ethers.Wallet('0x4646464646464646464646464646464646464646464646464646464646464646');
        // transaction
        const tx0 = {
            to: userAWallet.address,
            nonce: 0,
            data: '',
            value: 0,
            gasLimit: 2100,
            gasPrice: 2000000000,
            chainId: 1,
        };
        // sign transaction
        const txA = await wallet.signTransaction(tx0);
        const signedTxA = ethers.utils.parseTransaction(txA);
        // add tx to sequencer
        await sequencerInterface.addTx(signedTxA);
        // transaction
        const tx1 = {
            to: '0x1111111111111111111111111111111111111111',
            nonce: 8,
            data: '',
            value: '0x2C68AF0BB140000',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        // sign transaction
        const txB = await wallet.signTransaction(tx1);
        const signedTxB = ethers.utils.parseTransaction(txB);
        // add tx to sequencer
        await sequencerInterface.addTx(signedTxB);
        // transaction
        const tx2 = {
            to: '0x1212121212121212121212121212121212121212',
            nonce: 2,
            data: '',
            value: '0x6FC23AC00',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        // sign transaction
        const txC = await wallet.signTransaction(tx2);
        const signedTxC = ethers.utils.parseTransaction(txC);
        // add tx to sequencer
        await sequencerInterface.addTx(signedTxC);
        // approve matic tokens
        await maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount);
        // send batch with previous transaction
        await sequencerInterface.sendBatch(maticAmount);
    });
});
