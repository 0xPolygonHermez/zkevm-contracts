/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, network, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonValidiumFeijoa,
    PolygonRollupBaseFeijoa,
    TokenWrapped,
    Address,
    PolygonRollupManagerEmptyMock__factory,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {array} from "yargs";
import {PolygonDataCommittee} from "../../typechain-types/contracts/v2/consensus/dataComittee";
const {calculateSnarkInput, calculateAccInputHash, calculateBlobHashData} = contractUtils;

type BlobDataStructFeijoa = PolygonRollupBaseFeijoa.BlobDataStruct;
type ValidiumBlobData = PolygonValidiumFeijoa.ValidiumBlobDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

let validium = true;
function encodeCalldatBlobTypeParams(
    maxSequenceTimestamp: any,
    zkGasLimit: any,
    l1InfoLeafIndex: any,
    transactions: any
) {
    if (validium) {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint64", "uint32", "bytes32"],
            [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, ethers.keccak256(transactions)]
        );
    } else {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint64", "uint32", "bytes"],
            [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactions]
        );
    }
}

function encodeCalldatForcedTypeParams(transactionsHash: any, forcedHashData: any) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [transactionsHash, forcedHashData]);
}
const CALLDATA_BLOB_TYPE = 0;
const BLOBTX_BLOB_TYPE = 1;
const FORCED_BLOB_TYPE = 2;

const ZK_GAS_LIMIT_BATCH = 100_000_000;
const MAX_SEQUENCE_TIMESTAMP_FORCED = 18446744073709551615n; // max uint64

