const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateAccInputHash, calculateBatchHashData } = contractUtils;

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
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';

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
        await bridgeContract.initialize(networkIDMainnet, globalExitRootManager.address);
        await proofOfEfficiencyContract.initialize(
            globalExitRootManager.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
            trustedSequencer.address,
            allowForcebatches,
            urlSequencer,
            chainID,
            networkName,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should check the constructor parameters', async () => {
        expect(await proofOfEfficiencyContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await proofOfEfficiencyContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await proofOfEfficiencyContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await proofOfEfficiencyContract.batchNumToStateRoot(0)).to.be.equal(genesisRoot);
        expect(await proofOfEfficiencyContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await proofOfEfficiencyContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
    });

    it('should check setters of trusted sequencer', async () => {
        expect(await proofOfEfficiencyContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await proofOfEfficiencyContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
        expect(await proofOfEfficiencyContract.trustedSequencerURL()).to.be.equal(urlSequencer);

        // setForceBatchAllowed
        await expect(proofOfEfficiencyContract.setForceBatchAllowed(!allowForcebatches))
            .to.be.revertedWith('ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer');
        await expect(
            proofOfEfficiencyContract.connect(trustedSequencer).setForceBatchAllowed(!allowForcebatches),
        ).to.emit(proofOfEfficiencyContract, 'SetForceBatchAllowed').withArgs(!allowForcebatches);
        expect(await proofOfEfficiencyContract.forceBatchAllowed()).to.be.equal(!allowForcebatches);

        // setTrustedSequencer
        await expect(proofOfEfficiencyContract.setTrustedSequencer(deployer.address))
            .to.be.revertedWith('ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer');
        await expect(
            proofOfEfficiencyContract.connect(trustedSequencer).setTrustedSequencer(deployer.address),
        ).to.emit(proofOfEfficiencyContract, 'SetTrustedSequencer').withArgs(deployer.address);
        expect(await proofOfEfficiencyContract.trustedSequencer()).to.be.equal(deployer.address);

        // setTrustedSequencerURL
        const url = 'https://test';
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).setTrustedSequencerURL(url))
            .to.be.revertedWith('ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer');
        await expect(
            proofOfEfficiencyContract.connect(deployer).setTrustedSequencerURL(url),
        ).to.emit(proofOfEfficiencyContract, 'SetTrustedSequencerURL').withArgs(url);
        expect(await proofOfEfficiencyContract.trustedSequencerURL()).to.be.equal(url);
    });

    it('should sequence a batch as super sequencer', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
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
        const batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(1);

        const batchAccInputHashJs = calculateAccInputHash(
            await proofOfEfficiencyContract.sequencedBatches(0),
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
    });

    it('sequenceBatches should sequence multiple batches', async () => {
        const l2txData = '0x1234';
        const maticAmount = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(2);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
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
        let batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(1);

        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(2);

        // Calcultate input Hahs for batch 1
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            calculateBatchHashData(sequence2.transactions),
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
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

        // sequence 2 batches
        const l2txData = '0x1234';
        const maticAmountSequence = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(1);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txDataForceBatch,
            globalExitRoot: lastGlobalExitRoot,
            timestamp: currentTimestamp,
            minForcedTimestamp: currentTimestamp,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
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
        sequence.minForcedTimestamp += 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Forced batches data must match');
        sequence.minForcedTimestamp -= 1;

        sequence.timestamp -= 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be bigger or equal than min');
        sequence.timestamp += 1;

        sequence.timestamp = currentTimestamp + 10;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');
        sequence.timestamp = currentTimestamp;

        sequence2.timestamp -= 1;
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');
        sequence2.timestamp += 1;

        // Sequence Bathces
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(Number(lastBatchSequenced) + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmountSequence)),
        );

        // Check batch mapping
        let batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(1);
        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        /*
         * Check batch mapping
         * Calcultate input Hahs for batch 1
         */
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            calculateBatchHashData(sequence2.transactions),
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(2);
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const maticAmount = (await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE()).mul(2);

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
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
        const batchHash = await proofOfEfficiencyContract.forcedBatches(1);
        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const batchHashJs = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32', 'uint64'],
            [
                calculateBatchHashData(l2txData),
                lastGlobalExitRoot,
                timestampForceBatch,
            ],
        );
        expect(batchHashJs).to.be.equal(batchHash);
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

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const forceBatchHash = await proofOfEfficiencyContract.forcedBatches(1);

        const batchHashJs = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32', 'uint64'],
            [
                calculateBatchHashData(l2txData),
                lastGlobalExitRoot,
                timestampForceBatch,
            ],
        );
        expect(batchHashJs).to.be.equal(forceBatchHash);

        // Check storage variables before call
        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(0);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // revert because the timeout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches([]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Must force at least 1 batch');

        // revert because the timeout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches([forceBatchStruct]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period');

        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(1);

        const timestampSequenceBatch = (await ethers.provider.getBlock()).timestamp;

        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(1);

        // Check force batches struct
        const batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(1);

        const batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            timestampSequenceBatch,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
    });

    it('should verify a sequenced batch', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
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
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::verifyBatches: newVerifiedBatch must be bigger than lastVerifiedBatch');

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::getInputSnarkBytes: newAccInputHash does not exist');

        // Verify batch
        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatches')
            .withArgs(numBatch, newStateRoot, aggregator.address);

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

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;
        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches([forceBatchStruct]))
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
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
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

    it('should match the computed SC input with the Js input', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
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

        const sentBatchHash = await proofOfEfficiencyContract.sequencedBatches(lastBatchSequenced + 1);
        const oldAccInputHash = await proofOfEfficiencyContract.sequencedBatches(0);

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(sentBatchHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await proofOfEfficiencyContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const inputSnarkJS = await calculateSnarkInput(
            currentStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            batchAccInputHashJs,
            numBatch - 1,
            numBatch,
            chainID,
            deployer.address,
        );

        // Compute Js input
        const circuitInpuSnarkSC = await proofOfEfficiencyContract.getNextSnarkInput(
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });

    it('should match the computed SC input with the Js input in force batches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()).toNumber() + 1;
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        const sequencedTimestmap = (await ethers.provider.getBlock()).timestamp;
        const oldAccInputHash = await proofOfEfficiencyContract.sequencedBatches(0);
        const batchAccInputHash = await proofOfEfficiencyContract.sequencedBatches(1);

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            sequencedTimestmap,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await proofOfEfficiencyContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const inputSnarkJS = await calculateSnarkInput(
            currentStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            batchAccInputHashJs,
            numBatch - 1,
            numBatch,
            chainID,
            deployer.address,
        );

        // Compute Js input
        const circuitInpuSnarkSC = await proofOfEfficiencyContract.getNextSnarkInput(
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });
});
