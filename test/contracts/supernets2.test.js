/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateAccInputHash, calculateBatchHashData } = contractUtils;

describe('Supernets2', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;
    let aggregator1;

    let verifierContract;
    let PolygonZkEVMBridgeContract;
    let supernets2Contract;
    let supernets2DataCommitteeContract;
    let maticTokenContract;
    let PolygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const urlSequencer = 'http://supernets2-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'supernets2';
    const version = '0.0.1';
    const forkID = 0;
    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeoutDefault = 10;
    let firstDeployment = true;

    // Supernets2 Constants
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
    const MAX_BATCH_MULTIPLIER = 12;
    const HALT_AGGREGATION_TIMEOUT = 60 * 60 * 24 * 7; // 7 days
    const _MAX_VERIFY_BATCHES = 1000;
    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, aggregator1] = await ethers.getSigners();

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

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();
        if ((await upgrades.admin.getInstance()).address !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }
        const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + (firstDeployment ? 3 : 2);
        const nonceProxyCommittee = nonceProxyBridge + (firstDeployment ? 2 : 1);
        // Always have to redeploy impl since the PolygonZkEVMGlobalExitRoot address changes
        const nonceProxySupernets2 = nonceProxyCommittee + 2;

        const precalculateBridgeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateCommitteeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyCommittee });
        const precalculateSupernets2Address = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxySupernets2 });
        firstDeployment = false;

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        PolygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateSupernets2Address, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const PolygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        PolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy Supernets2DataCommittee
        const supernets2DataCommitteeFactory = await ethers.getContractFactory('Supernets2DataCommittee');
        supernets2DataCommitteeContract = await upgrades.deployProxy(
            supernets2DataCommitteeFactory,
            [],
            { initializer: false },
        );

        // deploy Supernets2Mock
        const Supernets2Factory = await ethers.getContractFactory('Supernets2Mock');
        supernets2Contract = await upgrades.deployProxy(Supernets2Factory, [], {
            initializer: false,
            constructorArgs: [
                PolygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                PolygonZkEVMBridgeContract.address,
                supernets2DataCommitteeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        expect(precalculateBridgeAddress).to.be.equal(PolygonZkEVMBridgeContract.address);
        expect(precalculateCommitteeAddress).to.be.equal(supernets2DataCommitteeContract.address);
        expect(precalculateSupernets2Address).to.be.equal(supernets2Contract.address);

        await PolygonZkEVMBridgeContract.initialize(networkIDMainnet, PolygonZkEVMGlobalExitRoot.address, supernets2Contract.address);
        await supernets2Contract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );
        await supernets2DataCommitteeContract.initialize();
        const expectedHash = ethers.utils.solidityKeccak256(['bytes'], [[]]);
        await expect(supernets2DataCommitteeContract.connect(deployer)
            .setupCommittee(0, [], []))
            .to.emit(supernets2DataCommitteeContract, 'CommitteeUpdated')
            .withArgs(expectedHash);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('1000'));
    });

    it('should check the constructor parameters', async () => {
        expect(await supernets2Contract.globalExitRootManager()).to.be.equal(PolygonZkEVMGlobalExitRoot.address);
        expect(await supernets2Contract.matic()).to.be.equal(maticTokenContract.address);
        expect(await supernets2Contract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await supernets2Contract.bridgeAddress()).to.be.equal(PolygonZkEVMBridgeContract.address);

        expect(await supernets2Contract.owner()).to.be.equal(deployer.address);
        expect(await supernets2Contract.admin()).to.be.equal(admin.address);
        expect(await supernets2Contract.chainID()).to.be.equal(chainID);
        expect(await supernets2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await supernets2Contract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await supernets2Contract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await supernets2Contract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);

        expect(await supernets2Contract.batchNumToStateRoot(0)).to.be.equal(genesisRoot);
        expect(await supernets2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await supernets2Contract.networkName()).to.be.equal(networkName);

        expect(await supernets2Contract.batchFee()).to.be.equal(ethers.utils.parseEther('0.1'));
        expect(await supernets2Contract.batchFee()).to.be.equal(ethers.utils.parseEther('0.1'));
        expect(await supernets2Contract.getForcedBatchFee()).to.be.equal(ethers.utils.parseEther('10'));

        expect(await supernets2Contract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);
        expect(await supernets2Contract.isForcedBatchDisallowed()).to.be.equal(true);
    });

    it('should check initialize function', async () => {
        const Supernets2Factory = await ethers.getContractFactory('Supernets2Mock');
        const supernets2ContractInitialize = await upgrades.deployProxy(Supernets2Factory, [], {
            initializer: false,
            constructorArgs: [
                PolygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                PolygonZkEVMBridgeContract.address,
                supernets2DataCommitteeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        await expect(supernets2ContractInitialize.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: HALT_AGGREGATION_TIMEOUT + 1,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        )).to.be.revertedWith('PendingStateTimeoutExceedHaltAggregationTimeout');

        await expect(supernets2ContractInitialize.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: HALT_AGGREGATION_TIMEOUT + 1,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        )).to.be.revertedWith('TrustedAggregatorTimeoutExceedHaltAggregationTimeout');

        await expect(
            supernets2ContractInitialize.initialize(
                {
                    admin: admin.address,
                    trustedSequencer: trustedSequencer.address,
                    pendingStateTimeout: pendingStateTimeoutDefault,
                    trustedAggregator: trustedAggregator.address,
                    trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
                },
                genesisRoot,
                urlSequencer,
                networkName,
                version,
            ),
        ).to.emit(supernets2ContractInitialize, 'UpdateSupernets2Version').withArgs(0, forkID, version);
    });

    it('should check setters of admin', async () => {
        expect(await supernets2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await supernets2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await supernets2Contract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await supernets2Contract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);
        expect(await supernets2Contract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await supernets2Contract.admin()).to.be.equal(admin.address);

        // setTrustedSequencer
        await expect(supernets2Contract.setTrustedSequencer(deployer.address))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            supernets2Contract.connect(admin).setTrustedSequencer(deployer.address),
        ).to.emit(supernets2Contract, 'SetTrustedSequencer').withArgs(deployer.address);
        expect(await supernets2Contract.trustedSequencer()).to.be.equal(deployer.address);

        // setTrustedSequencerURL
        const url = 'https://test';
        await expect(supernets2Contract.setTrustedSequencerURL(url))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            supernets2Contract.connect(admin).setTrustedSequencerURL(url),
        ).to.emit(supernets2Contract, 'SetTrustedSequencerURL').withArgs(url);
        expect(await supernets2Contract.trustedSequencerURL()).to.be.equal(url);

        // setTrustedAggregator
        const newTrustedAggregator = deployer.address;
        await expect(supernets2Contract.setTrustedAggregator(newTrustedAggregator))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            supernets2Contract.connect(admin).setTrustedAggregator(newTrustedAggregator),
        ).to.emit(supernets2Contract, 'SetTrustedAggregator').withArgs(newTrustedAggregator);
        expect(await supernets2Contract.trustedAggregator()).to.be.equal(newTrustedAggregator);

        // setTrustedAggregatorTimeout
        await expect(supernets2Contract.setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('OnlyAdmin');

        await expect(supernets2Contract.connect(admin).setTrustedAggregatorTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('TrustedAggregatorTimeoutExceedHaltAggregationTimeout');

        await expect(supernets2Contract.connect(admin).setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('NewTrustedAggregatorTimeoutMustBeLower');

        const newTrustedAggregatorTimeout = trustedAggregatorTimeoutDefault - 1;
        await expect(
            supernets2Contract.connect(admin).setTrustedAggregatorTimeout(newTrustedAggregatorTimeout),
        ).to.emit(supernets2Contract, 'SetTrustedAggregatorTimeout').withArgs(newTrustedAggregatorTimeout);
        expect(await supernets2Contract.trustedAggregatorTimeout()).to.be.equal(newTrustedAggregatorTimeout);

        // setPendingStateTimeoutDefault
        await expect(supernets2Contract.setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('OnlyAdmin');

        await expect(supernets2Contract.connect(admin).setPendingStateTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('PendingStateTimeoutExceedHaltAggregationTimeout');

        await expect(supernets2Contract.connect(admin).setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('NewPendingStateTimeoutMustBeLower');

        const newPendingStateTimeoutDefault = pendingStateTimeoutDefault - 1;
        await expect(
            supernets2Contract.connect(admin).setPendingStateTimeout(newPendingStateTimeoutDefault),
        ).to.emit(supernets2Contract, 'SetPendingStateTimeout').withArgs(newPendingStateTimeoutDefault);
        expect(await supernets2Contract.pendingStateTimeout()).to.be.equal(newPendingStateTimeoutDefault);

        // setMultiplierBatchFee
        const newMultiplierBatchFee = 1023;
        await expect(supernets2Contract.connect(admin).setMultiplierBatchFee(newMultiplierBatchFee + 1))
            .to.be.revertedWith('InvalidRangeMultiplierBatchFee');

        await expect(
            supernets2Contract.connect(admin).setMultiplierBatchFee(newMultiplierBatchFee),
        ).to.emit(supernets2Contract, 'SetMultiplierBatchFee').withArgs(newMultiplierBatchFee);
        expect(await supernets2Contract.multiplierBatchFee()).to.be.equal(newMultiplierBatchFee);

        // setVerifyBatchTimeTarget
        const newVerifyBatchTimeTarget = 100;

        await expect(supernets2Contract.connect(admin).setVerifyBatchTimeTarget(60 * 60 * 24 + 1)) // more than 1 day
            .to.be.revertedWith('InvalidRangeBatchTimeTarget');

        await expect(
            supernets2Contract.connect(admin).setVerifyBatchTimeTarget(newVerifyBatchTimeTarget),
        ).to.emit(supernets2Contract, 'SetVerifyBatchTimeTarget').withArgs(newVerifyBatchTimeTarget);
        expect(await supernets2Contract.verifyBatchTimeTarget()).to.be.equal(newVerifyBatchTimeTarget);

        // setPendingStateTimeoutDefault
        const newForceBatchTimeout = 0;
        await expect(supernets2Contract.setForceBatchTimeout(newForceBatchTimeout))
            .to.be.revertedWith('OnlyAdmin');

        await expect(supernets2Contract.connect(admin).setForceBatchTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('InvalidRangeForceBatchTimeout');

        await expect(supernets2Contract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT))
            .to.be.revertedWith('InvalidRangeForceBatchTimeout');
        await expect(
            supernets2Contract.connect(admin).setForceBatchTimeout(newForceBatchTimeout),
        ).to.emit(supernets2Contract, 'SetForceBatchTimeout').withArgs(newForceBatchTimeout);
        expect(await supernets2Contract.forceBatchTimeout()).to.be.equal(newForceBatchTimeout);

        // Activate force batches
        await expect(supernets2Contract.activateForceBatches())
            .to.be.revertedWith('OnlyAdmin');

        // Check force batches are unactive
        await expect(supernets2Contract.forceBatch('0x', 0))
            .to.be.revertedWith('ForceBatchNotAllowed');
        await expect(supernets2Contract.sequenceForceBatches([]))
            .to.be.revertedWith('ForceBatchNotAllowed');

        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');
        await expect(supernets2Contract.connect(admin).activateForceBatches())
            .to.be.revertedWith('ForceBatchesAlreadyActive');

        expect(await supernets2Contract.isForcedBatchDisallowed()).to.be.equal(false);

        // Transfer admin role

        // First set pending Admin
        expect(await supernets2Contract.pendingAdmin()).to.be.equal(ethers.constants.AddressZero);
        await expect(supernets2Contract.transferAdminRole(deployer.address))
            .to.be.revertedWith('OnlyAdmin');

        await expect(
            supernets2Contract.connect(admin).transferAdminRole(deployer.address),
        ).to.emit(supernets2Contract, 'TransferAdminRole').withArgs(deployer.address);
        expect(await supernets2Contract.pendingAdmin()).to.be.equal(deployer.address);

        // Accept transfer admin
        expect(await supernets2Contract.admin()).to.be.equal(admin.address);
        await expect(supernets2Contract.connect(admin).acceptAdminRole())
            .to.be.revertedWith('OnlyPendingAdmin');

        await expect(
            supernets2Contract.connect(deployer).acceptAdminRole(),
        ).to.emit(supernets2Contract, 'AcceptAdminRole').withArgs(deployer.address);
        expect(await supernets2Contract.admin()).to.be.equal(deployer.address);
    });

    it('should check state roots inside prime', async () => {
        const validRoots = [
            '0x02959FFA45214AF690A3730806D4F59F7056CCC449373BBE42C20765D3996CA1',
            '0x7E680781BF155C4682C7D431E86DAFD1DD986BE664A7256879CB2B33391E2DAC',
            '0xD710F3A64598F4C6C94E2A5F3F6193B4FBADBF5A5DBAFEBD0A75277E27E2BCD3',
            '0x048F3F2D4430DAF38E3CC891853C9BB102E5880E1ADA799554C7ED392B4BD7F3',
            '0x7E680781BF155C4682C7D431E86DAFD1DD986BE664A7256879CB2B33391E2DAC',
            '0xFFFFFFFE45214AF690A3730806D4F59F7056CCC449373BBE42C20765D3996CA1',
            '0x7E680781BF155C4FFFFFFFF1E86DAFD1DD986BE664A7256879CB2B33391E2DAC',
            '0xFFFFFFFF00000000C94E2A5F3F6193B4FBADBF5A5DBAFEBD0A75277E27E2BCD3',
            '0x048F3F2D4430DAF3FFFFFFFF0000000002E5880E1ADA799554C7ED392B4BD7F3',
            '0x7E680781BF155C4682C7D431E86DAFD1FFFFFFFF0000000079CB2B33391E2DAC',
            '0x02959FFA45214AF690A3730806D4F59F7056CCC449373BBEFFFFFFFF00000000',
            '0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000',
        ];

        const aliasInvalidRoots = ['0xFFFFFFFF45214AF690A3730806D4F59F7056CCC449373BBE42C20765D3996CA1',
            '0x7E680781BF155C46FFFFFFFFE86DAFD1DD986BE664A7256879CB2B33391E2DAC',
            '0xD710F3A64598F4C6C94E2A5F3F6193B4FFFFFFFF5DBAFEBD0A75277E27E2BCD3',
            '0x048F3F2D4430DAF38E3CC891853C9BB102E5880E1ADA7995FFFFFFFF2B4BD7F3',
            '0xFFFFFFFFBF155C4682C7D431E86DAFD1FFFFFFFF64A7256879CB2B33391E2DAC',
        ];

        for (let i = 0; i < validRoots.length; i++) {
            expect(await supernets2Contract.checkStateRootInsidePrime(validRoots[i])).to.be.equal(true);
        }

        for (let i = 0; i < aliasInvalidRoots.length; i++) {
            expect(await supernets2Contract.checkStateRootInsidePrime(aliasInvalidRoots[i])).to.be.equal(false);
        }
    });

    it('should sequence a batch as trusted sequencer', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await supernets2Contract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because sender is not truested sequencer
        await expect(supernets2Contract.sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('OnlyTrustedSequencer');

        // revert because tokens were not approved
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();

        // Test sequence batches errors
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([], trustedSequencer.address, []))
            .to.be.revertedWith('SequenceZeroBatches');

        sequence.globalExitRoot = ethers.constants.MaxUint256;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('GlobalExitRootNotExist');
        sequence.globalExitRoot = ethers.constants.HashZero;

        // Sequence batch
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], deployer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await supernets2Contract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            (await supernets2Contract.sequencedBatches(0)).accInputHash,
            transactionsHash,
            sequence.globalExitRoot,
            sequence.timestamp,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(sequencedTimestamp);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);
    });

    it('sequenceBatches should sequence multiple batches', async () => {
        const l2txData = '0x1234';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = (await supernets2Contract.batchFee()).mul(2);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();

        // Sequence batches
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await supernets2Contract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        const sequencedBatchData2 = await supernets2Contract.sequencedBatches(2);
        const batchAccInputHash2 = sequencedBatchData2.accInputHash;

        // Calcultate input Hahs for batch 1
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            sequence.transactionsHash,
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            sequence2.transactionsHash,
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        expect(batchAccInputHash2).to.be.equal(batchAccInputHashJs);
    });

    it('force batches through smart contract', async () => {
        const l2txDataForceBatch = '0x123456';
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // deploy sender SC
        const sendDataFactory = await ethers.getContractFactory('SendData');
        const sendDataContract = await sendDataFactory.deploy();
        await sendDataContract.deployed();

        // transfer matic
        await maticTokenContract.transfer(sendDataContract.address, ethers.utils.parseEther('1000'));

        // Approve matic
        const approveTx = await maticTokenContract.populateTransaction.approve(supernets2Contract.address, maticAmount);
        await sendDataContract.sendData(approveTx.to, approveTx.data);

        // Activate forced batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        // Force batch
        const lastForcedBatch = (await supernets2Contract.lastForceBatch()) + 1;

        const forceBatchTx = await supernets2Contract.populateTransaction.forceBatch(l2txDataForceBatch, maticAmount);
        await expect(sendDataContract.sendData(forceBatchTx.to, forceBatchTx.data))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, sendDataContract.address, l2txDataForceBatch);
    });

    it('sequenceBatches should sequence multiple batches and force batches', async () => {
        const l2txDataForceBatch = '0x123456';
        const transactionsHashForceBatch = calculateBatchHashData(l2txDataForceBatch);
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await supernets2Contract.lastForceBatch()) + 1;

        // Activate forced batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        // Force batch
        await expect(supernets2Contract.forceBatch(l2txDataForceBatch, maticAmount))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        // sequence 2 batches
        const l2txData = '0x1234';
        const transactionsHash2 = calculateBatchHashData(l2txData);
        const maticAmountSequence = (await supernets2Contract.batchFee()).mul(1);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash: transactionsHashForceBatch,
            globalExitRoot: lastGlobalExitRoot,
            timestamp: currentTimestamp,
            minForcedTimestamp: currentTimestamp,
        };

        const sequence2 = {
            transactionsHash: transactionsHash2,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmountSequence),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();

        // Assert that the timestamp requirements must accomplish with force batches too
        sequence.minForcedTimestamp += 1;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        sequence.minForcedTimestamp -= 1;

        sequence.timestamp -= 1;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampBelowForcedTimestamp');
        sequence.timestamp += 1;

        sequence.timestamp = currentTimestamp + 10;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');
        sequence.timestamp = currentTimestamp;

        sequence2.timestamp -= 1;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');
        sequence2.timestamp += 1;

        // Sequence Bathces
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(Number(lastBatchSequenced) + 2);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmountSequence)),
        );

        // Check batch mapping
        const batchAccInputHash = (await supernets2Contract.sequencedBatches(1)).accInputHash;
        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        /*
         * Check batch mapping
         * Calcultate input Hahs for batch 1
         */
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            sequence.transactionsHash,
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            sequence2.transactionsHash,
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        const batchData2 = await supernets2Contract.sequencedBatches(2);
        expect(batchData2.accInputHash).to.be.equal(batchAccInputHashJs);
        expect(batchData2.sequencedTimestamp).to.be.equal(sequencedTimestamp);
        expect(batchData2.previousLastBatchSequenced).to.be.equal(0);
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = (await supernets2Contract.batchFee()).mul(2);

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();

        let currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]); // evm_setNextBlockTimestamp

        sequence.timestamp = currentTimestamp + 2; // bigger than current block tiemstamp

        // revert because timestamp is more than the current one
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp;
        sequence2.timestamp = currentTimestamp - 1;

        // revert because the second sequence has less timestamp than the previous batch
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp + 1; // edge case, same timestamp as the block
        sequence2.timestamp = currentTimestamp + 1;

        // Sequence Batches
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should force a batch of transactions', async () => {
        const l2txData = '0x123456';
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await supernets2Contract.getForcedBatchFee()).toString());

        // Activate force batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(supernets2Contract.forceBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('NotEnoughMaticAmount');

        // revert because tokens were not approved
        await expect(supernets2Contract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        await expect(
            maticTokenContract.approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForceBatch = await supernets2Contract.lastForceBatch();

        // Force batch
        await expect(supernets2Contract.forceBatch(l2txData, maticAmount))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForceBatch + 1, lastGlobalExitRoot, deployer.address, '0x');

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check force batches struct
        const batchHash = await supernets2Contract.forcedBatches(1);
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
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        const lastForcedBatch = (await supernets2Contract.lastForceBatch()) + 1;

        await expect(supernets2Contract.forceBatch(l2txData, maticAmount))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const forceBatchHash = await supernets2Contract.forcedBatches(1);

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
        expect(await supernets2Contract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await supernets2Contract.lastForceBatch()).to.be.equal(1);
        expect(await supernets2Contract.lastBatchSequenced()).to.be.equal(0);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // revert because the timeout is not expired
        await expect(supernets2Contract.sequenceForceBatches([]))
            .to.be.revertedWith('SequenceZeroBatches');

        // revert because does not exist that many forced Batches
        await expect(supernets2Contract.sequenceForceBatches(Array(2).fill(forceBatchStruct)))
            .to.be.revertedWith('ForceBatchesOverflow');

        // revert because the timeout is not expired
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStruct]))
            .to.be.revertedWith('ForceBatchTimeoutNotExpired');

        const forceBatchStructBad = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        forceBatchStructBad.minForcedTimestamp += 1;
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.minForcedTimestamp -= 1;

        forceBatchStructBad.globalExitRoot = ethers.constants.HashZero;
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.globalExitRoot = lastGlobalExitRoot;

        forceBatchStructBad.transactions = '0x1111';
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.transactions = l2txData;

        // Increment timestamp
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        // sequence force batch
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(supernets2Contract, 'SequenceForceBatches')
            .withArgs(1);

        const timestampSequenceBatch = (await ethers.provider.getBlock()).timestamp;

        expect(await supernets2Contract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await supernets2Contract.lastForceBatch()).to.be.equal(1);
        expect(await supernets2Contract.lastBatchSequenced()).to.be.equal(1);

        // Check force batches struct
        const batchAccInputHash = (await supernets2Contract.sequencedBatches(1)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            timestampSequenceBatch,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
    });

    it('should verify a sequenced batch using verifyBatchesTrustedAggregator', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await supernets2Contract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();
        // Sequence Batches
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await supernets2Contract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        await expect(
            supernets2Contract.connect(deployer).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OnlyTrustedAggregator');

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchBelowLastVerifiedBatch');

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('NewAccInputHashDoesNotExist');

        // Verify batch
        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatchesTrustedAggregator')
            .withArgs(numBatch, newStateRoot, trustedAggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should verify forced sequenced batch using verifyBatchesTrustedAggregator', async () => {
        const l2txData = '0x123456';
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        const lastForcedBatch = (await supernets2Contract.lastForceBatch()) + 1;
        await expect(supernets2Contract.forceBatch(l2txData, maticAmount))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;
        // Increment timestamp
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(supernets2Contract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await supernets2Contract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        // Verify batch
        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatch')
            .withArgs(numBatch, trustedAggregator.address)
            .to.emit(maticTokenContract, 'Transfer')
            .withArgs(supernets2Contract.address, trustedAggregator.address, maticAmount);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should match the computed SC input with the Js input', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await supernets2Contract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();

        // Sequence
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sentBatchHash = (await supernets2Contract.sequencedBatches(lastBatchSequenced + 1)).accInputHash;
        const oldAccInputHash = (await supernets2Contract.sequencedBatches(0)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            sequence.transactionsHash,
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(sentBatchHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await supernets2Contract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await supernets2Contract.lastVerifiedBatch()) + 1;

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
            forkID,
        );

        // Compute Js input
        const pendingStateNum = 0;
        const circuitInpuSnarkSC = await supernets2Contract.getNextSnarkInput(
            pendingStateNum,
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });

    it('should match the computed SC input with the Js input in force batches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await supernets2Contract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            supernets2Contract.connect(admin).activateForceBatches(),
        ).to.emit(supernets2Contract, 'ActivateForceBatches');

        const lastForcedBatch = (await supernets2Contract.lastForceBatch()).toNumber() + 1;
        await expect(supernets2Contract.forceBatch(l2txData, maticAmount))
            .to.emit(supernets2Contract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        // Increment timestamp
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(supernets2Contract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(supernets2Contract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        const sequencedTimestmap = (await ethers.provider.getBlock()).timestamp;
        const oldAccInputHash = (await supernets2Contract.sequencedBatches(0)).accInputHash;
        const batchAccInputHash = (await supernets2Contract.sequencedBatches(1)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            sequencedTimestmap,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await supernets2Contract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await supernets2Contract.lastVerifiedBatch()) + 1;

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
            forkID,
        );

        // Compute Js input
        const pendingStateNum = 0;
        const circuitInpuSnarkSC = await supernets2Contract.getNextSnarkInput(
            pendingStateNum,
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });

    it('should verify a sequenced batch using verifyBatches', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await supernets2Contract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await supernets2Contract.lastBatchSequenced();
        // Sequence Batches
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // aggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const numBatch = (await supernets2Contract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            aggregator1.address,
        );

        const sequencedBatchData = await supernets2Contract.sequencedBatches(1);
        const { sequencedTimestamp } = sequencedBatchData;
        const currentBatchFee = await supernets2Contract.batchFee();

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('TrustedAggregatorTimeoutNotExpired');

        await ethers.provider.send('evm_setNextBlockTimestamp', [sequencedTimestamp.toNumber() + trustedAggregatorTimeoutDefault - 1]);

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('TrustedAggregatorTimeoutNotExpired');

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('NewAccInputHashDoesNotExist');

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch + _MAX_VERIFY_BATCHES,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('ExceedMaxVerifyBatches');
        // Verify batch
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(numBatch, newStateRoot, aggregator1.address);

        const verifyTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            aggregator1.address,
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );

        // Check pending state
        const lastPendingstate = 1;
        expect(lastPendingstate).to.be.equal(await supernets2Contract.lastPendingState());

        const pendingStateData = await supernets2Contract.pendingStateTransitions(lastPendingstate);
        expect(verifyTimestamp).to.be.equal(pendingStateData.timestamp);
        expect(numBatch).to.be.equal(pendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(pendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(pendingStateData.stateRoot);

        // Try consolidate state
        expect(0).to.be.equal(await supernets2Contract.lastVerifiedBatch());

        // Pending state can't be 0
        await expect(
            supernets2Contract.consolidatePendingState(0),
        ).to.be.revertedWith('PendingStateInvalid');

        // Pending state does not exist
        await expect(
            supernets2Contract.consolidatePendingState(2),
        ).to.be.revertedWith('PendingStateInvalid');

        // Not ready to be consolidated
        await expect(
            supernets2Contract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PendingStateNotConsolidable');

        await ethers.provider.send('evm_setNextBlockTimestamp', [verifyTimestamp + pendingStateTimeoutDefault - 1]);

        await expect(
            supernets2Contract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PendingStateNotConsolidable');

        await expect(
            supernets2Contract.consolidatePendingState(lastPendingstate),
        ).to.emit(supernets2Contract, 'ConsolidatePendingState')
            .withArgs(numBatch, newStateRoot, lastPendingstate);

        // Pending state already consolidated
        await expect(
            supernets2Contract.consolidatePendingState(1),
        ).to.be.revertedWith('PendingStateInvalid');

        // Fee es divided because is was fast verified
        const multiplierFee = await supernets2Contract.multiplierBatchFee();
        expect((currentBatchFee.mul(1000)).div(multiplierFee)).to.be.equal(await supernets2Contract.batchFee());

        // Check pending state variables
        expect(1).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await supernets2Contract.batchNumToStateRoot(1));
        expect(1).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());
    });

    it('should test the pending state properly', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const batchesForSequence = 5;
        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        const sequencesArray = Array(batchesForSequence).fill(sequence);
        // Array(5).fill("girl", 0);

        // Approve lots of tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
                .to.emit(supernets2Contract, 'SequenceBatches');
        }
        await ethers.provider.send('evm_increaseTime', [60]);

        // Forge first sequence with verifyBAtches
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        let currentPendingState = 0;
        let currentNumBatch = 0;
        let newBatch = currentNumBatch + batchesForSequence;

        // Verify batch
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        let verifyTimestamp = (await ethers.provider.getBlock()).timestamp;

        // Check pending state
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());

        let currentPendingStateData = await supernets2Contract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Try to verify Batches that does not go beyond the last pending state
        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchBelowLastVerifiedBatch');

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                10,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitNumBatchDoesNotMatchPendingState');

        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newBatch, newStateRoot, trustedAggregator.address);

        // Check pending state is clear
        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(0).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        // Check consolidated state
        let currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentVerifiedBatch));

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                1,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        // Since this pending state was not consolidated, the currentNumBatch does not have stored root
        expect(ethers.constants.HashZero).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentNumBatch));
        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                0,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchBelowLastVerifiedBatch');

        // Again use verifyBatches
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // Check pending state
        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());

        currentPendingStateData = await supernets2Contract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Verify another sequence from batch 0
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                1,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                0,
                0,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // Check pending state
        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());

        currentPendingStateData = await supernets2Contract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Verify batches using old pending state
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        // Must specify pending state num while is not consolidated
        await expect(
            supernets2Contract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                currentNumBatch - 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState - 1,
                currentNumBatch - 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());

        currentPendingStateData = await supernets2Contract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Consolidate using verifyBatches
        const firstPendingState = await supernets2Contract.pendingStateTransitions(1);
        await ethers.provider.send('evm_setNextBlockTimestamp', [firstPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        let currentPendingConsolidated = 0;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address)
            .to.emit(supernets2Contract, 'ConsolidatePendingState')
            .withArgs(firstPendingState.lastVerifiedBatch, newStateRoot, ++currentPendingConsolidated);

        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        currentPendingStateData = await supernets2Contract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Check state consolidated
        currentVerifiedBatch += batchesForSequence;
        expect(currentVerifiedBatch).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentVerifiedBatch));

        // Consolidate using sendBatches
        const secondPendingState = await supernets2Contract.pendingStateTransitions(2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [secondPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .to.emit(supernets2Contract, 'ConsolidatePendingState')
            .withArgs(secondPendingState.lastVerifiedBatch, newStateRoot, ++currentPendingConsolidated);

        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        // Check state consolidated
        currentVerifiedBatch += batchesForSequence;
        expect(currentVerifiedBatch).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentVerifiedBatch));

        // Put a lot of pending states and check that half of them are consoldiated
        for (let i = 0; i < 8; i++) {
            currentNumBatch = newBatch;
            newBatch += batchesForSequence;
            await expect(
                supernets2Contract.connect(aggregator1).verifyBatches(
                    currentPendingState,
                    currentNumBatch,
                    newBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    zkProofFFlonk,
                ),
            ).to.emit(supernets2Contract, 'VerifyBatches')
                .withArgs(newBatch, newStateRoot, aggregator1.address);

            currentPendingState++;
        }

        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());

        currentPendingConsolidated = await supernets2Contract.lastPendingStateConsolidated();
        const lastPendingState = await supernets2Contract.pendingStateTransitions(currentPendingState);
        await ethers.provider.send('evm_setNextBlockTimestamp', [lastPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        // call verify batches and check that half of them are consolidated
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        const nextPendingConsolidated = Number(currentPendingConsolidated) + 1;
        const nextConsolidatedStateNum = nextPendingConsolidated + Number(Math.floor((currentPendingState - nextPendingConsolidated) / 2));
        const nextConsolidatedState = await supernets2Contract.pendingStateTransitions(nextConsolidatedStateNum);

        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .to.emit(supernets2Contract, 'ConsolidatePendingState')
            .withArgs(nextConsolidatedState.lastVerifiedBatch, newStateRoot, nextConsolidatedStateNum);

        // Put pendingState to 0 and check that the pending state is clear after verifyBatches
        await expect(
            supernets2Contract.connect(admin).setPendingStateTimeout(0),
        ).to.emit(supernets2Contract, 'SetPendingStateTimeout').withArgs(0);

        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(0).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        // Check consolidated state
        currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentVerifiedBatch));
    });

    it('Activate emergency state due halt timeout', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await supernets2Contract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Sequence batch
        const lastBatchSequenced = 1;
        await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(supernets2Contract, 'SequenceBatches')
            .withArgs(lastBatchSequenced);

        const sequencedTimestmap = Number((await supernets2Contract.sequencedBatches(1)).sequencedTimestamp);
        const haltTimeout = HALT_AGGREGATION_TIMEOUT;

        // Try to activate the emergency state

        // Check batch is not sequenced
        await expect(supernets2Contract.connect(aggregator1).activateEmergencyState(2))
            .to.be.revertedWith('BatchNotSequencedOrNotSequenceEnd');

        // Check batch is already verified
        await supernets2Contract.setVerifiedBatch(1);
        await expect(supernets2Contract.connect(aggregator1).activateEmergencyState(1))
            .to.be.revertedWith('BatchAlreadyVerified');
        await supernets2Contract.setVerifiedBatch(0);

        // check timeout is not expired
        await expect(supernets2Contract.connect(aggregator1).activateEmergencyState(1))
            .to.be.revertedWith('HaltTimeoutNotExpired');

        await ethers.provider.send('evm_setNextBlockTimestamp', [sequencedTimestmap + haltTimeout]);

        // Succesfully acitvate emergency state
        await expect(supernets2Contract.connect(aggregator1).activateEmergencyState(1))
            .to.emit(supernets2Contract, 'EmergencyStateActivated');
    });

    it('Test overridePendingState properly', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const batchesForSequence = 5;
        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        const sequencesArray = Array(batchesForSequence).fill(sequence);
        // Array(5).fill("girl", 0);

        // Approve lots of tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(supernets2Contract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(supernets2Contract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
                .to.emit(supernets2Contract, 'SequenceBatches');
        }
        await ethers.provider.send('evm_increaseTime', [60]);

        // Forge first sequence with verifyBAtches
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        let currentPendingState = 0;
        let currentNumBatch = 0;
        let newBatch = currentNumBatch + batchesForSequence;

        // Verify batch 2 batches
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            supernets2Contract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const finalPendingState = 2;

        await expect(
            supernets2Contract.connect(aggregator1).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OnlyTrustedAggregator');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                finalPendingState + 1,
                finalPendingState + 2,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch + 1,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitNumBatchDoesNotMatchPendingState');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                0,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                finalPendingState,
                finalPendingState,
                currentNumBatch + 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalPendingStateNumInvalid');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                finalPendingState,
                finalPendingState + 2,
                currentNumBatch + 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalPendingStateNumInvalid');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('StoredRootMustBeDifferentThanNewRoot');

        const newStateRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
        await expect(
            supernets2Contract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.emit(supernets2Contract, 'OverridePendingState').withArgs(newBatch, newStateRoot2, trustedAggregator.address);

        // check pending state is clear
        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await supernets2Contract.lastPendingState());
        expect(0).to.be.equal(await supernets2Contract.lastPendingStateConsolidated());

        // check consolidated state
        const currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await supernets2Contract.lastVerifiedBatch());
        expect(newStateRoot2).to.be.equal(await supernets2Contract.batchNumToStateRoot(currentVerifiedBatch));
    });

    it('Test batch fees properly', async () => {
        const accInputData = ethers.constants.HashZero;
        const verifyBatchTimeTarget = Number(await supernets2Contract.verifyBatchTimeTarget());
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const multiplierFee = ethers.BigNumber.from(await supernets2Contract.multiplierBatchFee()); // 1002
        const bingNumber1000 = ethers.BigNumber.from(1000);

        // Create sequenced to update the fee
        await supernets2Contract.setSequencedBatches(
            50,
            accInputData,
            currentTimestamp + verifyBatchTimeTarget,
            0,
        ); // Edge case, will be below

        await supernets2Contract.setSequencedBatches(
            100,
            accInputData,
            currentTimestamp + verifyBatchTimeTarget + 1,
            50,
        ); // Edge case, will be above

        // Assert currentFee
        let currentBatchFee = await supernets2Contract.batchFee();
        expect(currentBatchFee).to.be.equal(ethers.utils.parseEther('0.1'));

        await ethers.provider.send('evm_setNextBlockTimestamp', [currentTimestamp + verifyBatchTimeTarget * 2]);

        await supernets2Contract.updateBatchFee(100);

        // Fee does not change since there are the same batches above than below
        expect(await supernets2Contract.batchFee()).to.be.equal(currentBatchFee);

        /*
         * Now all the batches will be above
         * since the MAX_BATCH_MULTIPLIER is 12 this will be the pow
         */
        await supernets2Contract.updateBatchFee(100);

        currentBatchFee = currentBatchFee.mul(multiplierFee.pow(MAX_BATCH_MULTIPLIER)).div(bingNumber1000.pow(MAX_BATCH_MULTIPLIER));
        expect(currentBatchFee).to.be.equal(await supernets2Contract.batchFee());

        // Check the fee is now below
        await supernets2Contract.setSequencedBatches(50, accInputData, currentTimestamp + verifyBatchTimeTarget * 2, 0); // Below
        currentBatchFee = currentBatchFee.mul(bingNumber1000.pow(MAX_BATCH_MULTIPLIER)).div(multiplierFee.pow(MAX_BATCH_MULTIPLIER));
    });
});
