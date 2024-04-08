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
    PolygonZkEVMEtrog,
    PolygonRollupBaseEtrog,
    TokenWrapped,
    Address,
    PolygonZkEVM,
    PolygonZkEVMExistentEtrog,
    PolygonRollupBaseFeijoa,
    PolygonRollupManager,
    PolygonRollupManagerMockPrevious,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBlobHashData} = contractUtils;

type BlobDataStructEtrog = PolygonRollupBaseEtrog.BatchDataStruct;
type BlobDataStructFeijoa = PolygonRollupBaseFeijoa.BlobDataStruct;
type VerifyBlobData = PolygonRollupManager.VerifySequenceDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}

const SIGNATURE_BYTES = 32 + 32 + 1;
const EFFECTIVE_PERCENTAGE_BYTES = 1;
const _MAX_VERIFY_BATCHES = 1000;
const _HALT_AGGREGATION_TIMEOUT = 60 * 60 * 24 * 7;

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
const MAX_SEQUENCE_TIMESTAMP_FORCED = 18446744073709551615n; //

describe("Polygon Rollup manager upgraded", () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;

    let polygonZkEVMContract: PolygonZkEVM;
    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let rollupManagerContractPrevious: PolygonRollupManagerMockPrevious;
    let rollupManagerContract: PolygonRollupManager;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const chainID = 1000;
    const networkName = "zkevm";
    const version = "0.0.1";
    const forkID = 0;
    const genesisRoot = "0x0000000000000000000000000000000000000000000000000000000000000001";

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
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory(
            "PolygonZkEVMGlobalExitRootV2Previous"
        );
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
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerMockPrevious");

        rollupManagerContractPrevious = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as unknown as PolygonRollupManagerMockPrevious;

        await rollupManagerContractPrevious.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContractPrevious.target);

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContractPrevious.target,
            "0x"
        );

        // Initialize Mock
        await rollupManagerContractPrevious.initializeMock(
            trustedAggregator.address,
            pendingStateTimeoutDefault,
            trustedAggregatorTimeout,
            admin.address,
            timelock.address,
            emergencyCouncil.address
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));

        /// Create a new rollup
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID2 = chainID;
        const networkName = "zkevm";
        const forkID = 9;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;
        const gasTokenNetwork = 0;

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMEtrog");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContractPrevious.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContractPrevious
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
            .to.emit(rollupManagerContractPrevious, "AddNewRollupType")
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
        const createdRollupType = await rollupManagerContractPrevious.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContractPrevious.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMEtrog;
        const newSequencedBatch = 1;
        await expect(
            rollupManagerContractPrevious
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID2,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContractPrevious, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID2, gasTokenAddress)
            .to.emit(newZkEVMContract, "InitialSequenceBatches")
            .to.emit(rollupManagerContractPrevious, "OnSequenceBatches")
            .withArgs(newCreatedRollupID, newSequencedBatch);

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

        const blockCreatedRollup = await ethers.provider.getBlock("latest");
        // Assert new rollup created
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContractPrevious.getBatchFee();

        const sequence = {
            transactions: l2txData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as BatchDataStructEtrog;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Sequence Batches
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBatchSequenced = 1;

        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBatches([sequence], currentTime, currentLastBatchSequenced++, trustedSequencer.address)
        ).to.emit(newZkEVMContract, "SequenceBatches");

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

        const expectedAccInputHash2 = calculateAccInputHashetrog(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            rootSC,
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash
        );
        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Verify batches

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

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBatch = 0;

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        //merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        await expect(
            rollupManagerContractPrevious
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    newVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        )
            .to.emit(rollupManagerContractPrevious, "VerifyBatchesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(ethers.ZeroHash, rootRollups);

        expect(await polygonZkEVMGlobalExitRoot.depositCount()).to.be.equal(1);

        // Check rollup 1 before upgrade
        const rollupDataFinal = await rollupManagerContractPrevious.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataFinal.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupDataFinal.chainID).to.be.equal(chainID);
        expect(rollupDataFinal.verifier).to.be.equal(verifierContract.target);
        expect(rollupDataFinal.forkID).to.be.equal(forkID);
        expect(rollupDataFinal.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataFinal.lastBatchSequenced).to.be.equal(newVerifiedBatch);
        expect(rollupDataFinal.lastVerifiedBatch).to.be.equal(newVerifiedBatch);
        expect(rollupDataFinal.lastPendingState).to.be.equal(0);
        expect(rollupDataFinal.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataFinal.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);
        expect(rollupDataFinal.rollupTypeID).to.be.equal(1);
        expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

        expect(
            await rollupManagerContractPrevious.getRollupBatchNumToStateRoot(newCreatedRollupID, newVerifiedBatch)
        ).to.be.equal(newStateRoot);

        // Upgrade all contracts
        const newPolygonRollupManager = await ethers.getContractFactory("PolygonRollupManager");
        const txRollupManager = await upgrades.upgradeProxy(
            rollupManagerContractPrevious.target,
            newPolygonRollupManager,
            {
                constructorArgs: [
                    polygonZkEVMGlobalExitRoot.target,
                    polTokenContract.target,
                    polygonZkEVMBridgeContract.target,
                ],
                unsafeAllow: ["constructor", "state-variable-immutable"],
                unsafeAllowRenames: false,
                call: {
                    fn: "initialize",
                    args: [],
                },
            }
        );
        rollupManagerContract = (await newPolygonRollupManager.attach(
            rollupManagerContractPrevious.target
        )) as PolygonRollupManager;

        await txRollupManager.waitForDeployment();

        // Check rollup 1 after upgrade
        const rollupDataFinal2 = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);

        expect(rollupDataFinal2.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupDataFinal2.chainID).to.be.equal(chainID);
        expect(rollupDataFinal2.verifier).to.be.equal(verifierContract.target);
        expect(rollupDataFinal2.forkID).to.be.equal(forkID);
        expect(rollupDataFinal2.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataFinal2.lastSequenceNum).to.be.equal(0);
        expect(rollupDataFinal2.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupDataFinal2.lastPendingState).to.be.equal(0);
        expect(rollupDataFinal2.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataFinal2.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupDataFinal2.rollupTypeID).to.be.equal(1);
        expect(rollupDataFinal2.rollupCompatibilityID).to.be.equal(0);

        // Check root
        expect(await rollupManagerContract.getRollupsequenceNumToStateRoot(newCreatedRollupID, 0)).to.be.equal(
            newStateRoot
        );

        // Upgrade global exit root
        const newGlobalExitRoot = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        const txGlobalExitRoot = await upgrades.upgradeProxy(polygonZkEVMGlobalExitRoot.target, newGlobalExitRoot, {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
            unsafeAllowRenames: false,
            call: {
                fn: "initialize",
                args: [],
            },
        });

        expect(await polygonZkEVMGlobalExitRoot.depositCount()).to.be.equal(2);
        polygonZkEVMGlobalExitRoot = (await newGlobalExitRoot.attach(
            polygonZkEVMGlobalExitRoot.target
        )) as PolygonZkEVMGlobalExitRootV2;

        // update to a new rollup type
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

        await expect(rollupManagerContract.connect(timelock).updateRollup(newZKEVMAddress, feijoaRollupType, "0x"))
            .to.emit(rollupManagerContract, "UpdateRollup")
            .withArgs(newRollupTypeID, feijoaRollupType, 0);

        // check layout rollup
        // Check rollup 1 after upgrade
        const rollupDataFinal3 = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataFinal3.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupDataFinal3.chainID).to.be.equal(chainID);
        expect(rollupDataFinal3.verifier).to.be.equal(verifierContract.target);
        expect(rollupDataFinal3.forkID).to.be.equal(forkID);
        expect(rollupDataFinal3.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataFinal3.lastSequenceNum).to.be.equal(0);
        expect(rollupDataFinal3.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupDataFinal3.lastPendingState).to.be.equal(0);
        expect(rollupDataFinal3.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataFinal3.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupDataFinal3.rollupTypeID).to.be.equal(feijoaRollupType);
        expect(rollupDataFinal3.rollupCompatibilityID).to.be.equal(0);
    });

    it("Cannot initialzie again", async () => {
        await expect(rollupManagerContract.initialize()).to.be.revertedWith(
            "Initializable: contract is already initialized"
        );
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

    it("Check admin parameters", async () => {
        expect(await rollupManagerContract.multiplierZkGasPrice()).to.be.equal(1002);
        await expect(rollupManagerContract.setMultiplierZkGasPrice(1023)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(rollupManagerContract.connect(admin).setMultiplierZkGasPrice(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "InvalidRangeMultiplierZkGasPrice"
        );

        await expect(rollupManagerContract.connect(admin).setMultiplierZkGasPrice(1020))
            .to.emit(rollupManagerContract, "SetMultiplierZkGasPrice")
            .withArgs(1020);

        expect(await rollupManagerContract.multiplierZkGasPrice()).to.be.equal(1020);

        // verifyBlobTImetarget
        expect(await rollupManagerContract.verifySequenceTimeTarget()).to.be.equal(60 * 30);

        await expect(rollupManagerContract.setVerifySequenceTimeTarget(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(
            rollupManagerContract.connect(admin).setVerifySequenceTimeTarget(60 * 60 * 24 + 1)
        ).to.be.revertedWithCustomError(rollupManagerContract, "InvalidRangeSequenceTimeTarget");

        await expect(rollupManagerContract.connect(admin).setVerifySequenceTimeTarget(60))
            .to.emit(rollupManagerContract, "SetVerifySequenceTimeTarget")
            .withArgs(60);
        expect(await rollupManagerContract.verifySequenceTimeTarget()).to.be.equal(60);

        // blob Fee
        // verifyBlobTImetarget
        const zkGasPrice = ethers.parseEther("0.1") / (await rollupManagerContract.ZK_GAS_LIMIT_BATCH());
        expect(await rollupManagerContract.getZkGasPrice()).to.be.equal(zkGasPrice);

        await expect(rollupManagerContract.setZkGasPrice(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(rollupManagerContract.connect(admin).setZkGasPrice(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "zkGasPriceOfRange"
        );

        await expect(rollupManagerContract.connect(admin).setZkGasPrice(ethers.parseEther("1")))
            .to.emit(rollupManagerContract, "SetZkGasPrice")
            .withArgs(ethers.parseEther("1"));

        expect(await rollupManagerContract.getZkGasPrice()).to.be.equal(ethers.parseEther("1"));

        // blob Fee
        expect(await rollupManagerContract.aggregateRollupVerifier()).to.be.equal(ethers.ZeroAddress);

        await expect(rollupManagerContract.setAggregateRollupVerifier(deployer.address)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(
            rollupManagerContract.connect(admin).setAggregateRollupVerifier(deployer.address)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        await expect(rollupManagerContract.connect(timelock).setAggregateRollupVerifier(deployer.address))
            .to.emit(rollupManagerContract, "SetAggregateRollupVerifier")
            .withArgs(deployer.address);

        expect(await rollupManagerContract.aggregateRollupVerifier()).to.be.equal(deployer.address);
    });

    it("should check full flow etrog", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID2 = chainID + 1;
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
        const newRollupTypeID = 3;
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
                chainID2,
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
                    chainID2,
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
                    chainID2,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 2; // 1 is zkEVM
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 2,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMFeijoa;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID2,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID2, gasTokenAddress)
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
                    chainID2,
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
        expect(rollupData.chainID).to.be.equal(chainID2);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastSequenceNum).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(3);
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

        // Sequence Blobs
        const expectedAccInputHash2 = await calculateAccInputHashFromCalldata(
            [blob],
            trustedSequencer.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

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
        // const leafValueJs = calculateGlobalExitRootLeaf(lastGlobalExitRootS, lastBlockHash, lastBlock?.timestamp);
        // //merkleTreeGLobalExitRoot.add(leafValueJs);

        // const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        // const rootJS = merkleTreeGLobalExitRoot.getRoot();

        //expect(rootSC).to.be.equal(rootJS);

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

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        const VerifyBlobData = {
            rollupID: newCreatedRollupID,
            pendingStateNum: pendingState,
            initSequenceNum: currentVerifiedBlob,
            finalSequenceNum: newVerifiedBlob,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifySequencesTrustedAggregatorMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        const rollupData1 = await rollupManagerContract.rollupIDToRollupData(1);

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(rollupData1.lastLocalExitRoot); //
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

        //expect(finalAggregatorMatic).to.equal(((initialAggregatorMatic + maticAmount) * 2n) / 3n);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);

        const indexLeafRollup = 1;
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeafRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeafRollup, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(
                newLocalExitRoot,
                proofRollups,
                indexLeafRollup,
                rootRollups
            )
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
        const claimIndex = computeGlobalIndex(indexLeaf, indexLeafRollup, false);
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                claimIndex,
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
            .withArgs(claimIndex, originNetwork, tokenAddress, destinationAddress, amount)
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
                claimIndex,
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

        await expect(await newZkEVMContract.forceBlobAddress()).to.be.equal(admin.address);
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

    it("should check full flow no trusted aggreagtor", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID2 = chainID + 1;
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
        const newRollupTypeID = 3;
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
                chainID2,
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
                    chainID2,
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
                    chainID2,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 2; // 1 is zkEVM
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 2,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMFeijoa;
        const newSequencedBlob = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID2,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID2, gasTokenAddress)
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

        // Cannot create 2 chains with the same chainID2
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID2,
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
            "0x",
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
        expect(rollupData.chainID).to.be.equal(chainID2);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastSequenceNum).to.be.equal(newSequencedBlob);
        expect(rollupData.lastVerifiedSequenceNum).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(3);
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

        // Sequence Blobs
        const expectedAccInputHash2 = await calculateAccInputHashFromCalldata(
            [blob],
            trustedSequencer.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBlobs([blob], trustedSequencer.address, expectedAccInputHash2 as any)
        ).to.emit(newZkEVMContract, "SequenceBlobs");

        const currentLastBlobSequenced = 1;

        const height = 32;

        const merkleTreeGLobalExitRoot = new MerkleTreeBridge(height);

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        const rootJS = merkleTreeGLobalExitRoot.getRoot();

        //expect(rootSC).to.be.equal(rootJS);

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
        const newVerifiedBlob = newSequencedBlob;
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
                .connect(trustedAggregator)
                .verifySequencesMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "TrustedAggregatorTimeoutNotExpired");

        await rollupManagerContract.connect(admin).setTrustedAggregatorTimeout(0);
        VerifyBlobData.finalSequenceNum = currentVerifiedBlob + _MAX_VERIFY_BATCHES + 1;
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        VerifyBlobData.finalSequenceNum = currentVerifiedBlob;

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifySequencesMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumSequenceBelowLastVerifiedSequence");
        VerifyBlobData.finalSequenceNum = 3;

        await expect(
            rollupManagerContract.verifySequencesMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        VerifyBlobData.finalSequenceNum = newVerifiedBlob;

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [VerifyBlobData, VerifyBlobData],
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupIDNotAscendingOrder");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(ethers.ZeroHash);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify blob
        await expect(
            rollupManagerContract.verifySequencesMultiProof([VerifyBlobData], beneficiary.address, zkProofFFlonk)
        )
            .to.emit(rollupManagerContract, "VerifySequences")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, deployer.address);

        const timestampVerifyBlobs = (await ethers.provider.getBlock("latest"))?.timestamp;
        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        //expect(finalAggregatorMatic).to.equal(((initialAggregatorMatic + maticAmount) * 1n) / 3n);
        const createdPendingState = 1;

        const snapshotVerify = await takeSnapshot();
        await rollupManagerContract.connect(admin).setPendingStateTimeout(0);

        const VerifyBlobData2 = {
            rollupID: newCreatedRollupID,
            pendingStateNum: 0,
            initSequenceNum: 5,
            finalSequenceNum: 6,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        await expect(
            rollupManagerContract.verifySequencesMultiProof([VerifyBlobData2], beneficiary.address, zkProofFFlonk)
        ).to.be.revertedWithCustomError(rollupManagerContract, "OldStateRootDoesNotExist");

        const VerifyBlobData3 = {
            rollupID: newCreatedRollupID,
            pendingStateNum: 0,
            initSequenceNum: newVerifiedBlob,
            finalSequenceNum: 0,
            newLocalExitRoot: newLocalExitRoot,
            newStateRoot: newStateRoot,
        } as VerifyBlobData;

        await expect(
            rollupManagerContract.verifySequencesMultiProof([VerifyBlobData3], beneficiary.address, zkProofFFlonk)
        ).to.be.reverted;

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: createdPendingState + 1,
                        initSequenceNum: currentVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "PendingStateDoesNotExist");

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: createdPendingState,
                        initSequenceNum: currentVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "InitSequenceNumDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: createdPendingState,
                        initSequenceNum: newVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: ethers.toQuantity(ethers.MaxUint256),
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewStateRootNotInsidePrime");

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: createdPendingState,
                        initSequenceNum: newVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "VerifySequences")
            .withArgs(newCreatedRollupID, newVerifiedBlob + 1, newStateRoot, newLocalExitRoot, deployer.address);

        let rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastSequenceNum).to.be.equal(2);
        expect(rollupDataV.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob + 1);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataV.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifySequencesTrustedAggregatorMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: 0,
                        initSequenceNum: 0,
                        finalSequenceNum: newVerifiedBlob,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBlobBelowLastVerifiedBlob");

        await snapshotVerify.restore();
        await rollupManagerContract.connect(admin).setPendingStateTimeout(1);

        await expect(
            rollupManagerContract.verifySequencesMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: createdPendingState,
                        initSequenceNum: newVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "VerifySequences")
            .withArgs(newCreatedRollupID, newVerifiedBlob + 1, newStateRoot, newLocalExitRoot, deployer.address);

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(2);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastSequenceNum).to.be.equal(2);
        expect(rollupDataV.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(1);
        expect(rollupDataV.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);

        await snapshotVerify.restore();

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifySequencesTrustedAggregatorMultiProof(
                [
                    {
                        rollupID: newCreatedRollupID,
                        pendingStateNum: pendingState,
                        initSequenceNum: currentVerifiedBlob,
                        finalSequenceNum: newVerifiedBlob + 1,
                        newLocalExitRoot: newLocalExitRoot,
                        newStateRoot: newStateRoot,
                    },
                ],
                beneficiary.address,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "VerifyBlobsTrustedAggregator")
            .withArgs(
                newCreatedRollupID,
                newVerifiedBlob + 1,
                newStateRoot,
                newLocalExitRoot,
                trustedAggregator.address
            );

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastSequenceNum).to.be.equal(2);
        expect(rollupDataV.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob + 1);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataV.lastVerifiedSequenceBeforeUpgrade).to.be.equal(0);

        await snapshotVerify.restore();
        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBlob,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "StoredRootMustBeDifferentThanNewRoot");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                5,
                newVerifiedBlob,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "OldStateRootDoesNotExist");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                3, // init pending state
                2,
                0,
                newVerifiedBlob,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "PendingStateDoesNotExist");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                createdPendingState,
                createdPendingState,
                0,
                newVerifiedBlob,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "initSequenceNumDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                createdPendingState,
                createdPendingState,
                newVerifiedBlob,
                newVerifiedBlob,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalPendingStateNumInvalid");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBlob + 1,
                newLocalExitRoot,
                ethers.ZeroHash,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBlobDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBlob,
                newLocalExitRoot,
                ethers.ZeroHash,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "ProveNonDeterministicPendingState")
            .withArgs(newStateRoot, ethers.ZeroHash);

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(true);

        await snapshotVerify.restore();

        const randomSTateRoot = ethers.hexlify(ethers.randomBytes(32));
        const randomlocalRoot = ethers.hexlify(ethers.randomBytes(32));

        await expect(
            rollupManagerContract.connect(trustedAggregator).overridePendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBlob,
                randomlocalRoot, // local exit root
                randomSTateRoot, // state root
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "OverridePendingState")
            .withArgs(newCreatedRollupID, newVerifiedBlob, randomSTateRoot, randomlocalRoot, trustedAggregator.address);

        expect(
            await rollupManagerContract.getRollupsequenceNumToStateRoot(newCreatedRollupID, newVerifiedBlob)
        ).to.be.equal(randomSTateRoot);

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(randomlocalRoot);
        expect(rollupDataV.lastSequenceNum).to.be.equal(2);
        expect(rollupDataV.lastVerifiedSequenceNum).to.be.equal(newVerifiedBlob);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(0);

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(false);
        expect(await rollupManagerContract.trustedAggregatorTimeout()).to.be.equal(_HALT_AGGREGATION_TIMEOUT);

        await snapshotVerify.restore();

        const pendingStateNum = 1;
        // check revert reasons:

        expect(
            await rollupManagerContract.isPendingStateConsolidable(newCreatedRollupID, createdPendingState)
        ).to.be.equal(false);

        const currentPendingStateTransition = await rollupManagerContract.getRollupPendingStateTransitions(
            newCreatedRollupID,
            createdPendingState
        );

        expect(currentPendingStateTransition.timestamp).to.be.equal(timestampVerifyBlobs);
        expect(currentPendingStateTransition.lastVerifiedSequence).to.be.equal(newVerifiedBlob);
        expect(currentPendingStateTransition.exitRoot).to.be.equal(newLocalExitRoot);
        expect(currentPendingStateTransition.stateRoot).to.be.equal(newStateRoot);

        await expect(
            rollupManagerContract.consolidatePendingState(newCreatedRollupID, pendingStateNum)
        ).to.be.revertedWithCustomError(rollupManagerContract, "PendingStateNotConsolidable");

        // try emergency
        await rollupManagerContract.connect(emergencyCouncil).activateEmergencyState();
        await rollupManagerContract.connect(admin).setPendingStateTimeout(0);

        await expect(
            rollupManagerContract.consolidatePendingState(newCreatedRollupID, pendingStateNum)
        ).to.be.revertedWithCustomError(rollupManagerContract, "OnlyNotEmergencyState");
        await snapshotVerify.restore();

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .consolidatePendingState(newCreatedRollupID, pendingStateNum + 1)
        ).to.be.revertedWithCustomError(rollupManagerContract, "PendingStateInvalid");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .consolidatePendingState(newCreatedRollupID, pendingStateNum)
        )
            .to.emit(rollupManagerContract, "ConsolidatePendingState")
            .withArgs(newCreatedRollupID, newVerifiedBlob, newStateRoot, newLocalExitRoot, pendingStateNum);

        // Assert new root
        expect(
            await rollupManagerContract.getRollupsequenceNumToStateRoot(newCreatedRollupID, newVerifiedBlob)
        ).to.be.equal(newStateRoot);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const indexRollup = 1;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexRollup, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexRollup, rootRollups)
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
        const globalIndex = computeGlobalIndex(indexLeaf, indexRollup, false);
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                globalIndex,
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
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
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
                globalIndex,
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
        const newRollupTypeID = 3;
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

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(4)).to.be.revertedWithCustomError(
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

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, blobHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} blobHashData - Blob hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
function calculateAccInputHashetrog(
    oldAccInputHash: any,
    blobHashData: any,
    globalExitRoot: any,
    timestamp: any,
    sequencerAddress: any,
    forcedBlockHash: any
) {
    const hashKeccak = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "bytes32", "uint64", "address", "bytes32"],
        [oldAccInputHash, blobHashData, globalExitRoot, timestamp, sequencerAddress, forcedBlockHash]
    );

    return hashKeccak;
}

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}
