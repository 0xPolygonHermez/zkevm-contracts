/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, network, upgrades, config} from "hardhat";
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
    PolygonRollupManagerEmptyMock__factory,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {BlobUtils} from "../utils/BlobUtil";
import {array} from "yargs";
const {calculateSnarkInput, calculateAccInputHash, calculateBlobHashData} = contractUtils;

type BlobDataStructFeijoa = PolygonRollupBaseFeijoa.BlobDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;
const abi = new ethers.AbiCoder();

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

function encodeBlobTxBlobTypeParams(
    maxSequenceTimestamp: any,
    zkGasLimit: any,
    l1InfoLeafIndex: any,
    blobIndex: any,
    z: any,
    y: any,
    commitmentAndProof: any
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint64", "uint64", "uint32", "uint256", "bytes32", "bytes32", "bytes"],
        [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, blobIndex, z, y, commitmentAndProof]
    );
}

const CALLDATA_BLOB_TYPE = 0;
const BLOBTX_BLOB_TYPE = 1;
const FORCED_BLOB_TYPE = 2;

const ZK_GAS_LIMIT_BATCH = 100_000_000;
const MAX_SEQUENCE_TIMESTAMP_FORCED = 18446744073709551615n; // max uint64
describe("PolygonZkEVMFeijoa", () => {
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
    let PolygonZKEVMV2Contract: PolygonZkEVMFeijoa;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
    const _MAX_VERIFY_BATCHES = 1000;
    const _MAX_TRANSACTIONS_BYTE_LENGTH = 126976;
    // BRidge constants
    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    const globalExitRootL2Address = "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa" as unknown as Address;

    let firstDeployment = true;

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const chainID = 1000;
    const networkName = "zkevm";
    const forkID = 0;
    const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const rollupCompatibilityID = 0;
    const descirption = "zkevm test";
    const networkID = 1;

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;
    const gasTokenNetwork = 0;

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

        const nonceProxyZkevm = nonceProxyBridge + 1; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

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
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerEmptyMock");

        rollupManagerContract = await PolygonRollupManagerFactory.deploy();

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

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));

        // deploy consensus
        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMFeijoa");
        PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();
    });

    it.only("should check full flow with blobs", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as string);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;

        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);
        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify blobs
        const blobIndex = 0;
        const l2txData = ethers.randomBytes(144);
        const blobData = new Uint8Array(1 + 144);
        blobData.set(ethers.toBeArray(BLOBTX_BLOB_TYPE), 0);
        blobData.set(l2txData);

        const {blobs, blobVersionedHashes, kzgCommitments, kzgProofs} = BlobUtils.getBlobs(blobData);
        const z = ethers.randomBytes(32); // z = linearPoseidon(blobData)
        const [, y] = BlobUtils.computeKzgProof(blobs[blobIndex], z); // [proof, p(z)]
        const blobVersionedHash = blobVersionedHashes[blobIndex];
        const commitmentAndProof =
            ethers.hexlify(kzgCommitments[blobIndex]) + ethers.hexlify(kzgProofs[blobIndex]).slice(2);
        //     abi.encode(
        //     ["bytes[48]", "bytes[48]"],
        //     [kzgCommitments[blobIndex], kzgProofs[blobIndex]]
        // );

        const maticAmount = (await rollupManagerContract.getZkGasPrice()) * BigInt(ZK_GAS_LIMIT_BATCH);
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        const l1InfoIndex = 0;

        const blob = {
            blobType: BLOBTX_BLOB_TYPE,
            blobTypeParams: encodeBlobTxBlobTypeParams(
                currentTime,
                ZK_GAS_LIMIT_BATCH,
                l1InfoIndex,
                blobIndex,
                z,
                y,
                commitmentAndProof
            ),
        } as BlobDataStructFeijoa;

        const expectedAccInputHash2 = await calculateAccInputHashFromCalldata(
            [blob],
            trustedSequencer.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

        // Approve tokens
        await expect(
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount * 100n)
        ).to.emit(polTokenContract, "Approval");

        let currentBlobNonZeroL1InfoIndex = {
            blobType: BLOBTX_BLOB_TYPE,
            blobTypeParams: encodeBlobTxBlobTypeParams(
                currentTime,
                ZK_GAS_LIMIT_BATCH,
                1,
                blobIndex,
                z,
                y,
                commitmentAndProof
            ),
        };

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlobNonZeroL1InfoIndex],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlobNonZeroL1InfoIndex],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "Invalidl1InfoLeafIndex");

        let currentBlobWrongLengthCommitment = {
            blobType: BLOBTX_BLOB_TYPE,
            blobTypeParams: encodeBlobTxBlobTypeParams(
                currentTime,
                ZK_GAS_LIMIT_BATCH,
                l1InfoIndex,
                blobIndex,
                z,
                y,
                `0x${"00".repeat(97)}` // should be 96
            ),
        };

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlobWrongLengthCommitment],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlobWrongLengthCommitment],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "InvalidCommitmentAndProofLength");

        // Sequence Blobs
        const currentTimeExceed = Number((await ethers.provider.getBlock("latest"))?.timestamp);

        let currentBlob = {
            blobType: BLOBTX_BLOB_TYPE,
            blobTypeParams: encodeBlobTxBlobTypeParams(
                currentTimeExceed + 38,
                ZK_GAS_LIMIT_BATCH,
                l1InfoIndex,
                blobIndex,
                z,
                y,
                commitmentAndProof
            ),
        };

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlob],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlob],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "MaxTimestampSequenceInvalid");

        await expect(
            PolygonZKEVMV2Contract.sequenceBlobs([blob], trustedSequencer.address, expectedAccInputHash2)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyTrustedSequencer");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceZeroBlobs");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [blob],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "BlobHashNotFound");

        // TODO actually send a type 3 tx (blob) to receive hash with BLOBHASH opcode (line 615)

        const {signedSerializedTxn} = await new BlobUtils(
            ethers.provider as any,
            await getWallet(trustedSequencer.address)
        ).generateRawBlobTransaction(blobData, {
            to: PolygonZKEVMV2Contract.target as string,
            data: PolygonZKEVMV2Contract.interface.encodeFunctionData("sequenceBlobs", [
                [blob],
                trustedSequencer.address,
                ethers.ZeroHash,
            ]),
        });

        const txn = await ethers.provider.send("eth_sendRawTransaction", [signedSerializedTxn]);
        console.log({txn});

        // await expect(
        //     ethers.provider.send("eth_sendRawTransaction", [signedSerializedTxn])
        //     )
        // ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "FinalAccInputHashDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [blob],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");
    });

    it("should check the initalized parameters", async () => {
        // initialize zkEVM
        await expect(
            PolygonZKEVMV2Contract.initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyRollupManager");

        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        expect(await PolygonZKEVMV2Contract.admin()).to.be.equal(admin.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PolygonZKEVMV2Contract.networkName()).to.be.equal(networkName);
        expect(await PolygonZKEVMV2Contract.forceBlobTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

        // initialize zkEVM
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check admin functions", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        await expect(PolygonZKEVMV2Contract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

        await expect(PolygonZKEVMV2Contract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(PolygonZKEVMV2Contract, "SetTrustedSequencer")
            .withArgs(deployer.address);

        await expect(PolygonZKEVMV2Contract.setTrustedSequencerURL("0x1253")).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );
        await expect(PolygonZKEVMV2Contract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(PolygonZKEVMV2Contract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        await expect(PolygonZKEVMV2Contract.setForceBlobTimeout(0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

        // Set Forceblob timeout
        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBlobTimeout(FORCE_BATCH_TIMEOUT + 1)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "InvalidRangeForceBlobTimeout");

        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBlobTimeout(FORCE_BATCH_TIMEOUT)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "InvalidRangeForceBlobTimeout");

        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBlobTimeout(0))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBlobTimeout")
            .withArgs(0);

        expect(await PolygonZKEVMV2Contract.forceBlobTimeout()).to.be.equal(0);

        await rollupManagerContract.activateEmergencyState();
        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBlobTimeout(FORCE_BATCH_TIMEOUT))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBlobTimeout")
            .withArgs(FORCE_BATCH_TIMEOUT);
        await rollupManagerContract.deactivateEmergencyState();

        await expect(PolygonZKEVMV2Contract.transferAdminRole(deployer.address)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

        await expect(PolygonZKEVMV2Contract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(PolygonZKEVMV2Contract, "TransferAdminRole")
            .withArgs(deployer.address);

        await expect(PolygonZKEVMV2Contract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyPendingAdmin"
        );

        await expect(PolygonZKEVMV2Contract.connect(deployer).acceptAdminRole())
            .to.emit(PolygonZKEVMV2Contract, "AcceptAdminRole")
            .withArgs(deployer.address);

        // Check force blobs are unactive
        await expect(PolygonZKEVMV2Contract.forceBlob("0x", 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBlobNotAllowed"
        );
        await expect(PolygonZKEVMV2Contract.sequenceForceBlobs([])).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBlobNotAllowed"
        );

        // deployer now is the admin
        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBlobAddress(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyAdmin");

        await expect(PolygonZKEVMV2Contract.connect(deployer).setForceBlobAddress(ethers.ZeroAddress))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBlobAddress")
            .withArgs(ethers.ZeroAddress);

        await expect(
            PolygonZKEVMV2Contract.connect(deployer).setForceBlobAddress(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBlobsDecentralized");

        // Check revert onVerifySequences
        await expect(
            PolygonZKEVMV2Contract.connect(admin).onVerifySequences(0, ethers.ZeroHash, trustedAggregator.address)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyRollupManager");
    });

    it("should generateInitializeTransaction with huge metadata", async () => {
        const hugeMetadata = `0x${"00".repeat(Number(2n ** 16n))}`;
        await expect(
            PolygonZKEVMV2Contract.generateInitializeTransaction(0, ethers.ZeroAddress, 1, hugeMetadata)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "HugeTokenMetadataNotSupported");
    });

    it("should check full flow", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;

        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);
        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = (await rollupManagerContract.getZkGasPrice()) * BigInt(ZK_GAS_LIMIT_BATCH);
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        const l1InfoIndex = 0;

        const blob = {
            blobType: 0,
            blobTypeParams: encodeCalldatBlobTypeParams(currentTime, ZK_GAS_LIMIT_BATCH, l1InfoIndex, l2txData),
        } as BlobDataStructFeijoa;

        const expectedAccInputHash2 = await calculateAccInputHashFromCalldata(
            [blob],
            trustedSequencer.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

        // Approve tokens
        await expect(
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount * 100n)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Blobs
        let currentLastBlobSequenced = 1;

        const currentTimeExceed = Number((await ethers.provider.getBlock("latest"))?.timestamp);

        let currentBlob = {
            blobType: 0,
            blobTypeParams: encodeCalldatBlobTypeParams(
                currentTimeExceed + 38,
                ZK_GAS_LIMIT_BATCH,
                l1InfoIndex,
                l2txData
            ),
        };
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlob],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlob],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "MaxTimestampSequenceInvalid");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [blob],
                trustedSequencer.address,
                ethers.ZeroHash
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "FinalAccInputHashDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.sequenceBlobs([blob], trustedSequencer.address, expectedAccInputHash2)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyTrustedSequencer");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceZeroBlobs");

        currentBlob = {
            blobType: 0,
            blobTypeParams: encodeCalldatBlobTypeParams(
                currentTime + 38,
                ZK_GAS_LIMIT_BATCH,
                l1InfoIndex,
                `0x${"00".repeat(_MAX_TRANSACTIONS_BYTE_LENGTH + 1)}` as any
            ),
        };
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlob],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlob],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "TransactionsLengthAboveMax");

        currentBlob = {
            blobType: FORCED_BLOB_TYPE,
            blobTypeParams: encodeCalldatForcedTypeParams(ethers.keccak256(l2txData), ethers.ZeroHash),
        };

        // False forced blob
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [currentBlob],
                trustedSequencer.address,
                await calculateAccInputHashFromCalldata(
                    [currentBlob],
                    trustedSequencer.address,
                    expectedAccInputHash,
                    polygonZkEVMGlobalExitRoot
                )
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForcedDataDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [blob],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");

        const currentTimestampSequenced = (await ethers.provider.getBlock("latest"))?.timestamp;

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        const sequenceArray = new Array(24).fill(blob);
        const expectedAccInputHash3 = await calculateAccInputHashFromCalldata(
            sequenceArray,
            trustedSequencer.address,
            expectedAccInputHash2,
            polygonZkEVMGlobalExitRoot
        );

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                sequenceArray,
                trustedSequencer.address,
                expectedAccInputHash3
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");
    });

    it("should check full flow with wrapped gas token", async () => {
        // Create a new wrapped token mocking the bridge
        const tokenName = "Matic Token L2";
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

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(rootzkEVM);
        const rootRollups = merkleTreeRollups.getRoot();

        // Assert global exit root
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await polygonZkEVMGlobalExitRoot.connect(rolllupManagerSigner).updateExitRoot(rootRollups, {gasPrice: 0});

        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);

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
            await polygonZkEVMBridgeContract.verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)
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

        // Initialzie using rollup manager with gas token
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                newWrappedToken.target,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;

        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            tokenAddress,
            originNetwork,
            metadata // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            tokenAddress,
            originNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            metadata, // empty metadata
        ]);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        expect(await PolygonZKEVMV2Contract.gasTokenAddress()).to.be.equal(tokenAddress);
        expect(await PolygonZKEVMV2Contract.gasTokenNetwork()).to.be.equal(originNetwork);
    });

    it("should check forced blobs", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        // Approve tokens
        await expect(polTokenContract.connect(admin).approve(PolygonZKEVMV2Contract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(0);

        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // force Blobs
        await expect(PolygonZKEVMV2Contract.forceBlob(l2txData, maticAmount)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBlobNotAllowed"
        );

        //await PolygonZKEVMV2Contract.connect(admin).activateForceBlobs();
        await polTokenContract.transfer(admin.address, ethers.parseEther("1000"));

        // force Blobs
        await expect(PolygonZKEVMV2Contract.forceBlob(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBlobNotAllowed"
        );

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBlob(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "NotEnoughPOLAmount"
        );

        await expect(
            PolygonZKEVMV2Contract.connect(admin).forceBlob(
                `0x${"00".repeat(_MAX_TRANSACTIONS_BYTE_LENGTH + 1)}`,
                maticAmount
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "TransactionsLengthAboveMax");

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBlob(l2txData, maticAmount))
            .to.emit(PolygonZKEVMV2Contract, "ForceBlob")
            .withArgs(1, globalExitRoot, admin.address, ZK_GAS_LIMIT_BATCH, "0x");

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(
            await rollupManagerContract.getForcedZkGasPrice()
        );
    });

    it("should check forced blobs from a contract", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(0);

        // deploy sender SC
        const sendDataFactory = await ethers.getContractFactory("SendData");
        const sendDataContract = await sendDataFactory.deploy();
        await sendDataContract.waitForDeployment();

        // Approve matic
        const approveTx = await polTokenContract.approve.populateTransaction(
            PolygonZKEVMV2Contract.target,
            maticAmount
        );
        await sendDataContract.sendData(approveTx.to, approveTx.data);

        // Activate forced blobs
        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBlobAddress(sendDataContract.target)).to.emit(
            PolygonZKEVMV2Contract,
            "SetForceBlobAddress"
        );

        await polTokenContract.transfer(sendDataContract.target, ethers.parseEther("1000"));

        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();
        const lastForcedBlob = (await PolygonZKEVMV2Contract.lastForceBlob()) + 1n;

        const forceBlobTx = await PolygonZKEVMV2Contract.forceBlob.populateTransaction(l2txData, maticAmount);
        await expect(sendDataContract.sendData(forceBlobTx.to, forceBlobTx.data))
            .to.emit(PolygonZKEVMV2Contract, "ForceBlob")
            .withArgs(lastForcedBlob, globalExitRoot, sendDataContract.target, ZK_GAS_LIMIT_BATCH, l2txData);

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(
            await rollupManagerContract.getForcedZkGasPrice()
        );
    });

    it("should check forced blobs from a contract", async () => {
        // Initialzie using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerContract.target]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await expect(
            PolygonZKEVMV2Contract.connect(rolllupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBlobs");

        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        const transaction = await PolygonZKEVMV2Contract.generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            "0x" // empty metadata
        );

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootL2Address,
            ethers.ZeroAddress,
            "0x", // empty metadata
        ]);

        const blockCreatedRollup = await ethers.provider.getBlock("latest");

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
            MAX_SEQUENCE_TIMESTAMP_FORCED,
            trustedSequencer.address,
            ZK_GAS_LIMIT_BATCH,
            FORCED_BLOB_TYPE,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            forcedHashData
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify blobs
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        // Approve tokens
        await polTokenContract.transfer(admin.address, ethers.parseEther("1000"));
        await expect(polTokenContract.connect(admin).approve(PolygonZKEVMV2Contract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(0);
        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        const adminPolBalance = await polTokenContract.balanceOf(admin.address);
        const forceBlobFee = (await rollupManagerContract.getForcedZkGasPrice()) * BigInt(ZK_GAS_LIMIT_BATCH);

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBlob(l2txData, maticAmount))
            .to.emit(PolygonZKEVMV2Contract, "ForceBlob")
            .withArgs(1, globalExitRoot, admin.address, ZK_GAS_LIMIT_BATCH, "0x");

        const blockForced = await ethers.provider.getBlock("latest");
        const timestampForceBlob = blockForced?.timestamp as any;

        expect(await polTokenContract.balanceOf(admin.address)).to.be.equal(adminPolBalance - forceBlobFee);

        expect(await PolygonZKEVMV2Contract.calculatePolPerForcedZkGas()).to.be.equal(
            await rollupManagerContract.getForcedZkGasPrice()
        );

        const forcedHashDataForcedBlob = ethers.solidityPackedKeccak256(
            ["bytes32", "uint64", "bytes32"],
            [globalExitRoot, timestampForceBlob, blockForced?.parentHash]
        );

        // Sequence force blobs
        const blobForced = {
            blobType: FORCED_BLOB_TYPE,
            blobTypeParams: encodeCalldatForcedTypeParams(ethers.keccak256(l2txData), forcedHashDataForcedBlob),
        } as BlobDataStructFeijoa;

        // sequence force blob
        await expect(PolygonZKEVMV2Contract.connect(admin).sequenceForceBlobs([])).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "SequenceZeroBlobs"
        );

        // sequence force blob
        const sequencedArray = new Array(_MAX_VERIFY_BATCHES + 1).fill(blobForced);

        // sequence force blob
        await expect(
            PolygonZKEVMV2Contract.connect(admin).sequenceForceBlobs([blobForced, blobForced])
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBlobsOverflow");

        // sequence force blob
        await expect(
            PolygonZKEVMV2Contract.connect(admin).sequenceForceBlobs([blobForced])
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBlobTimeoutNotExpired");

        // Increment timestamp
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestampForceBlob + FORCE_BATCH_TIMEOUT]);

        // sequence force blob
        await expect(PolygonZKEVMV2Contract.connect(admin).sequenceForceBlobs([blobForced]))
            .to.emit(PolygonZKEVMV2Contract, "SequenceForceBlobs")
            .withArgs(2);

        const expectedAccInputHash3 = await calculateAccInputHashFromCalldata(
            [blobForced],
            admin.address,
            expectedAccInputHash,
            polygonZkEVMGlobalExitRoot
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash3);
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
        } else if (blobType == BLOBTX_BLOB_TYPE) {
            const [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, blobIndex, z, y, commitmentAndProof] =
                ethers.AbiCoder.defaultAbiCoder().decode(
                    ["uint64", "uint64", "uint32", "uint256", "bytes32", "bytes32", "bytes"],
                    blobTypeParams
                );

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
                z,
                y,
                ethers.ZeroHash,
                ethers.ZeroHash
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

async function getWallet(address: string) {
    const accounts = config.networks.hardhat.accounts;
    const index = (await ethers.getSigners()).map((s) => s.address).indexOf(address);
    const wallet = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(accounts.mnemonic),
        accounts.path + `/${index}`
    );
    return wallet;
}
