const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateAccInputHash, calculateBatchHashData } = contractUtils;

describe('Proof of efficiency', () => {
    let deployer;
    let aggregator;
    let trustedSequencer;
    let securityCouncil;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let globalExitRootManager;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, aggregator, trustedSequencer, securityCouncil] = await ethers.getSigners();

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

        const claimTimeout = 0;
        await globalExitRootManager.initialize(proofOfEfficiencyContract.address, bridgeContract.address);
        await bridgeContract.initialize(networkIDMainnet, globalExitRootManager.address, proofOfEfficiencyContract.address, claimTimeout);
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
            bridgeContract.address,
            securityCouncil.address,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should sequence a batch as truested sequencer', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because sender is not truested sequencer
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
        ).to.be.revertedWith('ProofOfEfficiency::verifyBatches: finalNewBatch must be bigger than lastVerifiedBatch');

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
});
