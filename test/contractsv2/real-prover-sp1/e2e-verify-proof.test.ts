/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    SP1VerifierPlonk,
    ERC20PermitMock,
    AgglayerManagerMock,
    AgglayerGERMock,
    AgglayerBridge,
    PolygonZkEVMEtrog,
    VerifierRollupHelperMock,
    AggchainECDSAMultisig,
} from '../../../typechain-types';

import { VerifierType, computeInputPessimisticBytes } from '../../../src/pessimistic-utils';
import inputProof from './test-inputs/input.json';
import inputZkevmMigration from './test-inputs/input-zkevm-migration.json';
import { encodeInitializeBytesLegacy, encodeInitAggchainManager } from '../../../src/utils-common-aggchain';
import {
    DEFAULT_ADMIN_ROLE,
    ADD_ROLLUP_TYPE_ROLE,
    OBSOLETE_ROLLUP_TYPE_ROLE,
    CREATE_ROLLUP_ROLE,
    ADD_EXISTING_ROLLUP_ROLE,
    UPDATE_ROLLUP_ROLE,
    TRUSTED_AGGREGATOR_ROLE,
    TRUSTED_AGGREGATOR_ROLE_ADMIN,
    TWEAK_PARAMETERS_ROLE,
    SET_FEE_ROLE,
    STOP_EMERGENCY_ROLE,
    EMERGENCY_COUNCIL_ROLE,
    EMERGENCY_COUNCIL_ADMIN,
} from '../../../src/constants';

// PP route selector under which inputProof.vkey is registered on the AgglayerGateway.
// Any unused 4-byte value works; pinned for stability across test runs.
const PP_ROUTE_SELECTOR = '0x5a093a2f';
// Separate PP route selector for the migration proof, which is generated against a different
// SP1 program (different vkey) than the regular ECDSA pessimistic proof.
// Any unused 4-byte value works; pinned for stability across test runs.
const MIGRATION_PP_ROUTE_SELECTOR = '0x5a093a30';

