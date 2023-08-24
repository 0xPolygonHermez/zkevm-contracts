/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateAccInputHash, calculateBatchHashData } = contractUtils;

describe('CDKValidium', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;
    let aggregator1;

    let verifierContract;
    let PolygonZkEVMBridgeContract;
    let cdkValidiumContract;
    let cdkDataCommitteeContract;
    let maticTokenContract;
    let PolygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const urlSequencer = 'http://cdk-validium-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'cdk-validium';
    const version = '0.0.1';
    const forkID = 0;
    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeoutDefault = 10;
    let firstDeployment = true;

    // CDKValidium Constants
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
        const nonceProxyCDKValidium = nonceProxyCommittee + 2;

        const precalculateBridgeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateCommitteeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyCommittee });
        const precalculateCDKValidiumAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyCDKValidium });
        firstDeployment = false;

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        PolygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateCDKValidiumAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const PolygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        PolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy CDKDataCommittee
        const cdkDataCommitteeFactory = await ethers.getContractFactory('CDKDataCommittee');
        cdkDataCommitteeContract = await upgrades.deployProxy(
            cdkDataCommitteeFactory,
            [],
            { initializer: false },
        );

        // deploy CDKValidiumMock
        const CDKValidiumFactory = await ethers.getContractFactory('CDKValidiumMock');
        cdkValidiumContract = await upgrades.deployProxy(CDKValidiumFactory, [], {
            initializer: false,
            constructorArgs: [
                PolygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                PolygonZkEVMBridgeContract.address,
                cdkDataCommitteeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        expect(precalculateBridgeAddress).to.be.equal(PolygonZkEVMBridgeContract.address);
        expect(precalculateCommitteeAddress).to.be.equal(cdkDataCommitteeContract.address);
        expect(precalculateCDKValidiumAddress).to.be.equal(cdkValidiumContract.address);

        await PolygonZkEVMBridgeContract.initialize(networkIDMainnet, PolygonZkEVMGlobalExitRoot.address, cdkValidiumContract.address);
        await cdkValidiumContract.initialize(
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
        await cdkDataCommitteeContract.initialize();
        const expectedHash = ethers.utils.solidityKeccak256(['bytes'], [[]]);
        await expect(cdkDataCommitteeContract.connect(deployer)
            .setupCommittee(0, [], []))
            .to.emit(cdkDataCommitteeContract, 'CommitteeUpdated')
            .withArgs(expectedHash);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('1000'));
    });

    it('should check the constructor parameters', async () => {
        expect(await cdkValidiumContract.globalExitRootManager()).to.be.equal(PolygonZkEVMGlobalExitRoot.address);
        expect(await cdkValidiumContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await cdkValidiumContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await cdkValidiumContract.bridgeAddress()).to.be.equal(PolygonZkEVMBridgeContract.address);

        expect(await cdkValidiumContract.owner()).to.be.equal(deployer.address);
        expect(await cdkValidiumContract.admin()).to.be.equal(admin.address);
        expect(await cdkValidiumContract.chainID()).to.be.equal(chainID);
        expect(await cdkValidiumContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await cdkValidiumContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await cdkValidiumContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await cdkValidiumContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);

        expect(await cdkValidiumContract.batchNumToStateRoot(0)).to.be.equal(genesisRoot);
        expect(await cdkValidiumContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await cdkValidiumContract.networkName()).to.be.equal(networkName);

        expect(await cdkValidiumContract.batchFee()).to.be.equal(ethers.utils.parseEther('0.1'));
        expect(await cdkValidiumContract.batchFee()).to.be.equal(ethers.utils.parseEther('0.1'));
        expect(await cdkValidiumContract.getForcedBatchFee()).to.be.equal(ethers.utils.parseEther('10'));

        expect(await cdkValidiumContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);
        expect(await cdkValidiumContract.isForcedBatchDisallowed()).to.be.equal(true);
    });

    it('should check initialize function', async () => {
        const CDKValidiumFactory = await ethers.getContractFactory('CDKValidiumMock');
        const cdkValidiumContractInitialize = await upgrades.deployProxy(CDKValidiumFactory, [], {
            initializer: false,
            constructorArgs: [
                PolygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                PolygonZkEVMBridgeContract.address,
                cdkDataCommitteeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        await expect(cdkValidiumContractInitialize.initialize(
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

        await expect(cdkValidiumContractInitialize.initialize(
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
            cdkValidiumContractInitialize.initialize(
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
        ).to.emit(cdkValidiumContractInitialize, 'UpdateZkEVMVersion').withArgs(0, forkID, version);
    });

    it('should check setters of admin', async () => {
        expect(await cdkValidiumContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await cdkValidiumContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await cdkValidiumContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await cdkValidiumContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);
        expect(await cdkValidiumContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await cdkValidiumContract.admin()).to.be.equal(admin.address);

        // setTrustedSequencer
        await expect(cdkValidiumContract.setTrustedSequencer(deployer.address))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            cdkValidiumContract.connect(admin).setTrustedSequencer(deployer.address),
        ).to.emit(cdkValidiumContract, 'SetTrustedSequencer').withArgs(deployer.address);
        expect(await cdkValidiumContract.trustedSequencer()).to.be.equal(deployer.address);

        // setTrustedSequencerURL
        const url = 'https://test';
        await expect(cdkValidiumContract.setTrustedSequencerURL(url))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            cdkValidiumContract.connect(admin).setTrustedSequencerURL(url),
        ).to.emit(cdkValidiumContract, 'SetTrustedSequencerURL').withArgs(url);
        expect(await cdkValidiumContract.trustedSequencerURL()).to.be.equal(url);

        // setTrustedAggregator
        const newTrustedAggregator = deployer.address;
        await expect(cdkValidiumContract.setTrustedAggregator(newTrustedAggregator))
            .to.be.revertedWith('OnlyAdmin');
        await expect(
            cdkValidiumContract.connect(admin).setTrustedAggregator(newTrustedAggregator),
        ).to.emit(cdkValidiumContract, 'SetTrustedAggregator').withArgs(newTrustedAggregator);
        expect(await cdkValidiumContract.trustedAggregator()).to.be.equal(newTrustedAggregator);

        // setTrustedAggregatorTimeout
        await expect(cdkValidiumContract.setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('OnlyAdmin');

        await expect(cdkValidiumContract.connect(admin).setTrustedAggregatorTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('TrustedAggregatorTimeoutExceedHaltAggregationTimeout');

        await expect(cdkValidiumContract.connect(admin).setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('NewTrustedAggregatorTimeoutMustBeLower');

        const newTrustedAggregatorTimeout = trustedAggregatorTimeoutDefault - 1;
        await expect(
            cdkValidiumContract.connect(admin).setTrustedAggregatorTimeout(newTrustedAggregatorTimeout),
        ).to.emit(cdkValidiumContract, 'SetTrustedAggregatorTimeout').withArgs(newTrustedAggregatorTimeout);
        expect(await cdkValidiumContract.trustedAggregatorTimeout()).to.be.equal(newTrustedAggregatorTimeout);

        // setPendingStateTimeoutDefault
        await expect(cdkValidiumContract.setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('OnlyAdmin');

        await expect(cdkValidiumContract.connect(admin).setPendingStateTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('PendingStateTimeoutExceedHaltAggregationTimeout');

        await expect(cdkValidiumContract.connect(admin).setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('NewPendingStateTimeoutMustBeLower');

        const newPendingStateTimeoutDefault = pendingStateTimeoutDefault - 1;
        await expect(
            cdkValidiumContract.connect(admin).setPendingStateTimeout(newPendingStateTimeoutDefault),
        ).to.emit(cdkValidiumContract, 'SetPendingStateTimeout').withArgs(newPendingStateTimeoutDefault);
        expect(await cdkValidiumContract.pendingStateTimeout()).to.be.equal(newPendingStateTimeoutDefault);

        // setMultiplierBatchFee
        const newMultiplierBatchFee = 1023;
        await expect(cdkValidiumContract.connect(admin).setMultiplierBatchFee(newMultiplierBatchFee + 1))
            .to.be.revertedWith('InvalidRangeMultiplierBatchFee');

        await expect(
            cdkValidiumContract.connect(admin).setMultiplierBatchFee(newMultiplierBatchFee),
        ).to.emit(cdkValidiumContract, 'SetMultiplierBatchFee').withArgs(newMultiplierBatchFee);
        expect(await cdkValidiumContract.multiplierBatchFee()).to.be.equal(newMultiplierBatchFee);

        // setVerifyBatchTimeTarget
        const newVerifyBatchTimeTarget = 100;

        await expect(cdkValidiumContract.connect(admin).setVerifyBatchTimeTarget(60 * 60 * 24 + 1)) // more than 1 day
            .to.be.revertedWith('InvalidRangeBatchTimeTarget');

        await expect(
            cdkValidiumContract.connect(admin).setVerifyBatchTimeTarget(newVerifyBatchTimeTarget),
        ).to.emit(cdkValidiumContract, 'SetVerifyBatchTimeTarget').withArgs(newVerifyBatchTimeTarget);
        expect(await cdkValidiumContract.verifyBatchTimeTarget()).to.be.equal(newVerifyBatchTimeTarget);

        // setPendingStateTimeoutDefault
        const newForceBatchTimeout = 0;
        await expect(cdkValidiumContract.setForceBatchTimeout(newForceBatchTimeout))
            .to.be.revertedWith('OnlyAdmin');

        await expect(cdkValidiumContract.connect(admin).setForceBatchTimeout(HALT_AGGREGATION_TIMEOUT + 1))
            .to.be.revertedWith('InvalidRangeForceBatchTimeout');

        await expect(cdkValidiumContract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT))
            .to.be.revertedWith('InvalidRangeForceBatchTimeout');
        await expect(
            cdkValidiumContract.connect(admin).setForceBatchTimeout(newForceBatchTimeout),
        ).to.emit(cdkValidiumContract, 'SetForceBatchTimeout').withArgs(newForceBatchTimeout);
        expect(await cdkValidiumContract.forceBatchTimeout()).to.be.equal(newForceBatchTimeout);

        // Activate force batches
        await expect(cdkValidiumContract.activateForceBatches())
            .to.be.revertedWith('OnlyAdmin');

        // Check force batches are unactive
        await expect(cdkValidiumContract.forceBatch('0x', 0))
            .to.be.revertedWith('ForceBatchNotAllowed');
        await expect(cdkValidiumContract.sequenceForceBatches([]))
            .to.be.revertedWith('ForceBatchNotAllowed');

        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');
        await expect(cdkValidiumContract.connect(admin).activateForceBatches())
            .to.be.revertedWith('ForceBatchesAlreadyActive');

        expect(await cdkValidiumContract.isForcedBatchDisallowed()).to.be.equal(false);

        // Transfer admin role

        // First set pending Admin
        expect(await cdkValidiumContract.pendingAdmin()).to.be.equal(ethers.constants.AddressZero);
        await expect(cdkValidiumContract.transferAdminRole(deployer.address))
            .to.be.revertedWith('OnlyAdmin');

        await expect(
            cdkValidiumContract.connect(admin).transferAdminRole(deployer.address),
        ).to.emit(cdkValidiumContract, 'TransferAdminRole').withArgs(deployer.address);
        expect(await cdkValidiumContract.pendingAdmin()).to.be.equal(deployer.address);

        // Accept transfer admin
        expect(await cdkValidiumContract.admin()).to.be.equal(admin.address);
        await expect(cdkValidiumContract.connect(admin).acceptAdminRole())
            .to.be.revertedWith('OnlyPendingAdmin');

        await expect(
            cdkValidiumContract.connect(deployer).acceptAdminRole(),
        ).to.emit(cdkValidiumContract, 'AcceptAdminRole').withArgs(deployer.address);
        expect(await cdkValidiumContract.admin()).to.be.equal(deployer.address);
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
            expect(await cdkValidiumContract.checkStateRootInsidePrime(validRoots[i])).to.be.equal(true);
        }

        for (let i = 0; i < aliasInvalidRoots.length; i++) {
            expect(await cdkValidiumContract.checkStateRootInsidePrime(aliasInvalidRoots[i])).to.be.equal(false);
        }
    });

    it('should sequence a batch as trusted sequencer', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await cdkValidiumContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because sender is not truested sequencer
        await expect(cdkValidiumContract.sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('OnlyTrustedSequencer');

        // revert because tokens were not approved
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();

        // Test sequence batches errors
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([], trustedSequencer.address, []))
            .to.be.revertedWith('SequenceZeroBatches');

        sequence.globalExitRoot = ethers.constants.MaxUint256;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('GlobalExitRootNotExist');
        sequence.globalExitRoot = ethers.constants.HashZero;

        // Sequence batch
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], deployer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await cdkValidiumContract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            (await cdkValidiumContract.sequencedBatches(0)).accInputHash,
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
        const maticAmount = (await cdkValidiumContract.batchFee()).mul(2);

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
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();

        // Sequence batches
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await cdkValidiumContract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        const sequencedBatchData2 = await cdkValidiumContract.sequencedBatches(2);
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
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // deploy sender SC
        const sendDataFactory = await ethers.getContractFactory('SendData');
        const sendDataContract = await sendDataFactory.deploy();
        await sendDataContract.deployed();

        // transfer matic
        await maticTokenContract.transfer(sendDataContract.address, ethers.utils.parseEther('1000'));

        // Approve matic
        const approveTx = await maticTokenContract.populateTransaction.approve(cdkValidiumContract.address, maticAmount);
        await sendDataContract.sendData(approveTx.to, approveTx.data);

        // Activate forced batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        // Force batch
        const lastForcedBatch = (await cdkValidiumContract.lastForceBatch()) + 1;

        const forceBatchTx = await cdkValidiumContract.populateTransaction.forceBatch(l2txDataForceBatch, maticAmount);
        await expect(sendDataContract.sendData(forceBatchTx.to, forceBatchTx.data))
            .to.emit(cdkValidiumContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, sendDataContract.address, l2txDataForceBatch);
    });

    it('sequenceBatches should sequence multiple batches and force batches', async () => {
        const l2txDataForceBatch = '0x123456';
        const transactionsHashForceBatch = calculateBatchHashData(l2txDataForceBatch);
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await cdkValidiumContract.lastForceBatch()) + 1;

        // Activate forced batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        // Force batch
        await expect(cdkValidiumContract.forceBatch(l2txDataForceBatch, maticAmount))
            .to.emit(cdkValidiumContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        // sequence 2 batches
        const l2txData = '0x1234';
        const transactionsHash2 = calculateBatchHashData(l2txData);
        const maticAmountSequence = (await cdkValidiumContract.batchFee()).mul(1);

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
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmountSequence),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();

        // Assert that the timestamp requirements must accomplish with force batches too
        sequence.minForcedTimestamp += 1;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        sequence.minForcedTimestamp -= 1;

        sequence.timestamp -= 1;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampBelowForcedTimestamp');
        sequence.timestamp += 1;

        sequence.timestamp = currentTimestamp + 10;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');
        sequence.timestamp = currentTimestamp;

        sequence2.timestamp -= 1;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');
        sequence2.timestamp += 1;

        // Sequence Bathces
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(Number(lastBatchSequenced) + 2);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmountSequence)),
        );

        // Check batch mapping
        const batchAccInputHash = (await cdkValidiumContract.sequencedBatches(1)).accInputHash;
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
        const batchData2 = await cdkValidiumContract.sequencedBatches(2);
        expect(batchData2.accInputHash).to.be.equal(batchAccInputHashJs);
        expect(batchData2.sequencedTimestamp).to.be.equal(sequencedTimestamp);
        expect(batchData2.previousLastBatchSequenced).to.be.equal(0);
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = (await cdkValidiumContract.batchFee()).mul(2);

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
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();

        let currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]); // evm_setNextBlockTimestamp

        sequence.timestamp = currentTimestamp + 2; // bigger than current block tiemstamp

        // revert because timestamp is more than the current one
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp;
        sequence2.timestamp = currentTimestamp - 1;

        // revert because the second sequence has less timestamp than the previous batch
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.be.revertedWith('SequencedTimestampInvalid');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp + 1; // edge case, same timestamp as the block
        sequence2.timestamp = currentTimestamp + 1;

        // Sequence Batches
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
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
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await cdkValidiumContract.getForcedBatchFee()).toString());

        // Activate force batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('NotEnoughMaticAmount');

        // revert because tokens were not approved
        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        await expect(
            maticTokenContract.approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForceBatch = await cdkValidiumContract.lastForceBatch();

        // Force batch
        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount))
            .to.emit(cdkValidiumContract, 'ForceBatch')
            .withArgs(lastForceBatch + 1, lastGlobalExitRoot, deployer.address, '0x');

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check force batches struct
        const batchHash = await cdkValidiumContract.forcedBatches(1);
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
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        const lastForcedBatch = (await cdkValidiumContract.lastForceBatch()) + 1;

        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount))
            .to.emit(cdkValidiumContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const forceBatchHash = await cdkValidiumContract.forcedBatches(1);

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
        expect(await cdkValidiumContract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await cdkValidiumContract.lastForceBatch()).to.be.equal(1);
        expect(await cdkValidiumContract.lastBatchSequenced()).to.be.equal(0);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // revert because the timeout is not expired
        await expect(cdkValidiumContract.sequenceForceBatches([]))
            .to.be.revertedWith('SequenceZeroBatches');

        // revert because does not exist that many forced Batches
        await expect(cdkValidiumContract.sequenceForceBatches(Array(2).fill(forceBatchStruct)))
            .to.be.revertedWith('ForceBatchesOverflow');

        // revert because the timeout is not expired
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStruct]))
            .to.be.revertedWith('ForceBatchTimeoutNotExpired');

        const forceBatchStructBad = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        forceBatchStructBad.minForcedTimestamp += 1;
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.minForcedTimestamp -= 1;

        forceBatchStructBad.globalExitRoot = ethers.constants.HashZero;
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.globalExitRoot = lastGlobalExitRoot;

        forceBatchStructBad.transactions = '0x1111';
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStructBad]))
            .to.be.revertedWith('ForcedDataDoesNotMatch');
        forceBatchStructBad.transactions = l2txData;

        // Increment timestamp
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        // sequence force batch
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(cdkValidiumContract, 'SequenceForceBatches')
            .withArgs(1);

        const timestampSequenceBatch = (await ethers.provider.getBlock()).timestamp;

        expect(await cdkValidiumContract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await cdkValidiumContract.lastForceBatch()).to.be.equal(1);
        expect(await cdkValidiumContract.lastBatchSequenced()).to.be.equal(1);

        // Check force batches struct
        const batchAccInputHash = (await cdkValidiumContract.sequencedBatches(1)).accInputHash;

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
        const maticAmount = await cdkValidiumContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();
        // Sequence Batches
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await cdkValidiumContract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        await expect(
            cdkValidiumContract.connect(deployer).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OnlyTrustedAggregator');

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchBelowLastVerifiedBatch');

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
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
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatchesTrustedAggregator')
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
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        const lastForcedBatch = (await cdkValidiumContract.lastForceBatch()) + 1;
        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount))
            .to.emit(cdkValidiumContract, 'ForceBatch')
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
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(cdkValidiumContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await cdkValidiumContract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        // Verify batch
        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatch')
            .withArgs(numBatch, trustedAggregator.address)
            .to.emit(maticTokenContract, 'Transfer')
            .withArgs(cdkValidiumContract.address, trustedAggregator.address, maticAmount);

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
        const maticAmount = await cdkValidiumContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();

        // Sequence
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sentBatchHash = (await cdkValidiumContract.sequencedBatches(lastBatchSequenced + 1)).accInputHash;
        const oldAccInputHash = (await cdkValidiumContract.sequencedBatches(0)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            sequence.transactionsHash,
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(sentBatchHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await cdkValidiumContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await cdkValidiumContract.lastVerifiedBatch()) + 1;

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
        const circuitInpuSnarkSC = await cdkValidiumContract.getNextSnarkInput(
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
        const maticAmount = await cdkValidiumContract.getForcedBatchFee();
        const lastGlobalExitRoot = await PolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Activate force batches
        await expect(
            cdkValidiumContract.connect(admin).activateForceBatches(),
        ).to.emit(cdkValidiumContract, 'ActivateForceBatches');

        const lastForcedBatch = (await cdkValidiumContract.lastForceBatch()).toNumber() + 1;
        await expect(cdkValidiumContract.forceBatch(l2txData, maticAmount))
            .to.emit(cdkValidiumContract, 'ForceBatch')
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
        await expect(cdkValidiumContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(cdkValidiumContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        const sequencedTimestmap = (await ethers.provider.getBlock()).timestamp;
        const oldAccInputHash = (await cdkValidiumContract.sequencedBatches(0)).accInputHash;
        const batchAccInputHash = (await cdkValidiumContract.sequencedBatches(1)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            sequencedTimestmap,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await cdkValidiumContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await cdkValidiumContract.lastVerifiedBatch()) + 1;

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
        const circuitInpuSnarkSC = await cdkValidiumContract.getNextSnarkInput(
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
        const maticAmount = await cdkValidiumContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await cdkValidiumContract.lastBatchSequenced();
        // Sequence Batches
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // aggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const numBatch = (await cdkValidiumContract.lastVerifiedBatch()) + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.constants.HashZero);

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            aggregator1.address,
        );

        const sequencedBatchData = await cdkValidiumContract.sequencedBatches(1);
        const { sequencedTimestamp } = sequencedBatchData;
        const currentBatchFee = await cdkValidiumContract.batchFee();

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
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
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('TrustedAggregatorTimeoutNotExpired');

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('NewAccInputHashDoesNotExist');

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
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
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
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
        expect(lastPendingstate).to.be.equal(await cdkValidiumContract.lastPendingState());

        const pendingStateData = await cdkValidiumContract.pendingStateTransitions(lastPendingstate);
        expect(verifyTimestamp).to.be.equal(pendingStateData.timestamp);
        expect(numBatch).to.be.equal(pendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(pendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(pendingStateData.stateRoot);

        // Try consolidate state
        expect(0).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());

        // Pending state can't be 0
        await expect(
            cdkValidiumContract.consolidatePendingState(0),
        ).to.be.revertedWith('PendingStateInvalid');

        // Pending state does not exist
        await expect(
            cdkValidiumContract.consolidatePendingState(2),
        ).to.be.revertedWith('PendingStateInvalid');

        // Not ready to be consolidated
        await expect(
            cdkValidiumContract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PendingStateNotConsolidable');

        await ethers.provider.send('evm_setNextBlockTimestamp', [verifyTimestamp + pendingStateTimeoutDefault - 1]);

        await expect(
            cdkValidiumContract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PendingStateNotConsolidable');

        await expect(
            cdkValidiumContract.consolidatePendingState(lastPendingstate),
        ).to.emit(cdkValidiumContract, 'ConsolidatePendingState')
            .withArgs(numBatch, newStateRoot, lastPendingstate);

        // Pending state already consolidated
        await expect(
            cdkValidiumContract.consolidatePendingState(1),
        ).to.be.revertedWith('PendingStateInvalid');

        // Fee es divided because is was fast verified
        const multiplierFee = await cdkValidiumContract.multiplierBatchFee();
        expect((currentBatchFee.mul(1000)).div(multiplierFee)).to.be.equal(await cdkValidiumContract.batchFee());

        // Check pending state variables
        expect(1).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(1));
        expect(1).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());
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
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
                .to.emit(cdkValidiumContract, 'SequenceBatches');
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
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        let verifyTimestamp = (await ethers.provider.getBlock()).timestamp;

        // Check pending state
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());

        let currentPendingStateData = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Try to verify Batches that does not go beyond the last pending state
        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchBelowLastVerifiedBatch');

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                10,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
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
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newBatch, newStateRoot, trustedAggregator.address);

        // Check pending state is clear
        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(0).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        // Check consolidated state
        let currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentVerifiedBatch));

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                1,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        // Since this pending state was not consolidated, the currentNumBatch does not have stored root
        expect(ethers.constants.HashZero).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentNumBatch));
        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
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
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // Check pending state
        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());

        currentPendingStateData = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Verify another sequence from batch 0
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                1,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                0,
                0,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // Check pending state
        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());

        currentPendingStateData = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Verify batches using old pending state
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        // Must specify pending state num while is not consolidated
        await expect(
            cdkValidiumContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                currentNumBatch - 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState - 1,
                currentNumBatch - 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());

        currentPendingStateData = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Consolidate using verifyBatches
        const firstPendingState = await cdkValidiumContract.pendingStateTransitions(1);
        await ethers.provider.send('evm_setNextBlockTimestamp', [firstPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        let currentPendingConsolidated = 0;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;

        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address)
            .to.emit(cdkValidiumContract, 'ConsolidatePendingState')
            .withArgs(firstPendingState.lastVerifiedBatch, newStateRoot, ++currentPendingConsolidated);

        verifyTimestamp = (await ethers.provider.getBlock()).timestamp;
        currentPendingState++;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        currentPendingStateData = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        expect(verifyTimestamp).to.be.equal(currentPendingStateData.timestamp);
        expect(newBatch).to.be.equal(currentPendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(currentPendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(currentPendingStateData.stateRoot);

        // Check state consolidated
        currentVerifiedBatch += batchesForSequence;
        expect(currentVerifiedBatch).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentVerifiedBatch));

        // Consolidate using sendBatches
        const secondPendingState = await cdkValidiumContract.pendingStateTransitions(2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [secondPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .to.emit(cdkValidiumContract, 'ConsolidatePendingState')
            .withArgs(secondPendingState.lastVerifiedBatch, newStateRoot, ++currentPendingConsolidated);

        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        // Check state consolidated
        currentVerifiedBatch += batchesForSequence;
        expect(currentVerifiedBatch).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentVerifiedBatch));

        // Put a lot of pending states and check that half of them are consoldiated
        for (let i = 0; i < 8; i++) {
            currentNumBatch = newBatch;
            newBatch += batchesForSequence;
            await expect(
                cdkValidiumContract.connect(aggregator1).verifyBatches(
                    currentPendingState,
                    currentNumBatch,
                    newBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    zkProofFFlonk,
                ),
            ).to.emit(cdkValidiumContract, 'VerifyBatches')
                .withArgs(newBatch, newStateRoot, aggregator1.address);

            currentPendingState++;
        }

        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());

        currentPendingConsolidated = await cdkValidiumContract.lastPendingStateConsolidated();
        const lastPendingState = await cdkValidiumContract.pendingStateTransitions(currentPendingState);
        await ethers.provider.send('evm_setNextBlockTimestamp', [lastPendingState.timestamp.toNumber() + pendingStateTimeoutDefault]);

        // call verify batches and check that half of them are consolidated
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(currentPendingConsolidated).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        const nextPendingConsolidated = Number(currentPendingConsolidated) + 1;
        const nextConsolidatedStateNum = nextPendingConsolidated + Number(Math.floor((currentPendingState - nextPendingConsolidated) / 2));
        const nextConsolidatedState = await cdkValidiumContract.pendingStateTransitions(nextConsolidatedStateNum);

        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .to.emit(cdkValidiumContract, 'ConsolidatePendingState')
            .withArgs(nextConsolidatedState.lastVerifiedBatch, newStateRoot, nextConsolidatedStateNum);

        // Put pendingState to 0 and check that the pending state is clear after verifyBatches
        await expect(
            cdkValidiumContract.connect(admin).setPendingStateTimeout(0),
        ).to.emit(cdkValidiumContract, 'SetPendingStateTimeout').withArgs(0);

        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(0).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        // Check consolidated state
        currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentVerifiedBatch));
    });

    it('Activate emergency state due halt timeout', async () => {
        const l2txData = '0x123456';
        const transactionsHash = calculateBatchHashData(l2txData);
        const maticAmount = await cdkValidiumContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactionsHash,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // Sequence batch
        const lastBatchSequenced = 1;
        await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address, []))
            .to.emit(cdkValidiumContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced);

        const sequencedTimestmap = Number((await cdkValidiumContract.sequencedBatches(1)).sequencedTimestamp);
        const haltTimeout = HALT_AGGREGATION_TIMEOUT;

        // Try to activate the emergency state

        // Check batch is not sequenced
        await expect(cdkValidiumContract.connect(aggregator1).activateEmergencyState(2))
            .to.be.revertedWith('BatchNotSequencedOrNotSequenceEnd');

        // Check batch is already verified
        await cdkValidiumContract.setVerifiedBatch(1);
        await expect(cdkValidiumContract.connect(aggregator1).activateEmergencyState(1))
            .to.be.revertedWith('BatchAlreadyVerified');
        await cdkValidiumContract.setVerifiedBatch(0);

        // check timeout is not expired
        await expect(cdkValidiumContract.connect(aggregator1).activateEmergencyState(1))
            .to.be.revertedWith('HaltTimeoutNotExpired');

        await ethers.provider.send('evm_setNextBlockTimestamp', [sequencedTimestmap + haltTimeout]);

        // Succesfully acitvate emergency state
        await expect(cdkValidiumContract.connect(aggregator1).activateEmergencyState(1))
            .to.emit(cdkValidiumContract, 'EmergencyStateActivated');
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
            maticTokenContract.connect(trustedSequencer).approve(cdkValidiumContract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(cdkValidiumContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address, []))
                .to.emit(cdkValidiumContract, 'SequenceBatches');
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
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            cdkValidiumContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const finalPendingState = 2;

        await expect(
            cdkValidiumContract.connect(aggregator1).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
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
            cdkValidiumContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.emit(cdkValidiumContract, 'OverridePendingState').withArgs(newBatch, newStateRoot2, trustedAggregator.address);

        // check pending state is clear
        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await cdkValidiumContract.lastPendingState());
        expect(0).to.be.equal(await cdkValidiumContract.lastPendingStateConsolidated());

        // check consolidated state
        const currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await cdkValidiumContract.lastVerifiedBatch());
        expect(newStateRoot2).to.be.equal(await cdkValidiumContract.batchNumToStateRoot(currentVerifiedBatch));
    });

    it('Test batch fees properly', async () => {
        const accInputData = ethers.constants.HashZero;
        const verifyBatchTimeTarget = Number(await cdkValidiumContract.verifyBatchTimeTarget());
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const multiplierFee = ethers.BigNumber.from(await cdkValidiumContract.multiplierBatchFee()); // 1002
        const bingNumber1000 = ethers.BigNumber.from(1000);

        // Create sequenced to update the fee
        await cdkValidiumContract.setSequencedBatches(
            50,
            accInputData,
            currentTimestamp + verifyBatchTimeTarget,
            0,
        ); // Edge case, will be below

        await cdkValidiumContract.setSequencedBatches(
            100,
            accInputData,
            currentTimestamp + verifyBatchTimeTarget + 1,
            50,
        ); // Edge case, will be above

        // Assert currentFee
        let currentBatchFee = await cdkValidiumContract.batchFee();
        expect(currentBatchFee).to.be.equal(ethers.utils.parseEther('0.1'));

        await ethers.provider.send('evm_setNextBlockTimestamp', [currentTimestamp + verifyBatchTimeTarget * 2]);

        await cdkValidiumContract.updateBatchFee(100);

        // Fee does not change since there are the same batches above than below
        expect(await cdkValidiumContract.batchFee()).to.be.equal(currentBatchFee);

        /*
         * Now all the batches will be above
         * since the MAX_BATCH_MULTIPLIER is 12 this will be the pow
         */
        await cdkValidiumContract.updateBatchFee(100);

        currentBatchFee = currentBatchFee.mul(multiplierFee.pow(MAX_BATCH_MULTIPLIER)).div(bingNumber1000.pow(MAX_BATCH_MULTIPLIER));
        expect(currentBatchFee).to.be.equal(await cdkValidiumContract.batchFee());

        // Check the fee is now below
        await cdkValidiumContract.setSequencedBatches(50, accInputData, currentTimestamp + verifyBatchTimeTarget * 2, 0); // Below
        currentBatchFee = currentBatchFee.mul(bingNumber1000.pow(MAX_BATCH_MULTIPLIER)).div(multiplierFee.pow(MAX_BATCH_MULTIPLIER));
    });
});
