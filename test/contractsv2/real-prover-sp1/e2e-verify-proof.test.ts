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

import { VerifierType } from '../../../src/pessimistic-utils';
import inputProof from './test-inputs/input.json';
import inputZkevmMigration from './test-inputs/input-zkevm-migration.json';
import { encodeInitializeBytesLegacy } from '../../../src/utils-common-aggchain';

describe('Polygon Rollup Manager with zkevm etrog migration to ECDSA Multisig with real prover', () => {
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

        // Initialize AgglayerGateway with selector and vkey from input-zkevm-migration.json
        await aggLayerGatewayContract.initialize(
            admin.address, // defaultAdmin
            admin.address, // aggchainVKey role
            admin.address, // addPPRoute role
            admin.address, // freezePPRoute role
            inputZkevmMigration.selector, // ppVKeySelector
            verifierContract.target, // verifier
            inputZkevmMigration.vkey, // ppVKey
            admin.address, // multisigRole
            [], // signersToAdd (empty)
            0, // newThreshold
        );

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
        const rollupVerifierType = 0;
        const description = 'zkevm test';
        const programVKey = '0x0000000000000000000000000000000000000000000000000000000000000000';

        const gasTokenAddress = '0x0000000000000000000000000000000000000000';

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

        // Verify migration completed successfully for ECDSA Multisig
        // For ECDSA Multisig, verification is simpler - just verify the migration completed
        const l1InfoTreeLeafCount = 1;
        const l1InfoRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(l1InfoTreeLeafCount);
        const newLER = ethers.ZeroHash; // For ECDSA multisig with no bridges
        const newPPRoot = inputZkevmMigration.pp_inputs.new_pessimistic_root;
        const proofPP = inputZkevmMigration.proof;

        // Finalize the migration with verifyAggregatedProofTrusted (no bridges)
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyAggregatedProofTrusted(
                [
                    {
                        rollupID: newCreatedRollupID,
                        newLocalExitRoot: newLER,
                        newPessimisticRoot: newPPRoot,
                        aggchainData: '0x', // aggchainData is empty for ECDSA multisig
                    },
                ],
                l1InfoTreeLeafCount,
                ethers.ZeroHash,
                proofPP,
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