describe('Polygon Rollup Manager with AggchainECDSAMultisig (real SP1 verifier)', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;

    let verifierContract: SP1VerifierPlonk;
    let mockVerifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGERMock;
    let rollupManagerContract: AgglayerManagerMock;
    let aggLayerGatewayContract: any;

    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    // BRidge constants
    const networkIDMainnet = 0;

    let firstDeployment = true;

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, admin, timelock, emergencyCouncil] = await ethers.getSigners();
        trustedSequencer = inputProof.signer;
        // deploy SP1 verifier
        const SP1VerifierFactory = await ethers.getContractFactory('SP1VerifierPlonk');
        verifierContract = await SP1VerifierFactory.deploy();

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
        aggLayerGatewayContract = await upgrades.deployProxy(AgglayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });

        // Initialize AgglayerGateway with the v6 PP route used by the ECDSA pessimistic test.
        await aggLayerGatewayContract.initialize(
            admin.address, // defaultAdmin
            admin.address, // aggchainVKey role
            admin.address, // addPPRoute role
            admin.address, // freezePPRoute role
            PP_ROUTE_SELECTOR, // ppVKeySelector
            verifierContract.target, // verifier
            inputProof.vkey, // ppVKey
            admin.address, // multisigRole
            [], // signersToAdd (empty)
            0, // newThreshold
        );

        // Register a second PP route for the migration proof — it uses a different SP1
        // program (different vkey) than the regular ECDSA pessimistic proof, so it can't
        // share the route registered above.
        await aggLayerGatewayContract
            .connect(admin)
            .addPessimisticVKeyRoute(MIGRATION_PP_ROUTE_SELECTOR, verifierContract.target, inputZkevmMigration.vkey);

        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes,

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
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGERMock');
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AgglayerGERMock;

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridge;

        // deploy polygon rollup manager mock
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AgglayerManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract['initialize(uint32,address,uint32,address,address,bytes)'](
            networkIDMainnet,
            ethers.ZeroAddress, // Gas token address
            ethers.ZeroAddress, // Gas token network
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            '0x',
        );

        // Initialize Mock
        await expect(
            rollupManagerContract.initializeMock(
                trustedAggregator.address,
                admin.address,
                timelock.address,
                emergencyCouncil.address,
            ),
        ).to.emit(rollupManagerContract, 'UpdateRollupManagerVersion');

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer, ethers.parseEther('1000'));
    });

    it('should check the initialized parameters', async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther('10'));
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.be.equal(0);

        // Check roles
        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelock.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true,
        );

        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true,
        );
    });

    it('should verify pessimistic proof: AggchainECDSAMultisig with a real verifier (not mock)', async () => {
        // The v6 input.json was generated against an AggchainECDSAMultisig with a single
        // signer = inputProof.signer and threshold = 1, empty aggchainData. We mirror that
        // setup and route the proof through the AgglayerGateway path (VerifierType.ALGateway).
        // The PP route is registered in beforeEach.

        // Deploy AggchainECDSAMultisig implementation and register it as a rollup type.
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAMultisigImpl = await aggchainECDSAMultisigFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
        await aggchainECDSAMultisigImpl.waitForDeployment();

        const rollupTypeID = 1;
        await rollupManagerContract.connect(timelock).addNewRollupType(
            aggchainECDSAMultisigImpl.target,
            ethers.ZeroAddress, // verifier - not used for ALGateway
            0, // forkID
            VerifierType.ALGateway,
            ethers.ZeroHash, // genesis
            'aggchain ecdsa multisig',
            ethers.ZeroHash, // programVKey
        );

        // Attach a new chain. attachAggchainToAL only sets the aggchainManager;
        // full initialization happens in the next step.
        const chainID = 1;
        const aggchainRollupID = inputProof['pp-inputs']['origin-network'];
        const initBytesInitAggchainManager = encodeInitAggchainManager(admin.address);
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        await rollupManagerContract
            .connect(admin)
            .attachAggchainToAL(rollupTypeID, chainID, initBytesInitAggchainManager);

        // Initialize as the aggchainManager: 1 signer = inputProof.signer, threshold = 1.
        const ecdsaMultisig = aggchainECDSAMultisigFactory.attach(rollupAddress) as AggchainECDSAMultisig;
        await ecdsaMultisig
            .connect(admin)
            ['initialize(address,address,address,string,string,bool,(address,string)[],uint256)'](
                admin.address,
                inputProof.signer,
                ethers.ZeroAddress,
                '',
                '',
                false, // useDefaultSigners
                [{ addr: inputProof.signer, url: 'NO_URL' }],
                1,
            );

        // Sanity: getAggchainHash for empty aggchainData must match the value the proof was
        // generated against. If this fails, the chain config doesn't match the prover's setup.
        const onChainAggchainHash = await ecdsaMultisig.getAggchainHash('0x');
        expect(onChainAggchainHash).to.be.equal(inputProof['pp-inputs']['aggchain-hash']);

        const l1InfoRoot = inputProof['pp-inputs']['l1-info-root'];
        const l1InfoTreeLeafCount = 1;
        const newLER = inputProof['pp-inputs']['new-local-exit-root'];
        const newPPRoot = inputProof['pp-inputs']['new-pessimistic-root'];
        // Prepend the PP route selector (registered in beforeEach) so the gateway routes to
        // the right vkey.
        const proofPP = PP_ROUTE_SELECTOR + inputProof.proof.slice(2);

        // Not trusted aggregator
        await expect(
            rollupManagerContract.verifyPessimisticTrustedAggregator(
                aggchainRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // Global exit root does not exist (GER not yet injected at this leaf count)
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                aggchainRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'L1InfoTreeLeafCountInvalid');

        // Check JS helper computeInputPessimisticBytes against on-chain getInputPessimisticBytes.
        // For ALGateway, the 5th packed field is the aggchainHash.
        const inputPessimisticBytes = await rollupManagerContract.getInputPessimisticBytes(
            aggchainRollupID,
            l1InfoRoot,
            newLER,
            newPPRoot,
            '0x', // aggchainData
        );
        const infoRollup = await rollupManagerContract.rollupIDToRollupDataV2(aggchainRollupID);
        const expectedInputPessimisticBytes = computeInputPessimisticBytes(
            infoRollup[4], // lastLocalExitRoot
            infoRollup[10], // lastPessimisticRoot
            l1InfoRoot,
            aggchainRollupID,
            onChainAggchainHash,
            newLER,
            newPPRoot,
        );
        expect(inputPessimisticBytes).to.be.equal(expectedInputPessimisticBytes);

        // Mock selected GER and verify pessimistic
        await polygonZkEVMGlobalExitRoot.injectGER(l1InfoRoot, l1InfoTreeLeafCount);

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                aggchainRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(aggchainRollupID, 0, ethers.ZeroHash, newLER, trustedAggregator.address);

        // Assert rollup data post-verify
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2(aggchainRollupID);
        const expectedRollupData = [
            rollupAddress,
            chainID,
            ethers.ZeroAddress, // verifier - not used for ALGateway
            0, // forkID
            newLER,
            0, // lastBatchSequenced
            0, // lastVerifiedBatch
            0, // _legacyLastPendingState
            rollupTypeID,
            VerifierType.ALGateway,
            newPPRoot,
            ethers.ZeroHash, // programVKey
        ];
        expect(expectedRollupData).to.be.deep.equal(resRollupData);
    });

    it('should create rollup type zkevm etrog & migrate to ECDSA Multisig no bridges sequenced', async () => {
        // deploy mock verifier for zkEVM rollups
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock');
        mockVerifierContract = await VerifierRollupHelperFactory.deploy();

        // Validate upgrade for ECDSA Multisig
        const PolygonZKEVMEtrogFactory = await ethers.getContractFactory('PolygonZkEVMEtrog');
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');

        // Create constants
        const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days

        // Create etrog state transition chain
        const urlSequencer = 'http://zkevm-json-rpc:8123';
        const chainID = 1000;
        const networkName = 'zkevm';
        const forkID = 0;
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const rollupVerifierType = VerifierType.StateTransition;
        const description = 'zkevm test';
        const programVKey = ethers.ZeroHash;

        const gasTokenAddress = ethers.ZeroAddress;

        // Create zkEVM implementation
        const PolygonZKEVMEtrogContract = await PolygonZKEVMEtrogFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonZKEVMEtrogContract.waitForDeployment();

        // Create ECDSA Multisig rollup type for migration target
        const aggchainECDSAMultisigContract = await aggchainECDSAMultisigFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );

        const rollupTypeIDECDSAMultisig = 1;
        await rollupManagerContract.connect(timelock).addNewRollupType(
            aggchainECDSAMultisigContract.target,
            ethers.ZeroAddress, // verifier - not used for ECDSA
            0, // forkID
            VerifierType.ALGateway,
            ethers.ZeroHash, // genesis
            description,
            ethers.ZeroHash, // programVKey
        );

        // Create new rollup type zkevm etrog
        const newRollupTypeID = 2;
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                PolygonZKEVMEtrogContract.target,
                mockVerifierContract.target, // Use mock verifier for zkEVM
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
                PolygonZKEVMEtrogContract.target,
                mockVerifierContract.target,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // Create etrog rollup
        const newCreatedRollupID = 1;
        const newSequencedBatch = 1;
        const initializeBytesLegacy = encodeInitializeBytesLegacy(
            admin.address,
            inputZkevmMigration.signer,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const zkevmContract = PolygonZKEVMEtrogFactory.attach(rollupAddress) as PolygonZkEVMEtrog;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesLegacy),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, rollupAddress, chainID, gasTokenAddress)
            .to.emit(zkevmContract, 'InitialSequenceBatches')
            .to.emit(rollupManagerContract, 'OnSequenceBatches')
            .withArgs(newCreatedRollupID, newSequencedBatch);

        // Assert new rollup created
        expect(await zkevmContract.admin()).to.be.equal(admin.address);
        expect(await zkevmContract.trustedSequencer()).to.be.equal(ethers.getAddress(inputZkevmMigration.signer));
        expect(await zkevmContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await zkevmContract.networkName()).to.be.equal(networkName);
        expect(await zkevmContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

        // Verify the initial batch (required for migration)
        const pendingState = 0;
        const newLocalExitRoot = ethers.ZeroHash; // No bridge activity, so exit root is zero
        const currentVerifiedBatch = 0;
        const newVerifiedBatch = newSequencedBatch; // Verify batch 1 (the initial batch)
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const newStateRoot = ethers.ZeroHash; // Simple state root for initial batch

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

        // Migrate to ECDSA Multisig using initMigration
        const upgradeData = aggchainECDSAMultisigFactory.interface.encodeFunctionData('migrateFromLegacyConsensus()');

        await expect(
            rollupManagerContract
                .connect(timelock)
                .initMigration(newCreatedRollupID, rollupTypeIDECDSAMultisig, upgradeData),
        )
            .to.emit(rollupManagerContract, 'InitMigration')
            .withArgs(newCreatedRollupID, rollupTypeIDECDSAMultisig)
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(newCreatedRollupID, rollupTypeIDECDSAMultisig, newVerifiedBatch);

        expect(await rollupManagerContract.isRollupMigrating(newCreatedRollupID)).to.be.equal(true);

        // Access the contract as ECDSA Multisig after migration
        const ecdsaMultisigContract = aggchainECDSAMultisigFactory.attach(rollupAddress) as AggchainECDSAMultisig;

        // The proof must encode newLER == lastLER (== 0 here, since etrog phase had no bridges).
        const currentDepositCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const l1InfoTreeLeafCount = Number(currentDepositCount) + 1;
        const newLER = inputZkevmMigration.pp_inputs.new_local_exit_root;
        const newPPRoot = inputZkevmMigration.pp_inputs.new_pessimistic_root;
        // Prepend the migration PP route selector (registered in beforeEach) so the gateway
        // routes to the migration vkey.
        const proofPP = MIGRATION_PP_ROUTE_SELECTOR + inputZkevmMigration.proof.slice(2);
        const l1InfoRoot = inputZkevmMigration.pp_inputs.l1_info_root;

        // Sanity: chain config must match what the proof was generated against.
        const onChainAggchainHash = await ecdsaMultisigContract.getAggchainHash('0x');
        expect(onChainAggchainHash).to.be.equal(inputZkevmMigration.pp_inputs.aggchain_hash);

        // Mock selected GER for the migration
        await polygonZkEVMGlobalExitRoot.injectGER(l1InfoRoot, l1InfoTreeLeafCount);

        // Finalize the migration with verifyPessimisticTrustedAggregator (no bridges)
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is empty for ECDSA multisig
            ),
        )
            .to.emit(rollupManagerContract, 'CompletedMigration')
            .withArgs(newCreatedRollupID)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, 0, ethers.ZeroHash, newLER, trustedAggregator.address);

        expect(await rollupManagerContract.isRollupMigrating(newCreatedRollupID)).to.be.equal(false);

        // Verify ECDSA Multisig specific properties after migration
        expect(await ecdsaMultisigContract.aggchainManager()).to.be.equal(admin.address);
        expect(await ecdsaMultisigContract.threshold()).to.be.equal(1);

        // Verify trustedSequencer was added as signer with threshold 1
        const signers = await ecdsaMultisigContract.getAggchainSigners();
        expect(signers.length).to.be.equal(1);
        expect(signers[0].toLowerCase()).to.be.equal(inputZkevmMigration.signer);
        expect(await ecdsaMultisigContract.isSigner(inputZkevmMigration.signer)).to.be.equal(true);
    });
});
