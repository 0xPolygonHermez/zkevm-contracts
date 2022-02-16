const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@polygon-hermez/zkevm-commonjs');

const { calculateCircuitInput, calculateBatchHashData } = contractUtils;

describe('Proof of efficiency', () => {
    let deployer;
    let aggregator;
    let sequencer;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let globalExitRootManager;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

    const networkIDMainnet = 0;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, aggregator, sequencer] = await ethers.getSigners();

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

        const precalculatBridgeAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );

        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 2 },
        );

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await globalExitRootManagerFactory.deploy(precalculatePoEAddress, precalculatBridgeAddress);
        await globalExitRootManager.deployed();

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await bridgeFactory.deploy(networkIDMainnet, globalExitRootManager.address);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            globalExitRootManager.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
        );
        await proofOfEfficiencyContract.deployed();

        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);
        expect(bridgeContract.address).to.be.equal(precalculatBridgeAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencer.address, ethers.utils.parseEther('100'));
    });

    it('should check the constructor parameters', async () => {
        expect(await proofOfEfficiencyContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await proofOfEfficiencyContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await proofOfEfficiencyContract.rollupVerifier()).to.be.equal(verifierContract.address);
    });

    it('should register a sequencer', async () => {
        // register a sequencer
        const sequencerURL = 'http://exampleURL';
        const sequencerAddress = deployer.address;
        const defaultChainId = Number(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID());

        await expect(proofOfEfficiencyContract.registerSequencer(sequencerURL))
            .to.emit(proofOfEfficiencyContract, 'RegisterSequencer')
            .withArgs(sequencerAddress, sequencerURL, ethers.BigNumber.from(defaultChainId + 1));

        // check the stored sequencer struct
        const sequencerStruct = await proofOfEfficiencyContract.sequencers(sequencerAddress);
        expect(sequencerStruct.sequencerURL).to.be.equal(sequencerURL);
        expect(sequencerStruct.chainID).to.be.equal(ethers.BigNumber.from(defaultChainId + 1));

        // update the sequencer URL
        const sequencerURL2 = 'http://exampleURL2';
        await expect(proofOfEfficiencyContract.registerSequencer(sequencerURL2))
            .to.emit(proofOfEfficiencyContract, 'RegisterSequencer')
            .withArgs(sequencerAddress, sequencerURL2, ethers.BigNumber.from(defaultChainId + 1));

        // check the stored sequencer struct
        const sequencerStruct2 = await proofOfEfficiencyContract.sequencers(sequencerAddress);
        expect(sequencerStruct2.sequencerURL).to.be.equal(sequencerURL2);
        expect(sequencerStruct2.chainID).to.be.equal(ethers.BigNumber.from(defaultChainId + 1));
    });

    it('should send batch of transactions', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateSequencerCollateral();
        const sequencerAddress = deployer.address;
        const defaultChainId = Number(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID());
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await proofOfEfficiencyContract.calculateSequencerCollateral()).toString());

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(proofOfEfficiencyContract.sendBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC');

        // revert because tokens were not approved
        await expect(proofOfEfficiencyContract.sendBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();

        await expect(proofOfEfficiencyContract.sendBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'SendBatch')
            .withArgs(lastBatchSent + 1, sequencerAddress, defaultChainId, lastGlobalExitRoot);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // register and then send a batch
        const sequencerURL = 'http://exampleURL';
        const maticAmount2 = await proofOfEfficiencyContract.calculateSequencerCollateral();

        await expect(proofOfEfficiencyContract.registerSequencer(sequencerURL))
            .to.emit(proofOfEfficiencyContract, 'RegisterSequencer')
            .withArgs(sequencerAddress, sequencerURL, ethers.BigNumber.from(defaultChainId + 1));

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount2),
        ).to.emit(maticTokenContract, 'Approval');

        await expect(proofOfEfficiencyContract.sendBatch(l2txData, maticAmount2))
            .to.emit(proofOfEfficiencyContract, 'SendBatch')
            .withArgs(lastBatchSent + 2, sequencerAddress, ethers.BigNumber.from(defaultChainId + 1), lastGlobalExitRoot);
    });

    it('should forge the batch', async () => {
        const defaultChainId = Number(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID());
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        const l2txData = '0x123456';
        const maticAmount = ethers.utils.parseEther('1');

        const aggregatorAddress = aggregator.address;
        const sequencerAddress = sequencer.address;

        // sequencer send the batch
        await expect(
            maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();

        await expect(proofOfEfficiencyContract.connect(sequencer).sendBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'SendBatch')
            .withArgs(lastBatchSent + 1, sequencerAddress, defaultChainId, lastGlobalExitRoot);

        // aggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(
                newLocalExitRoot,
                newStateRoot,
                numBatch - 1,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH');

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(newLocalExitRoot, newStateRoot, numBatch, proofA, proofB, proofC),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
            .withArgs(numBatch, aggregatorAddress);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });
    it('Should match the computed SC input with the Js input', async () => {
        const l2txData = '0x0123456789';
        const maticAmount = ethers.utils.parseEther('1');
        const sequencerAddress = sequencer.address;
        const defaultChainId = Number(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID());
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        // sequencer send the batch
        await expect(
            maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        let lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();

        await expect(proofOfEfficiencyContract.connect(sequencer).sendBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'SendBatch')
            .withArgs(lastBatchSent + 1, sequencerAddress, defaultChainId, lastGlobalExitRoot);

        /*
         * calculate all the input parameters
         * calculate l2HashData
         */
        const { timestamp } = await ethers.provider.getBlock();
        lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();
        const sentBatch = await proofOfEfficiencyContract.sentBatches(lastBatchSent);

        const batchHashData = calculateBatchHashData(l2txData, lastGlobalExitRoot, timestamp, sequencerAddress, defaultChainId);
        expect(sentBatch.batchHashData).to.be.equal(batchHashData);

        // Compute circuit input with the SC function
        const currentStateRoot = await proofOfEfficiencyContract.currentStateRoot();
        const currentLocalExitRoot = await proofOfEfficiencyContract.currentLocalExitRoot();
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;

        const circuitInputSC = await proofOfEfficiencyContract.calculateCircuitInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
        );

        // Compute Js input
        const circuitInputJS = calculateCircuitInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
        );
        expect(circuitInputSC).to.be.equal(circuitInputJS);

        // Check the input parameters are correct
        const circuitNextInputSC = await proofOfEfficiencyContract.getNextCircuitInput(
            newLocalExitRoot,
            newStateRoot,
            numBatch,
        );
        expect(circuitNextInputSC).to.be.equal(circuitInputSC);
    });
});
