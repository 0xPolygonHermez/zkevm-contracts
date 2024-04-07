/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMFeijoa,
    PolygonRollupBaseFeijoa,
    TokenWrapped,
    Address,
    PolygonValidiumStorageMigration,
    PolygonDataCommittee,
    PolygonValidiumFeijoaPrevious,
    PolygonRollupManager,
    BridgeReceiverMock__factory,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBlobHashData} = contractUtils;
type VerifyBlobData = PolygonRollupManager.VerifySequenceDataStruct;
type BlobDataStructFeijoa = PolygonRollupBaseFeijoa.BlobDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

function encodeCalldatBlobTypeParams(
    maxSequenceTimestamp: any,
    zkGasLimit: any,
    l1InfoLeafIndex: any,
    transactions: any
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint64", "uint64", "uint32", "bytes"],
        [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactions]
    );
}

function encodeCalldatForcedTypeParams(transactionsHash: any, forcedHashData: any) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [transactionsHash, forcedHashData]);
}
const CALLDATA_BLOB_TYPE = 0;
const BLOBTX_BLOB_TYPE = 1;
const FORCED_BLOB_TYPE = 2;

const ZK_GAS_LIMIT_BATCH = 100_000_000;
const MAX_SEQUENCE_TIMESTAMP_FORCED = 18446744073709551615n; // max uint64

