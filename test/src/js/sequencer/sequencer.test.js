const { expect } = require('chai');
const { ethers } = require('hardhat');
const Sequencer = require('../../../../src/js/sequencer/sequencer');

describe('Sequencer test', async () => {
    let deployer;
    let sequencerSigner;
    let userAWallet;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let sequencer;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');
    const maticAmount = ethers.utils.parseEther('1');
    const sequencerURL = 'URL';

    before('Deploy contract', async () => {
        // load signers
        [deployer, sequencerSigner, userAWallet] = await ethers.getSigners();

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
        await maticTokenContract.transfer(sequencerSigner.address, ethers.utils.parseEther('100'));
    });

    it('Initialize Sequencer', async () => {
        sequencer = new Sequencer(sequencerSigner, proofOfEfficiencyContract, sequencerURL);
    });
    it('Register Sequencer', async () => {
        const tx = await sequencer.registerSequencer();
        // check SC
        expect(tx.events[0].event).to.be.equal('RegisterSequencer');
        const sequencer1 = await proofOfEfficiencyContract.sequencers(sequencerSigner.address);
        expect(sequencer1.sequencerURL).to.be.equal(sequencerURL);
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
        const signedTx = await wallet.signTransaction(tx);
        // add tx to sequencer
        await sequencer.addTx(signedTx);
        // approve matic tokens
        maticTokenContract.connect(sequencerSigner).approve(proofOfEfficiencyContract.address, maticAmount);
        // calculate l2txsData
        let l2txsData = '0x';
        for (let i = 0; i < sequencer.txs.length; i++) {
            const txData = sequencer.txs[i].slice(2);
            l2txsData += txData;
        }
        // getLastGlobalExitRoot from bridge
        const lastGlobalExitRoot = await bridgeContract.getLastGlobalExitRoot();
        // send batch with previous transaction
        const txSendBatch = await sequencer.sendBatch(maticAmount);
        // checks SC
        expect(txSendBatch.events.some((event) => event.event === 'SendBatch')).to.be.equal(true);
        const lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();
        const sentBatch = await proofOfEfficiencyContract.sentBatches(lastBatchSent);
        expect(sentBatch.sequencerAddress).to.be.equal(sequencerSigner.address);
        expect(sentBatch.batchL2HashData).to.be.equal(ethers.utils.solidityKeccak256(['bytes', 'bytes32'], [l2txsData, lastGlobalExitRoot]));
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
        const signedTxA = await wallet.signTransaction(tx0);
        // add tx to sequencer
        await sequencer.addTx(signedTxA);
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
        const signedTxB = await wallet.signTransaction(tx1);
        // add tx to sequencer
        await sequencer.addTx(signedTxB);
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
        const signedTxC = await wallet.signTransaction(tx2);
        // add tx to sequencer
        await sequencer.addTx(signedTxC);
        // approve matic tokens
        await maticTokenContract.connect(sequencerSigner).approve(proofOfEfficiencyContract.address, maticAmount);
        // calculate l2txsData
        let l2txsData = '0x';
        for (let i = 0; i < sequencer.txs.length; i++) {
            const txData = sequencer.txs[i].slice(2);
            l2txsData += txData;
        }
        // getLastGlobalExitRoot from bridge
        const lastGlobalExitRoot = await bridgeContract.getLastGlobalExitRoot();
        // send batch with previous transaction
        const txSendBatch = await sequencer.sendBatch(maticAmount);
        // checks SC
        expect(txSendBatch.events[2].event).to.be.equal('SendBatch');
        const lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();
        const sentBatch = await proofOfEfficiencyContract.sentBatches(lastBatchSent);
        expect(sentBatch.sequencerAddress).to.be.equal(sequencerSigner.address);
        expect(sentBatch.batchL2HashData).to.be.equal(ethers.utils.solidityKeccak256(['bytes', 'bytes32'], [l2txsData, lastGlobalExitRoot]));
    });
});
