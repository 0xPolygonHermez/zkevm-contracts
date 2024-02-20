/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMEtrog,
    PolygonRollupBaseEtrog,
    TokenWrapped,
    Address,
    PolygonZkEVM,
    PolygonZkEVMExistentEtrog,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;

type BatchDataStructEtrog = PolygonRollupBaseEtrog.BatchDataStruct;

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
    let rollupManagerContract: PolygonRollupManagerMock;

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
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days

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
        const precalculatezkEVM = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculatezkEVM, precalculateBridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as any;

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as any;

        // deploy PolygonZkEVM
        const PolygonZkEVMFactory = await ethers.getContractFactory("PolygonZkEVMUpgraded");
        polygonZkEVMContract = (await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                verifierContract.target,
                polygonZkEVMBridgeContract.target,
                chainID,
                forkID,
                0,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as any;
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculatezkEVM).to.be.equal(polygonZkEVMContract.target);

        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerMock");
        rollupManagerContract = PolygonRollupManagerFactory.attach(polygonZkEVMContract.target) as any;

        await polygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeout,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version
        );

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            "0x"
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));

        // DEploy new zkEVM
        const PolygonZkEVMV2ExistentFactory = await ethers.getContractFactory("PolygonZkEVMExistentEtrog");

        const newPolygonZkEVMContract = (await upgrades.deployProxy(PolygonZkEVMV2ExistentFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as any as PolygonZkEVMExistentEtrog;

        //const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
        const txRollupManager = await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactory, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
            unsafeAllowRenames: false,
            call: {
                fn: "initialize",
                args: [
                    trustedAggregator.address,
                    pendingStateTimeoutDefault,
                    trustedAggregatorTimeout,
                    admin.address,
                    timelock.address,
                    emergencyCouncil.address,
                    newPolygonZkEVMContract.target,
                    verifierContract.target,
                    forkID,
                    chainID,
                ],
            },
        });
    });

    it("Cannot initialzie again", async () => {
        await expect(
            rollupManagerContract.initialize(
                trustedAggregator.address,
                pendingStateTimeoutDefault,
                trustedAggregatorTimeout,
                admin.address,
                timelock.address,
                emergencyCouncil.address,
                timelock.address,
                verifierContract.target,
                forkID,
                chainID
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check the initalized parameters", async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await rollupManagerContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeout);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("0.1"));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther("10"));

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
        expect(await rollupManagerContract.multiplierBatchFee()).to.be.equal(1002);
        await expect(rollupManagerContract.setMultiplierBatchFee(1023)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(rollupManagerContract.connect(admin).setMultiplierBatchFee(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "InvalidRangeMultiplierBatchFee"
        );

        await expect(rollupManagerContract.connect(admin).setMultiplierBatchFee(1020))
            .to.emit(rollupManagerContract, "SetMultiplierBatchFee")
            .withArgs(1020);

        expect(await rollupManagerContract.multiplierBatchFee()).to.be.equal(1020);

        // verifyBatchTImetarget
        expect(await rollupManagerContract.verifyBatchTimeTarget()).to.be.equal(60 * 30);

        await expect(rollupManagerContract.setVerifyBatchTimeTarget(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(
            rollupManagerContract.connect(admin).setVerifyBatchTimeTarget(60 * 60 * 24 + 1)
        ).to.be.revertedWithCustomError(rollupManagerContract, "InvalidRangeBatchTimeTarget");

        await expect(rollupManagerContract.connect(admin).setVerifyBatchTimeTarget(60))
            .to.emit(rollupManagerContract, "SetVerifyBatchTimeTarget")
            .withArgs(60);
        expect(await rollupManagerContract.verifyBatchTimeTarget()).to.be.equal(60);

        // batch Fee
        // verifyBatchTImetarget
        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("0.1"));

        await expect(rollupManagerContract.setBatchFee(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );
        await expect(rollupManagerContract.connect(admin).setBatchFee(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "BatchFeeOutOfRange"
        );

        await expect(rollupManagerContract.connect(admin).setBatchFee(ethers.parseEther("10")))
            .to.emit(rollupManagerContract, "SetBatchFee")
            .withArgs(ethers.parseEther("10"));

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("10"));
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
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMEtrog");
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
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMEtrog;
        const newSequencedBatch = 1;

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
            .to.emit(newZkEVMContract, "InitialSequenceBatches")
            .to.emit(rollupManagerContract, "OnSequenceBatches")
            .withArgs(newCreatedRollupID, newSequencedBatch);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

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

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID2);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBatchSequenced).to.be.equal(newSequencedBatch);
        expect(rollupData.lastVerifiedBatch).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBatchData = await rollupManagerContract.getRollupSequencedBatches(
            newCreatedRollupID,
            newSequencedBatch
        );

        expect(sequencedBatchData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBatchFee();

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

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
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
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    currentVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBatchBelowLastVerifiedBatch");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    3,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(ethers.ZeroHash);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify batch
        await expect(
            rollupManagerContract
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
            .to.emit(rollupManagerContract, "VerifyBatchesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        expect(finalAggregatorMatic).to.equal(((initialAggregatorMatic + maticAmount) * 2n) / 3n);

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

        // Force batches

        // Check force batches are unactive
        await expect(newZkEVMContract.forceBatch("0x", 0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBatchNotAllowed"
        );
        await expect(newZkEVMContract.sequenceForceBatches([])).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBatchNotAllowed"
        );

        await expect(await newZkEVMContract.forceBatchAddress()).to.be.equal(admin.address);
        await expect(newZkEVMContract.connect(admin).setForceBatchAddress(deployer.address))
            .to.emit(newZkEVMContract, "SetForceBatchAddress")
            .withArgs(deployer.address);
        expect(await newZkEVMContract.forceBatchAddress()).to.be.equal(deployer.address);

        await expect(newZkEVMContract.connect(admin).setForceBatchAddress(ethers.ZeroAddress))
            .to.emit(newZkEVMContract, "SetForceBatchAddress")
            .withArgs(ethers.ZeroAddress);

        await expect(
            newZkEVMContract.connect(admin).setForceBatchAddress(deployer.address)
        ).to.be.revertedWithCustomError(newZkEVMContract, "ForceBatchesDecentralized");

        //snapshot emergency
        const snapshotEmergencyState = await takeSnapshot();
        await rollupManagerContract.connect(emergencyCouncil).activateEmergencyState();
        await expect(newZkEVMContract.forceBatch("0x", 0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "ForceBatchesNotAllowedOnEmergencyState"
        );
        await rollupManagerContract.connect(admin).deactivateEmergencyState();
        const currentTimestampEmergency = (await ethers.provider.getBlock("latest"))?.timestamp;

        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.be.equal(
            currentTimestampEmergency
        );

        await expect(newZkEVMContract.sequenceForceBatches([sequence])).to.be.revertedWithCustomError(
            newZkEVMContract,
            "HaltTimeoutNotExpiredAfterEmergencyState"
        );

        await snapshotEmergencyState.restore();

        const l2txDataForceBatch = "0x123456";
        const maticAmountForced = await rollupManagerContract.getForcedBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // Approve tokens
        await expect(polTokenContract.approve(newZkEVMContract.target, maticAmountForced)).to.emit(
            polTokenContract,
            "Approval"
        );

        const lastForcedBatch = (await newZkEVMContract.lastForceBatch()) + 1n;

        // Force batch
        await expect(newZkEVMContract.forceBatch(l2txDataForceBatch, maticAmountForced))
            .to.emit(newZkEVMContract, "ForceBatch")
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, "0x");

        const forcedBlock = await ethers.provider.getBlock("latest");
        const currentTimestamp2 = forcedBlock?.timestamp;

        const sequenceForced = {
            transactions: l2txDataForceBatch,
            forcedGlobalExitRoot: lastGlobalExitRoot,
            forcedTimestamp: currentTimestamp2,
            forcedBlockHashL1: forcedBlock?.parentHash,
        } as BatchDataStructEtrog;

        const snapshot3 = await takeSnapshot();
        // Sequence Batches
        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBatches([sequenceForced], currentTime, currentLastBatchSequenced++, trustedSequencer.address)
        ).to.emit(newZkEVMContract, "SequenceBatches");

        const expectedAccInputHash3 = calculateAccInputHashetrog(
            expectedAccInputHash2,
            ethers.keccak256(l2txDataForceBatch),
            lastGlobalExitRoot,
            currentTimestamp2,
            trustedSequencer.address,
            forcedBlock?.parentHash
        );
        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash3);

        await snapshot3.restore();
        // sequence force batches

        const timestampForceBatch = (await ethers.provider.getBlock("latest"))?.timestamp as any;
        // Increment timestamp
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        // sequence force batch
        await expect(newZkEVMContract.sequenceForceBatches([sequenceForced]))
            .to.emit(newZkEVMContract, "SequenceForceBatches")
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

        await expect(newZkEVMContract.setForceBatchTimeout(0)).to.be.revertedWithCustomError(
            newZkEVMContract,
            "OnlyAdmin"
        );

        await expect(
            newZkEVMContract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT)
        ).to.be.revertedWithCustomError(newZkEVMContract, "InvalidRangeForceBatchTimeout");

        await expect(newZkEVMContract.connect(admin).setForceBatchTimeout(0))
            .to.emit(newZkEVMContract, "SetForceBatchTimeout")
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
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMEtrog");
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
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMEtrog;
        const newSequencedBatch = 1;

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
            .to.emit(newZkEVMContract, "InitialSequenceBatches")
            .to.emit(rollupManagerContract, "OnSequenceBatches")
            .withArgs(newCreatedRollupID, newSequencedBatch);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

        // Assert new rollup created
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

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

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID2);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBatchSequenced).to.be.equal(newSequencedBatch);
        expect(rollupData.lastVerifiedBatch).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBatchData = await rollupManagerContract.getRollupSequencedBatches(
            newCreatedRollupID,
            newSequencedBatch
        );

        expect(sequencedBatchData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock("latest"))?.timestamp;

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
        const currentLastBatchSequenced = 1;

        await expect(
            newZkEVMContract
                .connect(trustedSequencer)
                .sequenceBatches([sequence], currentTime, currentLastBatchSequenced, trustedSequencer.address)
        ).to.emit(newZkEVMContract, "SequenceBatches");

        const sequencedBatchData2 = await rollupManagerContract.getRollupSequencedBatches(newCreatedRollupID, 2);

        const currnetRollup = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(currnetRollup.lastBatchSequenced).to.be.equal(2);

        const lastBlock = await ethers.provider.getBlock("latest");
        const height = 32;

        const merkleTreeGLobalExitRoot = new MerkleTreeBridge(height);

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
        const newVerifiedBatch = newSequencedBatch;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBatch = 0;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        await expect(
            rollupManagerContract.getInputSnarkBytes(
                newCreatedRollupID,
                3,
                4,
                newLocalExitRoot,
                ethers.ZeroHash,
                newStateRoot
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "OldAccInputHashDoesNotExist");

        await expect(
            rollupManagerContract.getInputSnarkBytes(
                newCreatedRollupID,
                2,
                3,
                newLocalExitRoot,
                ethers.ZeroHash,
                newStateRoot
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatches(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    newVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "TrustedAggregatorTimeoutNotExpired");

        await rollupManagerContract.connect(admin).setTrustedAggregatorTimeout(0);

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatches(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    currentVerifiedBatch + _MAX_VERIFY_BATCHES + 1,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ExceedMaxVerifyBatches");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatches(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    currentVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBatchBelowLastVerifiedBatch");

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                pendingState,
                currentVerifiedBatch,
                3,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(ethers.ZeroHash);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify batch
        await expect(
            rollupManagerContract.verifyBatches(
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
            .to.emit(rollupManagerContract, "VerifyBatches")
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, deployer.address);

        const timestampVerifyBatches = (await ethers.provider.getBlock("latest"))?.timestamp;
        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        expect(finalAggregatorMatic).to.equal(((initialAggregatorMatic + maticAmount) * 1n) / 3n);
        const createdPendingState = 1;

        const snapshotVerify = await takeSnapshot();
        await rollupManagerContract.connect(admin).setPendingStateTimeout(0);

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                0,
                5,
                6,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "OldStateRootDoesNotExist");

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                0,
                newVerifiedBatch,
                0,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.reverted;

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                createdPendingState + 1,
                currentVerifiedBatch,
                newVerifiedBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "PendingStateDoesNotExist");

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                createdPendingState,
                currentVerifiedBatch,
                newVerifiedBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "InitNumBatchDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                createdPendingState,
                newVerifiedBatch,
                newVerifiedBatch + 1,
                newLocalExitRoot,
                ethers.toQuantity(ethers.MaxUint256),
                beneficiary.address,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewStateRootNotInsidePrime");

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                createdPendingState,
                newVerifiedBatch,
                newVerifiedBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "VerifyBatches")
            .withArgs(newCreatedRollupID, newVerifiedBatch + 1, newStateRoot, newLocalExitRoot, deployer.address);

        let rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastBatchSequenced).to.be.equal(2);
        expect(rollupDataV.lastVerifiedBatch).to.be.equal(newVerifiedBatch + 1);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataV.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    0,
                    0,
                    newVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBatchBelowLastVerifiedBatch");

        await snapshotVerify.restore();
        await rollupManagerContract.connect(admin).setPendingStateTimeout(1);

        await expect(
            rollupManagerContract.verifyBatches(
                newCreatedRollupID,
                createdPendingState,
                newVerifiedBatch,
                newVerifiedBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "VerifyBatches")
            .withArgs(newCreatedRollupID, newVerifiedBatch + 1, newStateRoot, newLocalExitRoot, deployer.address);

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(2);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastBatchSequenced).to.be.equal(2);
        expect(rollupDataV.lastVerifiedBatch).to.be.equal(newVerifiedBatch);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(1);
        expect(rollupDataV.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);

        await snapshotVerify.restore();

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    newVerifiedBatch + 1,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        )
            .to.emit(rollupManagerContract, "VerifyBatchesTrustedAggregator")
            .withArgs(
                newCreatedRollupID,
                newVerifiedBatch + 1,
                newStateRoot,
                newLocalExitRoot,
                trustedAggregator.address
            );

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataV.lastBatchSequenced).to.be.equal(2);
        expect(rollupDataV.lastVerifiedBatch).to.be.equal(newVerifiedBatch + 1);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupDataV.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);

        await snapshotVerify.restore();
        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBatch,
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
                newVerifiedBatch,
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
                newVerifiedBatch,
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
                newVerifiedBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "InitNumBatchDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                createdPendingState,
                createdPendingState,
                newVerifiedBatch,
                newVerifiedBatch,
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
                newVerifiedBatch + 1,
                newLocalExitRoot,
                ethers.ZeroHash,
                zkProofFFlonk
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBatchDoesNotMatchPendingState");

        await expect(
            rollupManagerContract.proveNonDeterministicPendingState(
                newCreatedRollupID,
                0,
                createdPendingState,
                0,
                newVerifiedBatch,
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
                newVerifiedBatch,
                randomlocalRoot, // local exit root
                randomSTateRoot, // state root
                zkProofFFlonk
            )
        )
            .to.emit(rollupManagerContract, "OverridePendingState")
            .withArgs(
                newCreatedRollupID,
                newVerifiedBatch,
                randomSTateRoot,
                randomlocalRoot,
                trustedAggregator.address
            );

        expect(
            await rollupManagerContract.getRollupBatchNumToStateRoot(newCreatedRollupID, newVerifiedBatch)
        ).to.be.equal(randomSTateRoot);

        rollupDataV = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupDataV.lastPendingState).to.be.equal(0);
        expect(rollupDataV.lastLocalExitRoot).to.be.equal(randomlocalRoot);
        expect(rollupDataV.lastBatchSequenced).to.be.equal(2);
        expect(rollupDataV.lastVerifiedBatch).to.be.equal(newVerifiedBatch);
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

        expect(currentPendingStateTransition.timestamp).to.be.equal(timestampVerifyBatches);
        expect(currentPendingStateTransition.lastVerifiedBatch).to.be.equal(newVerifiedBatch);
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
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, pendingStateNum);

        // Assert new root
        expect(
            await rollupManagerContract.getRollupBatchNumToStateRoot(newCreatedRollupID, newVerifiedBatch)
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
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMEtrog");
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
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} batchHashData - Batch hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
function calculateAccInputHashetrog(
    oldAccInputHash: any,
    batchHashData: any,
    globalExitRoot: any,
    timestamp: any,
    sequencerAddress: any,
    forcedBlockHash: any
) {
    const hashKeccak = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "bytes32", "uint64", "address", "bytes32"],
        [oldAccInputHash, batchHashData, globalExitRoot, timestamp, sequencerAddress, forcedBlockHash]
    );

    return hashKeccak;
}

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}
