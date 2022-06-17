const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@polygon-hermez/zkevm-commonjs');

const { calculateSnarkInput, calculateBatchHashData } = contractUtils;

describe('Proof of efficiency', () => {
    let deployer;
    let aggregator;
    let trustedSequencer;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let globalExitRootManager;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = ethers.constants.HashZero;

    const networkIDMainnet = 0;
    const allowForcebatches = true;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, aggregator, trustedSequencer] = await ethers.getSigners();

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
            trustedSequencer.address,
            allowForcebatches,
        );
        await proofOfEfficiencyContract.deployed();

        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);
        expect(bridgeContract.address).to.be.equal(precalculatBridgeAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should check the constructor parameters', async () => {
        expect(await proofOfEfficiencyContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await proofOfEfficiencyContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await proofOfEfficiencyContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await proofOfEfficiencyContract.currentStateRoot()).to.be.equal(genesisRoot);
        expect(await proofOfEfficiencyContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await proofOfEfficiencyContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
    });

    it('should sequence a batch as super sequencer', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            forceBatchesTimestamp: [],
        };

        // revert because sender is not super sequencer
        await expect(proofOfEfficiencyContract.sequenceBatches([sequence]))
            .to.be.revertedWith('ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer');

        // revert because tokens were not approved
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Sequence batch
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const batchStruct = await proofOfEfficiencyContract.sequencedBatches(1);

        expect(batchStruct.timestamp).to.be.equal(sequence.timestamp);
        const batchHashData = calculateBatchHashData(
            sequence.transactions,
            sequence.globalExitRoot,
            trustedSequencer.address,
        );
        expect(batchStruct.batchHashData).to.be.equal(batchHashData);
    });

    it('sequenceBatches should sequence multiple batches', async () => {
        const l2txData = '0x1234';
        const maticAmount = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(2);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [],
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [],
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Sequence batches
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const batchStruct = await proofOfEfficiencyContract.sequencedBatches(1);
        expect(batchStruct.timestamp).to.be.equal(sequence.timestamp);
        const batchHashData = calculateBatchHashData(
            sequence.transactions,
            sequence.globalExitRoot,
            trustedSequencer.address,
        );
        expect(batchStruct.batchHashData).to.be.equal(batchHashData);

        const batchStruct2 = await proofOfEfficiencyContract.sequencedBatches(2);
        expect(batchStruct2.timestamp).to.be.equal(sequence2.timestamp);
        const batchHashData2 = calculateBatchHashData(
            sequence2.transactions,
            sequence2.globalExitRoot,
            trustedSequencer.address,
        );
        expect(batchStruct2.batchHashData).to.be.equal(batchHashData2);
    });

    it('sequenceBatches should sequence multiple batches and force batches', async () => {
        const l2txDataForceBatch = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;

        // Force batch
        await expect(proofOfEfficiencyContract.forceBatch(l2txDataForceBatch, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const forcedTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).minTimestamp;

        // sequence 2 batches
        const l2txData = '0x1234';
        const maticAmountSequence = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(2);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [currentTimestamp],
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [],
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmountSequence),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Assert that the timestamp requirements must accomplish with force batches too
        sequence.forceBatchesTimestamp[0] += 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');
        sequence.forceBatchesTimestamp[0] -= 1;

        sequence.forceBatchesTimestamp[0] -= 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be inside range');
        sequence.forceBatchesTimestamp[0] += 1;

        // Assert force batch must be at least the minTimestamp
        sequence.timestamp = forcedTimestamp - 1;
        sequence.forceBatchesTimestamp[0] = forcedTimestamp - 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be inside range');
        sequence.timestamp = currentTimestamp;
        sequence.forceBatchesTimestamp[0] = currentTimestamp;

        // Assert force batch cant pop more batches than queued
        sequence.forceBatchesTimestamp.push(currentTimestamp);
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Force batches overflow');
        sequence.timestamp = currentTimestamp;
        sequence.forceBatchesTimestamp.pop();

        // Sequence Bathces
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 3);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmountSequence)),
        );

        // Check batch mapping
        const batchStruct = await proofOfEfficiencyContract.sequencedBatches(1);
        expect(batchStruct.timestamp).to.be.equal(sequence.timestamp);
        const batchHashData = calculateBatchHashData(
            sequence.transactions,
            sequence.globalExitRoot,
            trustedSequencer.address,
        );
        expect(batchStruct.batchHashData).to.be.equal(batchHashData);

        const batchStruct2 = await proofOfEfficiencyContract.sequencedBatches(2);
        expect(batchStruct2.timestamp).to.be.equal(sequence.forceBatchesTimestamp[0]);
        expect(batchStruct2.batchHashData).to.be.equal(ethers.utils.hexZeroPad(1, 32));

        const batchStruct3 = await proofOfEfficiencyContract.sequencedBatches(3);
        expect(batchStruct3.timestamp).to.be.equal(sequence2.timestamp);
        const batchHashData3 = calculateBatchHashData(
            sequence2.transactions,
            sequence2.globalExitRoot,
            trustedSequencer.address,
        );
        expect(batchStruct3.batchHashData).to.be.equal(batchHashData3);
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const maticAmount = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(2);

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            forceBatchesTimestamp: [],
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            forceBatchesTimestamp: [],
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        let currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]); // evm_setNextBlockTimestamp

        sequence.timestamp = currentTimestamp + 2; // bigger than current block tiemstamp

        // revert because timestamp is more than the current one
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp;
        sequence2.timestamp = currentTimestamp - 1;

        // revert because the second sequence has less timestamp than the previous batch
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp + 1; // edge case, same timestamp as the block
        sequence2.timestamp = currentTimestamp + 1;

        // Sequence Batches
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should force a batch of transactions', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await proofOfEfficiencyContract.calculateForceProverFee()).toString());

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('ProofOfEfficiency::forceBatch: not enough matic');

        // revert because tokens were not approved
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );
        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForceBatch = await proofOfEfficiencyContract.lastForceBatch();

        // Force batch
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForceBatch + 1, lastGlobalExitRoot, deployer.address, '0x');

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check force batches struct
        const batchStruct = await proofOfEfficiencyContract.forcedBatches(1);

        expect(batchStruct.maticFee).to.be.equal(maticAmount);
        expect(batchStruct.minTimestamp).to.be.equal((await ethers.provider.getBlock()).timestamp);
        const batchHashData = calculateBatchHashData(
            l2txData,
            lastGlobalExitRoot,
            deployer.address,
        );
        expect(batchStruct.batchHashData).to.be.equal(batchHashData);
    });

    it('should sequence force batches using sequenceForceBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;

        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const initialTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).minTimestamp;

        // Check storage variables before call
        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(0);

        // revert because the timeout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches(0))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Must force at least 1 batch');

        // revert because the timeout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches(1))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period');

        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [(initialTimestamp.add(forceBatchTimeout)).toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(1);

        // Check force batches struct
        const batchStruct = await proofOfEfficiencyContract.sequencedBatches(1);

        expect(batchStruct.timestamp).to.be.equal((await ethers.provider.getBlock()).timestamp);

        // Batch hash data contains pointer to force batch instead
        expect(batchStruct.batchHashData).to.be.equal(ethers.utils.hexZeroPad(1, 32));
    });

    it('should verify a sequenced batch', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [],
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();
        // Sequence Batches
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

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
        ).to.be.revertedWith('ProofOfEfficiency::verifyBatch: batch does not match');

        // Verify batch
        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(newLocalExitRoot, newStateRoot, numBatch, proofA, proofB, proofC),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
            .withArgs(numBatch, aggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should verify forced sequenced batch', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const initialTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).minTimestamp;
        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [(initialTimestamp.add(forceBatchTimeout)).toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

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

        // Verify batch
        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(
                newLocalExitRoot,
                newStateRoot,
                numBatch,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
            .withArgs(numBatch, aggregator.address)
            .to.emit(maticTokenContract, 'Transfer')
            .withArgs(proofOfEfficiencyContract.address, aggregator.address, maticAmount);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );

        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('Should match the computed SC input with the Js input', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            forceBatchesTimestamp: [],
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Sequence
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sentBatch = await proofOfEfficiencyContract.sequencedBatches(lastBatchSequenced + 1);

        const batchHashData = calculateBatchHashData(
            sequence.transactions,
            sequence.globalExitRoot,
            trustedSequencer.address,
        );
        expect(sentBatch.batchHashData).to.be.equal(batchHashData);

        // Compute circuit input with the SC function
        const currentStateRoot = await proofOfEfficiencyContract.currentStateRoot();
        const currentLocalExitRoot = await proofOfEfficiencyContract.currentLocalExitRoot();
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const circuitInputSC = await proofOfEfficiencyContract.calculateCircuitInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequence.timestamp,
            deployer.address,
        );

        // Compute Js input
        const circuitInputJS = calculateSnarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequence.timestamp,
            deployer.address,
        );

        // Check the input parameters are correct
        const circuitNextInputSC = await proofOfEfficiencyContract.getNextCircuitInput(
            newLocalExitRoot,
            newStateRoot,
            numBatch,
        );
        expect(circuitNextInputSC).to.be.equal(circuitInputSC);
        expect(circuitNextInputSC).to.be.equal(circuitInputJS);
    });

    it('Should match the computed SC input with the Js input in force batches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const initialTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).minTimestamp;
        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [(initialTimestamp.add(forceBatchTimeout)).toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        const sequencedTimestmap = (await ethers.provider.getBlock()).timestamp;
        const forcedBatchStruct = await proofOfEfficiencyContract.forcedBatches(lastForcedBatch);

        const batchHashData = calculateBatchHashData(
            l2txData,
            lastGlobalExitRoot,
            deployer.address,
        );
        expect(forcedBatchStruct.batchHashData).to.be.equal(batchHashData);
        expect(forcedBatchStruct.maticFee).to.be.equal(maticAmount);

        const sequencedBatch = await proofOfEfficiencyContract.sequencedBatches(lastForcedBatch);
        expect(sequencedBatch.batchHashData).to.be.equal(ethers.utils.hexZeroPad(1, 32));
        expect(sequencedBatch.timestamp).to.be.equal(sequencedTimestmap);

        // Compute circuit input with the SC function
        const currentStateRoot = await proofOfEfficiencyContract.currentStateRoot();
        const currentLocalExitRoot = await proofOfEfficiencyContract.currentLocalExitRoot();
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const circuitInputSC = await proofOfEfficiencyContract.calculateCircuitInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
            deployer.address,
        );

        // Compute Js input
        const circuitInputJS = calculateSnarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
            deployer.address,
        );

        // Check the input parameters are correct
        const circuitNextInputSC = await proofOfEfficiencyContract.getNextCircuitInput(
            newLocalExitRoot,
            newStateRoot,
            numBatch,
        );
        expect(circuitNextInputSC).to.be.equal(circuitInputSC);
        expect(circuitNextInputSC).to.be.equal(circuitInputJS);
    });
});