describe("PolygonValidiumFeijoa", () => {
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
    let PolygonZKEVMV2Contract: PolygonValidiumFeijoa;
    let PolygonDataCommitee: PolygonDataCommittee;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
    const _MAX_VERIFY_BATCHES = 1000;
    const _MAX_TRANSACTIONS_BYTE_LENGTH = 120000;
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
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonValidiumFeijoa");
        PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Create CdkCommitee
        const PolygonDataCommiteeFactory = await ethers.getContractFactory("PolygonDataCommittee");
        PolygonDataCommitee = (await upgrades.deployProxy(PolygonDataCommiteeFactory, [], {
            unsafeAllow: ["constructor"],
        })) as any as PolygonDataCommittee;

        await PolygonDataCommitee.waitForDeployment();
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

        expect(await PolygonZKEVMV2Contract.isSequenceWithDataAvailabilityAllowed()).to.be.equal(false);

        await expect(PolygonZKEVMV2Contract.switchSequenceWithDataAvailability(true)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

        await expect(
            PolygonZKEVMV2Contract.connect(admin).switchSequenceWithDataAvailability(false)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SwitchToSameValue");

        await expect(PolygonZKEVMV2Contract.connect(admin).switchSequenceWithDataAvailability(true)).to.emit(
            PolygonZKEVMV2Contract,
            "SwitchSequenceWithDataAvailability"
        );
        expect(await PolygonZKEVMV2Contract.isSequenceWithDataAvailabilityAllowed()).to.be.equal(true);

        expect(await PolygonZKEVMV2Contract.dataAvailabilityProtocol()).to.be.equal(ethers.ZeroAddress);

        await expect(
            PolygonZKEVMV2Contract.setDataAvailabilityProtocol(deployer.address)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyAdmin");

        await expect(PolygonZKEVMV2Contract.connect(admin).setDataAvailabilityProtocol(deployer.address))
            .to.emit(PolygonZKEVMV2Contract, "SetDataAvailabilityProtocol")
            .withArgs(deployer.address);

        expect(await PolygonZKEVMV2Contract.dataAvailabilityProtocol()).to.be.equal(deployer.address);

        await expect(PolygonZKEVMV2Contract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(PolygonZKEVMV2Contract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        await expect(PolygonZKEVMV2Contract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );
        await expect(PolygonZKEVMV2Contract.setForceBlobTimeout(0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

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

        // Check revert onVerifyBlobs
        await expect(
            PolygonZKEVMV2Contract.connect(admin).onVerifySequences(0, ethers.ZeroHash, trustedAggregator.address)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyRollupManager");
    });

    it("should check admin functions data commitee", async () => {
        expect(await PolygonDataCommitee.requiredAmountOfSignatures()).to.be.equal(0);
        expect(await PolygonDataCommitee.committeeHash()).to.be.equal(ethers.ZeroHash);
        expect(await PolygonDataCommitee.getAmountOfMembers()).to.be.equal(0);
        expect(await PolygonDataCommitee.getProcotolName()).to.be.equal("DataAvailabilityCommittee");

        const requiredAmountOfSignatures = 3;
        const urls = ["onurl", "twourl", "threeurl"];
        const walletsDataCommitee = [] as any;
        let addrBytes = "0x";

        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
                `m/44'/60'/0'/0/${i}`
            );
            walletsDataCommitee.push(newWallet);
            addrBytes = addrBytes + newWallet.address.slice(2);
        }

        await expect(
            PolygonDataCommitee.connect(admin).setupCommittee(requiredAmountOfSignatures, urls, addrBytes)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls.slice(1), addrBytes)
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "TooManyRequiredSignatures");

        await expect(
            PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls, "0x" + addrBytes.slice(4))
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "UnexpectedAddrsBytesLength");

        await expect(PolygonDataCommitee.setupCommittee(1, [""], deployer.address)).to.be.revertedWithCustomError(
            PolygonDataCommitee,
            "EmptyURLNotAllowed"
        );

        await expect(
            PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes)
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "WrongAddrOrder");

        // sort wallets
        walletsDataCommitee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            } else {
                return -1;
            }
        });
        addrBytes = "0x";

        for (let i = 0; i < walletsDataCommitee.length; i++) {
            addrBytes = addrBytes + walletsDataCommitee[i].address.slice(2);
        }

        const commiteeHash = ethers.keccak256(addrBytes);

        await expect(PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommitee, "CommitteeUpdated")
            .withArgs(commiteeHash);

        expect(await PolygonDataCommitee.requiredAmountOfSignatures()).to.be.equal(3);
        expect(await PolygonDataCommitee.committeeHash()).to.be.equal(commiteeHash);
        expect(await PolygonDataCommitee.getAmountOfMembers()).to.be.equal(3);
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
        const blockCreatedRollup = await ethers.provider.getBlock("latest");
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;

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

        validium = false;

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
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Blobs
        const currentLastBlobSequenced = 1;

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobs(
                [blob],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceWithDataAvailabilityNotAllowed");

        await expect(PolygonZKEVMV2Contract.connect(admin).switchSequenceWithDataAvailability(true)).to.emit(
            PolygonZKEVMV2Contract,
            "SwitchSequenceWithDataAvailability"
        );

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

        validium = true;
    });

    it("should check full flow with data commitee", async () => {
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
        const blockCreatedRollup = await ethers.provider.getBlock("latest");
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;

        await expect(PolygonZKEVMV2Contract.connect(admin).switchSequenceWithDataAvailability(true)).to.emit(
            PolygonZKEVMV2Contract,
            "SwitchSequenceWithDataAvailability"
        );

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
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Blobs
        let currentLastBlobSequenced = 1;
        await expect(
            PolygonZKEVMV2Contract.sequenceBlobsValidium([blob], trustedSequencer.address, expectedAccInputHash2)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyTrustedSequencer");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium([], trustedSequencer.address, "0x")
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceZeroBlobs");

        // False forced blob
        let currentBlob = {
            blobType: FORCED_BLOB_TYPE,
            blobTypeParams: encodeCalldatForcedTypeParams(ethers.keccak256(l2txData), ethers.ZeroHash),
        };

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [currentBlob],
                trustedSequencer.address,
                "0x"
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForcedDataDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [blob],
                trustedSequencer.address,
                expectedAccInputHash2
            )
        ).to.be.reverted;

        // Setup commitee
        await PolygonZKEVMV2Contract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommitee.target);

        const requiredAmountOfSignatures = 3;
        const urls = ["onurl", "twourl", "threeurl"];
        const walletsDataCommitee = [] as any;
        let unsortedAddrBytes = "0x";

        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
                `m/44'/60'/0'/0/${i}`
            );
            walletsDataCommitee.push(newWallet);
            unsortedAddrBytes = unsortedAddrBytes + newWallet.address.slice(2);
        }
        // sort wallets
        walletsDataCommitee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            } else {
                return -1;
            }
        });

        let addrBytes = "0x";
        for (let i = 0; i < walletsDataCommitee.length; i++) {
            addrBytes = addrBytes + walletsDataCommitee[i].address.slice(2);
        }

        const commiteeHash = ethers.keccak256(addrBytes);
        const signedData = expectedAccInputHash2;
        let message = "0x";
        for (let i = 0; i < walletsDataCommitee.length; i++) {
            const newSignature = walletsDataCommitee[i].signingKey.sign(signedData);
            message = message + newSignature.serialized.slice(2);
        }
        await expect(PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommitee, "CommitteeUpdated")
            .withArgs(commiteeHash);

        let dataAvailabilityMessage = message + addrBytes.slice(2);
        const badDataAvMessage = message + unsortedAddrBytes.slice(2);
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [blob],
                trustedSequencer.address,
                badDataAvMessage
            )
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "UnexpectedCommitteeHash");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [blob],
                trustedSequencer.address,
                badDataAvMessage.slice(0, -2)
            )
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "UnexpectedAddrsAndSignaturesSize");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [blob],
                trustedSequencer.address,
                dataAvailabilityMessage
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);
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

    it("should check forced blobs and sequenced withou data commitee", async () => {
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

        const blockForced = await ethers.provider.getBlock("latest");
        const timestampForceBlob = blockForced?.timestamp as any;

        const forcedHashDataForcedBlob = ethers.solidityPackedKeccak256(
            ["bytes32", "uint64", "bytes32"],
            [globalExitRoot, timestampForceBlob, blockForced?.parentHash]
        );

        // Even if a data commitee is not set it will work since it's not checked
        await PolygonZKEVMV2Contract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommitee.target);

        const requiredAmountOfSignatures = 3;
        const urls = ["onurl", "twourl", "threeurl"];
        const walletsDataCommitee = [] as any;
        let unsortedAddrBytes = "0x";

        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
                `m/44'/60'/0'/0/${i}`
            );
            walletsDataCommitee.push(newWallet);
            unsortedAddrBytes = unsortedAddrBytes + newWallet.address.slice(2);
        }
        // sort wallets
        walletsDataCommitee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            } else {
                return -1;
            }
        });

        let addrBytes = "0x";
        for (let i = 0; i < walletsDataCommitee.length; i++) {
            addrBytes = addrBytes + walletsDataCommitee[i].address.slice(2);
        }

        const commiteeHash = ethers.keccak256(addrBytes);
        const signedData = ethers.solidityPackedKeccak256(
            ["bytes32", "bytes32"],
            [ethers.ZeroHash, ethers.keccak256(l2txData)]
        );
        let message = "0x";
        for (let i = 0; i < walletsDataCommitee.length; i++) {
            const newSignature = walletsDataCommitee[i].signingKey.sign(signedData);
            message = message + newSignature.serialized.slice(2);
        }
        await expect(PolygonDataCommitee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommitee, "CommitteeUpdated")
            .withArgs(commiteeHash);

        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        const currentLastBlobSequenced = 1;

        const forcedBlob = {
            blobType: FORCED_BLOB_TYPE,
            blobTypeParams: encodeCalldatForcedTypeParams(ethers.keccak256(l2txData), forcedHashDataForcedBlob),
        };

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBlobsValidium(
                [forcedBlob],
                trustedSequencer.address,
                "0x12"
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBlobs");
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
            let maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactions, transactionsHash;
            if (validium) {
                [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactionsHash] =
                    ethers.AbiCoder.defaultAbiCoder().decode(["uint64", "uint64", "uint32", "bytes32"], blobTypeParams);
            } else {
                [maxSequenceTimestamp, zkGasLimit, l1InfoLeafIndex, transactions] =
                    ethers.AbiCoder.defaultAbiCoder().decode(["uint64", "uint64", "uint32", "bytes"], blobTypeParams);
                transactionsHash = ethers.keccak256(transactions);
            }

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
                transactionsHash,
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
