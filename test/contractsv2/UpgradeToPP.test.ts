/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    ERC20PermitMock,
    VerifierRollupHelperMock,
    AgglayerBridge,
    AgglayerGER,
    AgglayerManagerMock,
    PolygonValidiumEtrog,
    AggchainECDSAMultisig,
} from '../../typechain-types';
import { encodeInitializeBytesLegacy } from '../../src/utils-common-aggchain';
import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';
import { AL_MULTISIG_ROLE } from '../../src/constants';

describe('Upgradeable to PPV2 or ALGateway', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let aggLayerAdmin: any;

    let polTokenContract: ERC20PermitMock;
    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;
    let aggchainECDSAContract: AggchainECDSAMultisig;

    const networkIDMainnet = 0;

    let firstDeployment = true;
    const newCreatedRollupID = 1;
    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const rollupTypeIDAlGateway = 1;

    const PESSIMISTIC_SELECTOR = '0x00000001';
    // calculate aggchainHash
    const newStateRoot = ethers.id('newStateRoot');
    const aggchainVKeySelector = '0x12340001';
    const CUSTOM_DATA_ECDSA = '0x';

    beforeEach('Deploy contracts & add type pp', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil, aggLayerAdmin] =
            await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock');
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance,
        );

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();

        if ((await upgrades.admin.getInstance()).target !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }

        // deploy AgglayerGateway
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const aggLayerGatewayContract = await upgrades.deployProxy(AgglayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });

        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyBridge,
        });
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGER');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // deploy AgglayerManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call', 'state-variable-immutable'],
        })) as unknown as AgglayerManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await expect(
            polygonZkEVMBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRoot.target,
                rollupManagerContract.target,
                '0x',
            ),
        )
            .to.emit(polygonZkEVMBridgeContract, 'AcceptProxiedTokensManagerRole')
            .withArgs(ethers.ZeroAddress, deployer.address);

        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            admin.address,
            timelock.address,
            emergencyCouncil.address,
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        // Create ALGateway rollup type
        // Initialize aggLayerGateway
        await aggLayerGatewayContract.initialize(
            admin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            PESSIMISTIC_SELECTOR,
            verifierContract.target,
            programVKey,
            admin.address, // multisigRole
            [], // signersToAdd
            0, // newThreshold
        );

        // Grant AL_MULTISIG_ROLE to initialize signers
        await aggLayerGatewayContract.connect(admin).grantRole(AL_MULTISIG_ROLE, admin.address);

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggLayerGatewayContract.connect(admin).updateSignersAndThreshold([], [], 0);

        // create aggchainFEP implementation
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainECDSAContract = await aggchainECDSAFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );

        await aggchainECDSAContract.waitForDeployment();

        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                1,
                aggchainECDSAContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );

        const aggchainVKey = computeRandomBytes(32);

        // Compose selector for generated aggchain verification key
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(aggchainVKeySelector, aggchainVKey);
    });

    it('should create rollup type validium & migrate to ALGateway', async () => {
        // Create etrog state transition chain
        const urlSequencer = 'http://zkevm-json-rpc:8123';
        const chainID = 1000;
        const networkName = 'zkevm';
        const forkID = 0;
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const rollupVerifierType = 0;
        const description = 'zkevm test';
        const programVKey = '0x0000000000000000000000000000000000000000000000000000000000000000';

        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;

        // deploy validium consensus
        const validiumEtrogFactory = await ethers.getContractFactory('PolygonValidiumEtrog');
        const validiumEtrogContract = await validiumEtrogFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await validiumEtrogContract.waitForDeployment();

        // Create new rollup type validium
        const newRollupTypeID = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    validiumEtrogContract.target,
                    verifierContract.target,
                    forkID,
                    rollupVerifierType,
                    genesisRandom,
                    description,
                    programVKey,
                ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                validiumEtrogContract.target,
                verifierContract.target,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // Create rollup
        const newSequencedBatch = 1;
        const initializeBytesLegacy = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const validiumContract = validiumEtrogFactory.attach(rollupAddress) as PolygonValidiumEtrog;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesLegacy),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, rollupAddress, chainID, gasTokenAddress)
            .to.emit(validiumContract, 'InitialSequenceBatches')
            .to.emit(rollupManagerContract, 'OnSequenceBatches')
            .withArgs(newCreatedRollupID, newSequencedBatch);

        // Set data availability protocol
        // Create PolygonDataCommittee
        const PolygonDataCommitteeFactory = await ethers.getContractFactory('PolygonDataCommittee');
        const PolygonDataCommittee = (await upgrades.deployProxy(PolygonDataCommitteeFactory, [], {
            unsafeAllow: ['constructor'],
        })) as any as PolygonDataCommittee;
        await expect(validiumContract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommittee.target))
            .to.emit(validiumContract, 'SetDataAvailabilityProtocol')
            .withArgs(PolygonDataCommittee.target);

        // Sequence a batch
        const currentTime = Number((await ethers.provider.getBlock('latest'))?.timestamp);
        const l1InfoTreeLeafCount = 0;

        const l2txData = '0x123456';
        const hashedData = ethers.keccak256(l2txData) as any;
        const sequenceValidium = {
            transactionsHash: hashedData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as PolygonValidiumEtrog.ValidiumBatchDataStruct;

        const expectedAccInputHash = calculateAccInputHashEtrog(
            await validiumContract.lastAccInputHash(),
            hashedData,
            await polygonZkEVMGlobalExitRoot.getRoot(),
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash,
        );
        let message = '0x';
        const walletsDataCommittee = [] as any;
        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
                `m/44'/60'/0'/0/${i}`,
            );
            walletsDataCommittee.push(newWallet);
        }
        // sort wallets
        walletsDataCommittee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            }
            return -1;
        });
        const signedData = expectedAccInputHash;
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            const newSignature = walletsDataCommittee[i].signingKey.sign(signedData);
            message += newSignature.serialized.slice(2);
        }
        let addrBytes = '0x';
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            addrBytes += walletsDataCommittee[i].address.slice(2);
        }
        const dataAvailabilityMessage = message + addrBytes.slice(2);

        const requiredAmountOfSignatures = 3;
        const urls = ['onurl', 'twourl', 'threeurl'];
        const committeeHash = ethers.keccak256(addrBytes);
        await expect(PolygonDataCommittee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommittee, 'CommitteeUpdated')
            .withArgs(committeeHash);

        // Approve tokens
        const maticAmount = await rollupManagerContract.getBatchFee();
        await expect(polTokenContract.connect(trustedSequencer).approve(validiumContract.target, maticAmount)).to.emit(
            polTokenContract,
            'Approval',
        );
        await expect(
            validiumContract
                .connect(trustedSequencer)
                .sequenceBatchesValidium(
                    [sequenceValidium],
                    l1InfoTreeLeafCount,
                    currentTime,
                    expectedAccInputHash,
                    trustedSequencer.address,
                    dataAvailabilityMessage,
                ),
        ).to.emit(validiumContract, 'SequenceBatches');

        // Call initMigration

        // Verify pending sequenced batches
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const currentVerifiedBatch = 0;
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        await rollupManagerContract
            .connect(trustedAggregator)
            .verifyBatchesTrustedAggregator(
                newCreatedRollupID,
                pendingState,
                currentVerifiedBatch,
                newVerifiedBatch,
                newLocalExitRoot,
                newStateRoot,
                trustedAggregator.address,
                zkProofFFlonk,
            );

        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(newCreatedRollupID);
        const lastBatchSequenced = rollupData[5];
        const lastBatchVerified = rollupData[6];
        expect(lastBatchSequenced).to.be.equal(lastBatchVerified);

        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const upgradeData = aggchainECDSAFactory.interface.encodeFunctionData('migrateFromLegacyConsensus()');

        await expect(
            rollupManagerContract
                .connect(timelock)
                .initMigration(newCreatedRollupID, rollupTypeIDAlGateway, upgradeData),
        )
            .to.emit(rollupManagerContract, 'InitMigration')
            .withArgs(newCreatedRollupID, rollupTypeIDAlGateway)
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(newCreatedRollupID, rollupTypeIDAlGateway, newVerifiedBatch);

        expect(await rollupManagerContract.isRollupMigrating(newCreatedRollupID)).to.be.equal(true);

        const l1InfoRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(l1InfoTreeLeafCount);

        // Verify PP with mock "bootstrapBatch"
        
        const newWrongLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const lastLER = rollupData[4];
        const newPPRoot = computeRandomBytes(32);
        const proofPP = '0x00';
        const proofWithSelector = `${PESSIMISTIC_SELECTOR}${proofPP.slice(2)}`;

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyAggregatedProofTrusted(
                    [
                        {
                            rollupID: newCreatedRollupID,
                            newLocalExitRoot: newWrongLER,
                            newPessimisticRoot: newPPRoot,
                            aggchainData: CUSTOM_DATA_ECDSA,
                        },
                    ],
                    l1InfoTreeLeafCount,
                    ethers.ZeroHash,
                    proofWithSelector,
                ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidNewLocalExitRoot');

        // // Ensure signers hash initialized (empty)
        // await aggchainECDSARollupContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        const prevPP = ethers.ZeroHash;
        const prevLER = ethers.ZeroHash;
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyAggregatedProofTrusted(
                    [
                        {
                            rollupID: newCreatedRollupID,
                            newLocalExitRoot: lastLER,
                            newPessimisticRoot: newPPRoot,
                            aggchainData: CUSTOM_DATA_ECDSA,
                        },
                    ],
                    l1InfoTreeLeafCount,
                    ethers.ZeroHash,
                    proofWithSelector,
                ),
        )
            .to.emit(rollupManagerContract, 'CompletedMigration')
            .withArgs(newCreatedRollupID)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, 0, ethers.ZeroHash, lastLER, trustedAggregator.address)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                newCreatedRollupID,
                prevPP,
                newPPRoot,
                prevLER,
                lastLER,
                l1InfoRoot,
                trustedAggregator.address,
            );

        expect(await rollupManagerContract.isRollupMigrating(newCreatedRollupID)).to.be.equal(false);
    });

    /**
     * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, seqAddress)
     * @param {String} oldAccInputHash - old accumulateInputHash
     * @param {String} batchHashData - Batch hash data
     * @param {String} globalExitRoot - Global Exit Root
     * @param {Number} timestamp - Block timestamp
     * @param {String} sequencerAddress - Sequencer address
     * @returns {String} - accumulateInputHash in hex encoding
     */
    function calculateAccInputHashEtrog(
        oldAccInputHash: any,
        batchHashData: any,
        l1InfoTreeRoot: any,
        timestamp: any,
        sequencerAddress: any,
        forcedBlockHash: any,
    ) {
        const hashKeccak = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32', 'bytes32', 'uint64', 'address', 'bytes32'],
            [oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, sequencerAddress, forcedBlockHash],
        );

        return hashKeccak;
    }
});