describe("Polygon Rollup Manager", () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;

    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let rollupManagerContract: PolygonRollupManagerMock;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;
    const FORCE_BLOB_TIMEOUT = 60 * 60 * 24 * 5; // 5 days

    // BRidge constants
    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    const globalExitRootL2Address = "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa" as unknown as Address;

    let firstDeployment = true;

    //roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");
    const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id("OBSOLETE_ROLLUP_TYPE_ROLE");
    const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");
    const ADD_EXISTING_ROLLUP_ROLE = ethers.id("ADD_EXISTING_ROLLUP_ROLE");
    const UPDATE_ROLLUP_ROLE = ethers.id("UPDATE_ROLLUP_ROLE");
    const TRUSTED_AGGREGATOR_ROLE = ethers.id("TRUSTED_AGGREGATOR_ROLE");
    const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id("TRUSTED_AGGREGATOR_ROLE_ADMIN");
    const TWEAK_PARAMETERS_ROLE = ethers.id("TWEAK_PARAMETERS_ROLE");
    const SET_FEE_ROLE = ethers.id("SET_FEE_ROLE");
    const STOP_EMERGENCY_ROLE = ethers.id("STOP_EMERGENCY_ROLE");
    const EMERGENCY_COUNCIL_ROLE = ethers.id("EMERGENCY_COUNCIL_ROLE");
    const EMERGENCY_COUNCIL_ADMIN = ethers.id("EMERGENCY_COUNCIL_ADMIN");

    const SIGNATURE_BYTES = 32 + 32 + 1;
    const EFFECTIVE_PERCENTAGE_BYTES = 1;

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil, beneficiary] =
            await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory("VerifierRollupHelperMock");
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance
        );

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();

        if ((await upgrades.admin.getInstance()).target !== "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") {
            firstDeployment = false;
        }
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
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        });

        // deploy mock verifier
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerMock");

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as unknown as PolygonRollupManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            "0x"
        );

        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            pendingStateTimeoutDefault,
            trustedAggregatorTimeout,
            admin.address,
            timelock.address,
            emergencyCouncil.address
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));
    });

    it("should check the initalized parameters", async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await rollupManagerContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeout);

        const zkGasPrice = ethers.parseEther("0.1") / (await rollupManagerContract.ZK_GAS_LIMIT_BATCH());
        expect(await rollupManagerContract.getZkGasPrice()).to.be.equal(zkGasPrice);
        expect(await rollupManagerContract.getForcedZkGasPrice()).to.be.equal(zkGasPrice * 100n);
        expect(await rollupManagerContract.calculateRewardPerZkGas()).to.be.equal(0);

        expect(await rollupManagerContract.ZK_GAS_LIMIT_BATCH()).to.be.equal(ZK_GAS_LIMIT_BATCH);

        // Check roles
        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelock.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true
        );

        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true
        );
    });

    it("should check the emergency state", async () => {
        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        await expect(rollupManagerContract.activateEmergencyState()).to.be.revertedWithCustomError(
            rollupManagerContract,
            "HaltTimeoutNotExpired"
        );
        await expect(rollupManagerContract.connect(emergencyCouncil).activateEmergencyState())
            .to.emit(rollupManagerContract, "EmergencyStateActivated")
            .to.emit(polygonZkEVMBridgeContract, "EmergencyStateActivated");

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);

        await expect(
            rollupManagerContract.connect(emergencyCouncil).deactivateEmergencyState()
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        await expect(rollupManagerContract.connect(admin).deactivateEmergencyState())
            .to.emit(rollupManagerContract, "EmergencyStateDeactivated")
            .to.emit(polygonZkEVMBridgeContract, "EmergencyStateDeactivated");

        const timestampDeactivatedEmergency = (await ethers.provider.getBlock("latest"))?.timestamp;

        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.be.equal(
            timestampDeactivatedEmergency
        );

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);
    });

    it("should check full flow feijoa", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMFeijoa");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Try to add a new rollup type
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        const snapshot = await takeSnapshot();

        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        expect([
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            true,
            genesisRandom,
        ]).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        await snapshot.restore();

        expect(expectedRollupType).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));

        // Only admin can create new zkEVMs
        await expect(
            rollupManagerContract.createNewRollup(
                newRollupTypeID,
                chainID,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // UNexisting rollupType
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    0,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeDoesNotExist");

        // Obsolete rollup type and test that fails
        const snapshot2 = await takeSnapshot();
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMFeijoa;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress)
            .to.emit(newZkEVMContract, "InitialSequenceBlobs")
            .to.emit(rollupManagerContract, "OnSequence")
            .withArgs(newCreatedRollupID, ZK_GAS_LIMIT_BATCH, newSequencedBlob);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBlobTimeout()).to.be.equal(FORCE_BLOB_TIMEOUT);

        // Cannot create 2 chains with the same chainID
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ChainIDAlreadyExist");

        const transaction = await newZkEVMContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);

        const rawTx = processorUtils.customRawTxToRawTx(transaction);
        const tx = ethers.Transaction.from(rawTx);

        const rlpSignData = transaction.slice(0, -(SIGNATURE_BYTES * 2 + EFFECTIVE_PERCENTAGE_BYTES * 2));
        expect(rlpSignData).to.be.equal(tx.unsignedSerialized);

        expect(tx.to).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(tx.value).to.be.equal(0);
        expect(tx.data).to.be.equal(encodedData);
        expect(tx.gasPrice).to.be.equal(0);
        expect(tx.gasLimit).to.be.equal(30000000);
        expect(tx.nonce).to.be.equal(0);
        expect(tx.chainId).to.be.equal(0);

        const forcedHashData = ethers.solidityPackedKeccak256(
            ["bytes32", "uint64", "bytes32"],
            [
                await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
                timestampCreatedRollup,
                blockCreatedRollup?.parentHash,
            ]
        );

        const expectedAccInputHash = calculateAccInputHashfeijoa(
            ethers.ZeroHash,
            0,
            ethers.ZeroHash,
            await newZkEVMContract.MAX_SEQUENCE_TIMESTAMP_FORCED(),
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastSequenceNum).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBlobData = await rollupManagerContract.getRollupSequencedSequences(
            newCreatedRollupID,
            newSequencedBlob
        );

        expect(sequencedBlobData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBlobData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBlobData.currentBlobNum).to.be.equal(1);
        expect(sequencedBlobData.accZkGasLimit).to.be.equal(ZK_GAS_LIMIT_BATCH);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = (await rollupManagerContract.getZkGasPrice()) * BigInt(ZK_GAS_LIMIT_BATCH);
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        const l1InfoIndex = 0;

        const blob = {
            blobType: 0,
            blobTypeParams: encodeCalldatBlobTypeParams(currentTime, ZK_GAS_LIMIT_BATCH, l1InfoIndex, l2txData),
        } as BlobDataStructFeijoa;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Call onSequenceBlobs with 0 blobs
        await ethers.provider.send("hardhat_impersonateAccount", [newZkEVMContract.target]);
        const zkEVMContractSigner = await ethers.getSigner(newZkEVMContract.target as any);

        await expect(
            rollupManagerContract.connect(zkEVMContractSigner).onSequence(0, 0, ethers.ZeroHash, {gasPrice: 0})
        ).to.be.revertedWithCustomError(rollupManagerContract, "MustSequenceSomeBlob");

        await expect(
            newZkEVMContract.connect(trustedSequencer).sequenceBlobs([blob], trustedSequencer.address, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(newZkEVMContract, "FinalAccInputHashDoesNotMatch");

        // Sequence Blobs
        const expectedAccInputHash2 = await calculateAccInputHashFromCalldata(
            [blob],
            trustedSequencer.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

        let currentLastBlobSequenced = 1;
        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBlobs([blob], trustedSequencer.address, expectedAccInputHash2 as any)
        ).to.emit(newZkEVMContract, "SequenceBlobs");

        const lastBlock = await ethers.provider.getBlock("latest");
        const lastBlockHash = lastBlock?.parentHash;
        const lastGlobalExitRootS = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        const height = 32;
        const merkleTreeGLobalExitRoot = new MerkleTreeBridge(height);
        const leafValueJs = calculateGlobalExitRootLeaf(lastGlobalExitRootS, lastBlockHash, lastBlock?.timestamp);
        //merkleTreeGLobalExitRoot.add(leafValueJs);

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        const rootJS = merkleTreeGLobalExitRoot.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = "Matic Token";
        const tokenSymbol = "MATIC";
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [tokenName, tokenSymbol, decimals]
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // trustedAggregator forge the blob
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBlob = newSequencedBlob + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBlob = 0;

        const VerifyBlobData = {
            rollupID: newCreatedRollupID,
            pendingStateNum: pendingState,
            initSequenceNum: currentVerifiedBlob,
            finalSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        VerifyBlobData.finalSequenceNum = currentVerifiedBlob;
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumSequenceBelowLastVerifiedSequence");
        VerifyBlobData.finalSequenceNum = 3;

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");
        VerifyBlobData.finalSequenceNum = newVerifiedBlob;

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify blob
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequencesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        expect(finalAggregatorMatic).to.equal(initialAggregatorMatic + maticAmount);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeaf);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexLeaf, rootRollups)
        ).to.be.equal(true);

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        // index leaf is 0 bc, does not have mainnet flag, and it's rollup 0 on leaf 0
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(indexLeaf, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, beneficiary.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Force blobs

        // Check force blobs are unactive
        await expect(newZkEVMContract.forceBlob("0x", 0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBlobNotAllowed"
        );
        await expect(newZkEVMContract.sequenceForceBlobs([])).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBlobNotAllowed"
        );

        expect(await newZkEVMContract.forceBlobAddress()).to.be.equal(admin.address);
        await expect(newZkEVMContract.connect(admin).setForceBlobAddress(deployer.address))
            .to.emit(newZkEVMContract, "SetForceBlobAddress")
            .withArgs(deployer.address);
        expect(await newZkEVMContract.forceBlobAddress()).to.be.equal(deployer.address);

        await expect(newZkEVMContract.connect(admin).setForceBlobAddress(ethers.ZeroAddress))
            .to.emit(newZkEVMContract, "SetForceBlobAddress")
            .withArgs(ethers.ZeroAddress);

        await expect(
            newZkEVMContract.connect(admin).setForceBlobAddress(deployer.address)
        ).to.be.revertedWithCustomError(newZkEVMContract, "ForceBlobsDecentralized");

        //snapshot emergency
        const snapshotEmergencyState = await takeSnapshot();
        await rollupManagerContract.connect(emergencyCouncil).activateEmergencyState();
        await expect(newZkEVMContract.forceBlob("0x", 0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBlobsNotAllowedOnEmergencyState"
        );
        await rollupManagerContract.connect(admin).deactivateEmergencyState();
        const currentTimestampEmergency = (await ethers.provider.getBlock("latest"))?.timestamp;

        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.be.equal(
            currentTimestampEmergency
        );

        await expect(newZkEVMContract.sequenceForceBlobs([blob])).to.be.revertedWithCustomError(
            newZkEVMContract,
            "HaltTimeoutNotExpiredAfterEmergencyState"
        );

        await snapshotEmergencyState.restore();

        const l2txDataForceBlob = "0x123456";
        const maticAmountForced = (await rollupManagerContract.getForcedZkGasPrice()) * BigInt(ZK_GAS_LIMIT_BATCH);
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // Approve tokens
        await expect(polTokenContract.approve(newZkEVMContract.target, maticAmountForced)).to.emit(
            polTokenContract,
            "Approval"
        );

        const lastForcedBlob = (await newZkEVMContract.lastForceBlob()) + 1n;

        // Force blob
        await expect(newZkEVMContract.forceBlob(l2txDataForceBlob, maticAmountForced))
            .to.emit(newZkEVMContract, "ForceBlob")
            .withArgs(lastForcedBlob, lastGlobalExitRoot, deployer.address, ZK_GAS_LIMIT_BATCH, "0x");

        const forcedBlock = await ethers.provider.getBlock("latest");
        const currentTimestamp2 = forcedBlock?.timestamp;

        const forcedHashDataForcedBlob = ethers.solidityPackedKeccak256(
            ["bytes32", "uint64", "bytes32"],
            [lastGlobalExitRoot, currentTimestamp2, forcedBlock?.parentHash]
        );

        const blobForced = {
            blobType: FORCED_BLOB_TYPE,
            blobTypeParams: encodeCalldatForcedTypeParams(
                ethers.keccak256(l2txDataForceBlob),
                forcedHashDataForcedBlob
            ),
        } as BlobDataStructFeijoa;

        const expectedAccInputHash3 = await calculateAccInputHashFromCalldata(
            [blobForced],
            trustedSequencer.address,
            expectedAccInputHash2,
            polygonZkEVMGlobalExitRoot
        );

        const snapshot3 = await takeSnapshot();

        // Sequence Blobs
        let a = 0;
        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBlobs([blobForced], trustedSequencer.address, expectedAccInputHash3)
        ).to.emit(newZkEVMContract, "SequenceBlobs");

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash3);

        await snapshot3.restore();
        // sequence force blobs

        const timestampForceBlob = (await ethers.provider.getBlock("latest"))?.timestamp as any;
        // Increment timestamp
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestampForceBlob + FORCE_BLOB_TIMEOUT]);

        // sequence force blob
        await expect(newZkEVMContract.sequenceForceBlobs([blobForced]))
            .to.emit(newZkEVMContract, "SequenceForceBlobs")
            .withArgs(3);

        // Check admin functions
        await expect(newZkEVMContract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyAdmin"
        );

        await expect(newZkEVMContract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(newZkEVMContract, "SetTrustedSequencer")
            .withArgs(deployer.address);

        await expect(newZkEVMContract.setTrustedSequencerURL("0x1253")).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyAdmin"
        );
        await expect(newZkEVMContract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(newZkEVMContract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        await expect(newZkEVMContract.setForceBlobTimeout(0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyAdmin"
        );

        await expect(
            newZkEVMContract.connect(admin).setForceBlobTimeout(FORCE_BLOB_TIMEOUT)
        ).to.be.revertedWithCustomError(newZkEVMContract, "InvalidRangeForceBlobTimeout");

        await expect(newZkEVMContract.connect(admin).setForceBlobTimeout(0))
            .to.emit(newZkEVMContract, "SetForceBlobTimeout")
            .withArgs(0);

        await expect(newZkEVMContract.transferAdminRole(deployer.address)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyAdmin"
        );

        await expect(newZkEVMContract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(newZkEVMContract, "TransferAdminRole")
            .withArgs(deployer.address);

        await expect(newZkEVMContract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyPendingAdmin"
        );

        await expect(newZkEVMContract.connect(deployer).acceptAdminRole())
            .to.emit(newZkEVMContract, "AcceptAdminRole")
            .withArgs(deployer.address);
    });

    it("should check full flow with gas Token feijoa", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether

        // deploy pol
        const gasTokenName = "GAS Token";
        const gasTokenSymbol = "GTOKEN";
        const gasTokenDecimals = 18;

        const gasTokenInitialBalance = ethers.parseEther("20000000");

        const gasMetadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [gasTokenName, gasTokenSymbol, gasTokenDecimals]
        );
        const tokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        const gasTokenContract = await tokenFactory.deploy(
            gasTokenName,
            gasTokenSymbol,
            deployer.address,
            gasTokenInitialBalance
        );

        const gasTokenAddress = gasTokenContract.target;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMFeijoa");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Try to add a new rollup type
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        const snapshot = await takeSnapshot();

        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        expect([
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            true,
            genesisRandom,
        ]).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        await snapshot.restore();

        expect(expectedRollupType).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));

        // Only admin can create new zkEVMs
        await expect(
            rollupManagerContract.createNewRollup(
                newRollupTypeID,
                chainID,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Unexisting rollupType
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    0,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeDoesNotExist");

        // Obsolete rollup type and test that fails
        const snapshot2 = await takeSnapshot();
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMFeijoa;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress)
            .to.emit(newZkEVMContract, "InitialSequenceBlobs")
            .to.emit(rollupManagerContract, "OnSequenceBlobs")
            .withArgs(newCreatedRollupID, newSequencedBlob);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBlobTimeout()).to.be.equal(FORCE_BLOB_TIMEOUT);

        // Cannot create 2 chains with the same chainID
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ChainIDAlreadyExist");

        const transaction = await newZkEVMContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            gasMetadataToken
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            gasMetadataToken,
        ]);

        const rawTx = processorUtils.customRawTxToRawTx(transaction);
        const tx = ethers.Transaction.from(rawTx);

        const rlpSignData = transaction.slice(0, -(SIGNATURE_BYTES * 2 + EFFECTIVE_PERCENTAGE_BYTES * 2));
        expect(rlpSignData).to.be.equal(tx.unsignedSerialized);

        expect(tx.to).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(tx.value).to.be.equal(0);
        expect(tx.data).to.be.equal(encodedData);
        expect(tx.gasPrice).to.be.equal(0);
        expect(tx.gasLimit).to.be.equal(30000000);
        expect(tx.nonce).to.be.equal(0);
        expect(tx.chainId).to.be.equal(0);

        const expectedAccInputHash = calculateAccInputHashfeijoa(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBlobSequenced).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBlobData = await rollupManagerContract.getRollupSequencedSequences(
            newCreatedRollupID,
            newSequencedBlob
        );

        expect(sequencedBlobData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBlobData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBlobData.previousLastBlobSequenced).to.be.equal(0);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBlobFee();

        const sequence = {
            transactions: l2txData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as BlobDataStructFeijoa;

        const height = 32;
        const merkleTreeGLobalExitRoot = new MerkleTreeBridge(height);

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        const rootJS = merkleTreeGLobalExitRoot.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Sequence Blobs
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBlobSequenced = 1;

        const txSequenceBlobs = await newZkEVMContract
            .connect(trustedSequencer)
            .sequenceBlobs([sequence], currentTime, currentLastBlobSequenced++, trustedSequencer.address);

        const lastBlock = await ethers.provider.getBlock("latest");
        const lastBlockHash = lastBlock?.parentHash;
        const lastGlobalExitRootS = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        const receipt = await txSequenceBlobs.wait();
        const logs = receipt?.logs as any;

        for (const log of logs) {
            const parsedLog = newZkEVMContract.interface.parseLog(log);
            if (parsedLog != null) {
                expect(parsedLog.name).to.be.equal("SequenceBlobs");
                expect(parsedLog.args.numBlob).to.be.equal(2);
                expect(parsedLog.args.l1InfoRoot).to.be.equal(rootSC);
            }
        }

        const expectedAccInputHash2 = calculateAccInputHashfeijoa(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            rootSC,
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = "Matic Token";
        const tokenSymbol = "MATIC";
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [tokenName, tokenSymbol, decimals]
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // trustedAggregator forge the blob
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBlob = newSequencedBlob + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBlob = 0;

        const VerifyBlobData = {
            rollupID: newCreatedRollupID,
            pendingStateNum: pendingState,
            initNumBlob: currentVerifiedBlob,
            initSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify blob
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequencesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        expect(finalAggregatorMatic).to.equal(initialAggregatorMatic + maticAmount);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeaf);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexLeaf, rootRollups)
        ).to.be.equal(true);

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        // index leaf is 0 bc, does not have mainnet flag, and it's rollup 0 on leaf 0
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(indexLeaf, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, beneficiary.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
    });

    it("should check full flow upgrading rollup feijoa", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether

        // deploy pol
        const gasTokenName = "GAS Token";
        const gasTokenSymbol = "GTOKEN";
        const gasTokenDecimals = 18;

        const gasTokenInitialBalance = ethers.parseEther("20000000");

        const gasMetadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [gasTokenName, gasTokenSymbol, gasTokenDecimals]
        );
        const tokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        const gasTokenContract = await tokenFactory.deploy(
            gasTokenName,
            gasTokenSymbol,
            deployer.address,
            gasTokenInitialBalance
        );

        const gasTokenAddress = gasTokenContract.target;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMFeijoaPrevious");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Try to add a new rollup type
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        const snapshot = await takeSnapshot();

        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        expect([
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            true,
            genesisRandom,
        ]).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        await snapshot.restore();

        expect(expectedRollupType).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        // Create a

        // Only admin can create new zkEVMs
        await expect(
            rollupManagerContract.createNewRollup(
                newRollupTypeID,
                chainID,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // UNexisting rollupType
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    0,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeDoesNotExist");

        // Obsolete rollup type and test that fails
        const snapshot2 = await takeSnapshot();
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMFeijoa;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress)
            .to.emit(newZkEVMContract, "InitialSequenceBlobs")
            .to.emit(rollupManagerContract, "OnSequenceBlobs")
            .withArgs(newCreatedRollupID, newSequencedBlob);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBlobTimeout()).to.be.equal(FORCE_BLOB_TIMEOUT);

        // Cannot create 2 chains with the same chainID
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ChainIDAlreadyExist");

        const transaction = await newZkEVMContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            gasMetadataToken // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            gasMetadataToken, // empty metadata
        ]);

        const rawTx = processorUtils.customRawTxToRawTx(transaction);
        const tx = ethers.Transaction.from(rawTx);

        const rlpSignData = transaction.slice(0, -(SIGNATURE_BYTES * 2 + EFFECTIVE_PERCENTAGE_BYTES * 2));
        expect(rlpSignData).to.be.equal(tx.unsignedSerialized);

        expect(tx.to).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(tx.value).to.be.equal(0);
        expect(tx.data).to.be.equal(encodedData);
        expect(tx.gasPrice).to.be.equal(0);
        expect(tx.gasLimit).to.be.equal(30000000);
        expect(tx.nonce).to.be.equal(0);
        expect(tx.chainId).to.be.equal(0);

        const expectedAccInputHash = calculateAccInputHashfeijoa(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBlobSequenced).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBlobData = await rollupManagerContract.getRollupSequencedSequences(
            newCreatedRollupID,
            newSequencedBlob
        );

        expect(sequencedBlobData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBlobData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBlobData.previousLastBlobSequenced).to.be.equal(0);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBlobFee();
        const currentTimestamp = (await ethers.provider.getBlock("latest"))?.timestamp;

        const sequence = {
            transactions: l2txData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as BlobDataStructFeijoa;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Sequence Blobs
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBlobSequenced = 0;
        await expect(
            newZkEVMContract.connect(trustedSequencer).sequenceBlobs([sequence], trustedSequencer.address)
        ).to.emit(newZkEVMContract, "SequenceBlobs");

        const lastBlock = await ethers.provider.getBlock("latest");

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();

        const expectedAccInputHash2 = calculateAccInputHashfeijoa(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            rootSC,
            lastBlock?.timestamp,
            trustedSequencer.address,
            ethers.ZeroHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = "Matic Token";
        const tokenSymbol = "MATIC";
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [tokenName, tokenSymbol, decimals]
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // trustedAggregator forge the blob
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBlob = newSequencedBlob + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBlob = 0;

        const VerifyBlobData = {
            rollupID: newCreatedRollupID,
            pendingStateNum: pendingState,
            initNumBlob: currentVerifiedBlob,
            initSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify blob
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequencesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        expect(finalAggregatorMatic).to.equal(initialAggregatorMatic + maticAmount);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeaf);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexLeaf, rootRollups)
        ).to.be.equal(true);

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        // index leaf is 0 bc, does not have mainnet flag, and it's rollup 0 on leaf 0
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(indexLeaf, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, beneficiary.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Upgrade rollup
        // In order to update a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMFeijoaFactory = await ethers.getContractFactory("PolygonZkEVMFeijoa");
        const PolygonZKEVMFeijoaContract = await PolygonZKEVMFeijoaFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMFeijoaContract.waitForDeployment();

        // Add a new rollup type with timelock
        const feijoaRollupType = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMFeijoaContract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                feijoaRollupType,
                PolygonZKEVMFeijoaContract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // Add a new rollup type with timelock
        const randomType = 3;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMFeijoaContract.target,
                    verifierContract.target,
                    forkID,
                    randomType,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                randomType,
                PolygonZKEVMFeijoaContract.target,
                verifierContract.target,
                forkID,
                randomType,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdFeijoaRollupType = await rollupManagerContract.rollupTypeMap(feijoaRollupType);

        const expectedFeijoaRollupType = [
            PolygonZKEVMFeijoaContract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdFeijoaRollupType).to.be.deep.equal(expectedFeijoaRollupType);

        // Validate upgrade OZ
        await upgrades.validateUpgrade(PolygonZKEVMV2Factory, PolygonZKEVMFeijoaFactory, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        } as any);

        await expect(
            rollupManagerContract.connect(admin).updateRollup(newZKEVMAddress, feijoaRollupType, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Try update random address
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(polygonZkEVMGlobalExitRoot.target, feijoaRollupType, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupMustExist");

        // Try update same type
        await expect(
            rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, 1, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "UpdateToSameRollupTypeID");

        // Try update invalid type
        await expect(
            rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, 4, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeDoesNotExist");

        // Try update to not comaptible type
        await expect(
            rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, randomType, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "UpdateNotCompatible");

        // obsoleteRollupType, take snapshot for it
        const snapshotUpdateRollup = await takeSnapshot();

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(feijoaRollupType))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(feijoaRollupType);

        await expect(
            rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, feijoaRollupType, "0x")
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");

        await snapshotUpdateRollup.restore();

        expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress as string)).to.be.equal(
            PolygonZKEVMV2Contract.target
        );

        await expect(rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, feijoaRollupType, "0x"))
            .to.emit(rollupManagerContract, "UpdateRollup")
            .withArgs(newRollupTypeID, feijoaRollupType, newVerifiedBlob);

        // Check mapping on rollup Manager
        const rollupDataFinal = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataFinal.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupDataFinal.chainID).to.be.equal(chainID);
        expect(rollupDataFinal.verifier).to.be.equal(verifierContract.target);
        expect(rollupDataFinal.forkID).to.be.equal(forkID);
        expect(rollupDataFinal.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataFinal.lastBlobSequenced).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.lastPendingState).to.be.equal(0);
        expect(rollupDataFinal.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataFinal.lastVerifiedSequenceBeforeUpgrade).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.rollupTypeID).to.be.equal(feijoaRollupType);
        expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

        expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress as string)).to.be.equal(
            PolygonZKEVMFeijoaContract.target
        );
    });

    it("should check full flow upgrading validium storage migration", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether

        // deploy pol
        const gasTokenName = "GAS Token";
        const gasTokenSymbol = "GTOKEN";
        const gasTokenDecimals = 18;

        const gasTokenInitialBalance = ethers.parseEther("20000000");

        const gasMetadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [gasTokenName, gasTokenSymbol, gasTokenDecimals]
        );
        const tokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        const gasTokenContract = await tokenFactory.deploy(
            gasTokenName,
            gasTokenSymbol,
            deployer.address,
            gasTokenInitialBalance
        );

        const gasTokenAddress = gasTokenContract.target;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonValidiumPreviousVersion = await ethers.getContractFactory("PolygonValidiumFeijoaPrevious");
        const PolygonZKEVMV2Contract = await PolygonValidiumPreviousVersion.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        expect(expectedRollupType).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonValidiumPreviousVersion.attach(
            newZKEVMAddress
        ) as PolygonValidiumFeijoaPrevious;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress)
            .to.emit(newZkEVMContract, "InitialSequenceBlobs")
            .to.emit(rollupManagerContract, "OnSequenceBlobs")
            .withArgs(newCreatedRollupID, newSequencedBlob);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBlobTimeout()).to.be.equal(FORCE_BLOB_TIMEOUT);

        const transaction = await newZkEVMContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            gasMetadataToken // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            gasMetadataToken, // empty metadata
        ]);

        const rawTx = processorUtils.customRawTxToRawTx(transaction);
        const tx = ethers.Transaction.from(rawTx);

        const rlpSignData = transaction.slice(0, -(SIGNATURE_BYTES * 2 + EFFECTIVE_PERCENTAGE_BYTES * 2));
        expect(rlpSignData).to.be.equal(tx.unsignedSerialized);

        expect(tx.to).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(tx.value).to.be.equal(0);
        expect(tx.data).to.be.equal(encodedData);
        expect(tx.gasPrice).to.be.equal(0);
        expect(tx.gasLimit).to.be.equal(30000000);
        expect(tx.nonce).to.be.equal(0);
        expect(tx.chainId).to.be.equal(0);

        const expectedAccInputHash = calculateAccInputHashfeijoa(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBlobSequenced).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBlobData = await rollupManagerContract.getRollupSequencedSequences(
            newCreatedRollupID,
            newSequencedBlob
        );

        expect(sequencedBlobData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBlobData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBlobData.previousLastBlobSequenced).to.be.equal(0);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBlobFee();
        const currentTimestamp = (await ethers.provider.getBlock("latest"))?.timestamp;

        const sequence = {
            transactionsHash: ethers.keccak256(l2txData),
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as any;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Sequence Blobs
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBlobSequenced = 0;

        // Setup commitee
        // Create CdkCommitee
        const PolygonDataCommiteeFactory = await ethers.getContractFactory("PolygonDataCommittee");
        const PolygonDataCommitee = (await upgrades.deployProxy(PolygonDataCommiteeFactory, [], {
            unsafeAllow: ["constructor"],
        })) as any as PolygonDataCommittee;

        await newZkEVMContract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommitee.target);

        expect(await newZkEVMContract.dataAvailabilityProtocol()).to.be.equal(PolygonDataCommitee.target);
        await PolygonDataCommitee.setupCommittee(0, [], "0x");

        await expect(
            newZkEVMContract.connect(trustedSequencer).sequenceBlobsValidium([sequence], trustedSequencer.address, "0x")
        ).to.emit(newZkEVMContract, "SequenceBlobs");

        const lastBlock = await ethers.provider.getBlock("latest");

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();

        const expectedAccInputHash2 = calculateAccInputHashfeijoa(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            rootSC,
            lastBlock?.timestamp,
            trustedSequencer.address,
            ethers.ZeroHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // trustedAggregator forge the blob
        const pendingState = 0;
        const newLocalExitRoot = ethers.ZeroHash;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBlob = newSequencedBlob + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBlob = 0;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(32);
        const rootRollups = merkleTreeRollups.getRoot();

        const VerifyBlobData = {
            rollupID: newCreatedRollupID,
            pendingStateNum: pendingState,
            initNumBlob: currentVerifiedBlob,
            initSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        // Verify blob
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequencesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        expect(finalAggregatorMatic).to.equal(initialAggregatorMatic + maticAmount);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        // Upgrade rollup
        // In order to update a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonValidiumStorageMigration = await ethers.getContractFactory("PolygonValidiumStorageMigration");
        const PolygonValidiumMigrationContract = await PolygonValidiumStorageMigration.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonValidiumMigrationContract.waitForDeployment();

        // Add a new rollup type with timelock
        const feijoaRollupType = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonValidiumMigrationContract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                feijoaRollupType,
                PolygonValidiumMigrationContract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // Add a new rollup type with timelock
        const randomType = 3;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonValidiumMigrationContract.target,
                    verifierContract.target,
                    forkID,
                    randomType,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                randomType,
                PolygonValidiumMigrationContract.target,
                verifierContract.target,
                forkID,
                randomType,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdFeijoaRollupType = await rollupManagerContract.rollupTypeMap(feijoaRollupType);

        const expectedFeijoaRollupType = [
            PolygonValidiumMigrationContract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdFeijoaRollupType).to.be.deep.equal(expectedFeijoaRollupType);

        // Validate upgrade OZ

        await upgrades.validateUpgrade(PolygonValidiumPreviousVersion, PolygonValidiumStorageMigration, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        } as any);

        expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress as string)).to.be.equal(
            PolygonZKEVMV2Contract.target
        );

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(
                    newZKEVMAddress,
                    feijoaRollupType,
                    PolygonValidiumStorageMigration.interface.encodeFunctionData("initializeMigration", [])
                )
        )
            .to.emit(rollupManagerContract, "UpdateRollup")
            .withArgs(newRollupTypeID, feijoaRollupType, newVerifiedBlob);

        // Check mapping on rollup Manager
        const rollupDataFinal = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataFinal.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupDataFinal.chainID).to.be.equal(chainID);
        expect(rollupDataFinal.verifier).to.be.equal(verifierContract.target);
        expect(rollupDataFinal.forkID).to.be.equal(forkID);
        expect(rollupDataFinal.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataFinal.lastBlobSequenced).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.lastPendingState).to.be.equal(0);
        expect(rollupDataFinal.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataFinal.lastVerifiedSequenceBeforeUpgrade).to.be.equal(newVerifiedBlob);
        expect(rollupDataFinal.rollupTypeID).to.be.equal(feijoaRollupType);
        expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

        expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress as string)).to.be.equal(
            PolygonValidiumMigrationContract.target
        );

        expect(await newZkEVMContract.dataAvailabilityProtocol()).to.be.equal(PolygonDataCommitee.target);

        // // Finally check compatibility with current ROllups:
        // const PolygonCurrentValidium = await ethers.getContractFactory("PolygonValidiumFeijoa");
        // const PolygonCurrentValidiumContract = await PolygonCurrentValidium.deploy(
        //     polygonZkEVMGlobalExitRoot.target,
        //     polTokenContract.target,
        //     polygonZkEVMBridgeContract.target,
        //     rollupManagerContract.target
        // );
        // await PolygonCurrentValidiumContract.waitForDeployment();
        // await upgrades.validateUpgrade(PolygonValidiumStorageMigration, PolygonCurrentValidium, {
        //     constructorArgs: [
        //         polygonZkEVMGlobalExitRoot.target,
        //         polTokenContract.target,
        //         polygonZkEVMBridgeContract.target,
        //         rollupManagerContract.target,
        //     ],
        //     unsafeAllow: ["constructor", "state-variable-immutable"],
        // } as any);
    });

    it("should add existing rollup and test full flow", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMExistentFeijoa");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const RollupID = 1;

        const intializeTimestmap = (await ethers.provider.getBlock("latest"))?.timestamp as any;
        const initializeAccInputHash = ethers.hexlify(ethers.randomBytes(32));

        // Initialize:
        await expect(
            PolygonZKEVMV2Contract.initializeUpgrade(
                admin.address,
                trustedSequencer.address,
                urlSequencer,
                networkName,
                initializeAccInputHash // last acc input hash
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyRollupManager");
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);

        const RollupManagerMock = await ethers.getSigner(rollupManagerContract.target as any);

        await expect(
            PolygonZKEVMV2Contract.connect(RollupManagerMock).initializeUpgrade(
                admin.address,
                trustedSequencer.address,
                urlSequencer,
                networkName,
                initializeAccInputHash, // last acc input hash
                {
                    gasPrice: 0,
                }
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "SenderMustBeRollup");

        // Only admin can create new zkEVMs
        await expect(
            rollupManagerContract.addExistingRollup(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                chainID,
                genesisRandom,
                rollupCompatibilityID
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        await expect(
            rollupManagerContract
                .connect(timelock)
                .addExistingRollup(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    chainID,
                    genesisRandom,
                    rollupCompatibilityID
                )
        )
            .to.emit(rollupManagerContract, "AddExistingRollup")
            .withArgs(RollupID, forkID, PolygonZKEVMV2Contract.target, chainID, rollupCompatibilityID, 0);

        await expect(
            rollupManagerContract
                .connect(timelock)
                .addExistingRollup(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    chainID,
                    genesisRandom,
                    rollupCompatibilityID
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ChainIDAlreadyExist");

        await expect(
            rollupManagerContract
                .connect(timelock)
                .addExistingRollup(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    chainID + 1,
                    genesisRandom,
                    rollupCompatibilityID
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupAddressAlreadyExist");

        // Initialize upgrade
        await PolygonZKEVMV2Contract.connect(RollupManagerMock).initializeUpgrade(
            admin.address,
            trustedSequencer.address,
            urlSequencer,
            networkName,
            initializeAccInputHash, // last acc input hash
            {
                gasPrice: 0,
            }
        );

        // Assert new rollup created
        const lastBlock = await ethers.provider.getBlock("latest");
        const timestampCreatedRollup = lastBlock?.timestamp;
        expect(await PolygonZKEVMV2Contract.admin()).to.be.equal(admin.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PolygonZKEVMV2Contract.networkName()).to.be.equal(networkName);
        expect(await PolygonZKEVMV2Contract.forceBlobTimeout()).to.be.equal(FORCE_BLOB_TIMEOUT);

        const txSetupFeijoa = await PolygonZKEVMV2Contract.SET_UP_FEIJOA_TX();
        const expectedAccInputHashInitial = calculateAccInputHashfeijoa(
            initializeAccInputHash,
            ethers.keccak256(txSetupFeijoa),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            lastBlock?.parentHash
        );

        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHashInitial);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBlobFee();
        const currentTimestamp = (await ethers.provider.getBlock("latest"))?.timestamp;

        const sequence = {
            transactions: l2txData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as BlobDataStructFeijoa;

        // Approve tokens
        await expect(
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Blobs
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBlobSequenced = 1;
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [sequence],
                currentTime,
                currentLastBlobSequenced++,
                trustedSequencer.address
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        const currentTimestampSequenced = (await ethers.provider.getBlock("latest"))?.timestamp;

        const expectedAccInputHash2 = calculateAccInputHashfeijoa(
            expectedAccInputHashInitial,
            ethers.keccak256(l2txData),
            rootSC,
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash
        );
        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = "Matic Token";
        const tokenSymbol = "MATIC";
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [tokenName, tokenSymbol, decimals]
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // trustedAggregator forge the blob
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBlob = 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBlob = 0;

        const VerifyBlobData = {
            rollupID: RollupID,
            pendingStateNum: pendingState,
            initNumBlob: currentVerifiedBlob,
            initSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify blob
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequencesTrustedAggregator")
            .withArgs(RollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        //review
        expect(finalAggregatorMatic).to.equal((initialAggregatorMatic + maticAmount) / 2n);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeaf);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexLeaf, rootRollups)
        ).to.be.equal(true);

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        // index leaf is 0 bc, does not have mainnet flag, and it's rollup 0 on leaf 0
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(indexLeaf, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, beneficiary.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
    });

    it("Should test obsolete rollup", async () => {
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMFeijoa");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupCompatibilityID,
                    genesisRandom,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupCompatibilityID,
                genesisRandom,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        // Try to obsolete unexisting types
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "RollupTypeDoesNotExist"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(2)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "RollupTypeDoesNotExist"
        );

        // added correctly
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        // already obsolete
        await expect(
            rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID)
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
    });

    it("Should test global exit root", async () => {
        // In order to create a new rollup type, create an implementation of the contract
        expect(await rollupManagerContract.getRollupExitRoot()).to.be.equal(ethers.ZeroHash);

        async function testRollupExitRoot(rollupsRootsArray: any) {
            const height = 32;
            const merkleTree = new MerkleTreeBridge(height);

            await rollupManagerContract.prepareMockCalculateRoot(rollupsRootsArray);
            for (let i = 0; i < rollupsRootsArray.length; i++) {
                merkleTree.add(rollupsRootsArray[i]);
            }
            const rootSC = await rollupManagerContract.getRollupExitRoot();
            const rootJS = merkleTree.getRoot();
            expect(rootSC).to.be.equal(rootJS);
        }

        // put 100
        for (let i = 1; i < 4; i++) {
            const newRootsArray = [];
            for (let j = 0; j < i; j++) {
                newRootsArray.push(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
            await testRollupExitRoot(newRootsArray);
        }
    });
});

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, blobHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} blobHashData - Blob hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
async function calculateAccInputHashFromCalldata(
    blobDataArray: BlobDataStructFeijoa[],
    coinbase: any,
    lastAccInputHash: any,
    polygonZkEVMGlobalExitRoot: any
) {
    let currentAccInputHash = lastAccInputHash;

    for (let i = 0; i < blobDataArray.length; i++) {
        const blobType = blobDataArray[i].blobType;
        const blobTypeParams = blobDataArray[i].blobTypeParams;

        if (blobType == CALLDATA_BLOB_TYPE) {
            const [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactions] =
                ethers.AbiCoder.defaultAbiCoder().decode(["uint64", "uint64", "uint32", "bytes"], blobTypeParams);

            // check l1INfoHash
            const l1InfoHash = await polygonZkEVMGlobalExitRoot.l1InfoLeafMap(l1InfoLeafIndex);
            currentAccInputHash = calculateAccInputHashfeijoa(
                currentAccInputHash,
                l1InfoLeafIndex,
                l1InfoHash,
                maxSequenceTimestamp,
                coinbase,
                zkGasLimit,
                blobType,
                ethers.ZeroHash,
                ethers.ZeroHash,
                ethers.keccak256(transactions),
                ethers.ZeroHash
            );
        } else if (blobType == FORCED_BLOB_TYPE) {
            const [transactionsHash, forcedHashData] = ethers.AbiCoder.defaultAbiCoder().decode(
                ["bytes32", "bytes32"],
                blobTypeParams
            );

            // check l1INfoHash
            currentAccInputHash = calculateAccInputHashfeijoa(
                currentAccInputHash,
                0,
                ethers.ZeroHash,
                MAX_SEQUENCE_TIMESTAMP_FORCED,
                coinbase,
                ZK_GAS_LIMIT_BATCH,
                blobType,
                ethers.ZeroHash,
                ethers.ZeroHash,
                transactionsHash,
                forcedHashData
            );
        }
    }

    return currentAccInputHash;
}

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, blobHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} blobHashData - Blob hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
function calculateAccInputHashfeijoa(
    currentAccInputHash: any,
    l1InfoLeafIndex: any,
    l1InfoLeafHash: any,
    maxSequenceTimestamp: any,
    coinbase: any,
    zkGasLimit: any,
    blobType: any,
    z: any,
    y: any,
    blobL2HashData: any,
    forcedHashData: any
) {
    const hashKeccak = ethers.solidityPackedKeccak256(
        [
            "bytes32",
            "uint32",
            "bytes32",
            "uint64",
            "address",
            "uint64",
            "uint8",
            "bytes32",
            "bytes32",
            "bytes32",
            "bytes32",
        ],
        [
            currentAccInputHash,
            l1InfoLeafIndex,
            l1InfoLeafHash,
            maxSequenceTimestamp,
            coinbase,
            zkGasLimit,
            blobType,
            z,
            y,
            blobL2HashData,
            forcedHashData,
        ]
    );

    return hashKeccak;
}

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}
