/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, network, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonValidiumEtrog,
    PolygonRollupBaseEtrog,
    TokenWrapped,
    Address,
    PolygonRollupManagerEmptyMock__factory,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {array} from "yargs";
import {PolygonDataCommittee} from "../../typechain-types/contracts/v2/consensus/dataComittee";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;

type BatchDataStructEtrog = PolygonRollupBaseEtrog.BatchDataStruct;
type ValidiumBatchData = PolygonValidiumEtrog.ValidiumBatchDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

describe("PolygonZkEVMEtrog", () => {
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
    let PolygonZKEVMV2Contract: PolygonValidiumEtrog;
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
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonValidiumEtrog");
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

        expect(await PolygonZKEVMV2Contract.admin()).to.be.equal(admin.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PolygonZKEVMV2Contract.networkName()).to.be.equal(networkName);
        expect(await PolygonZKEVMV2Contract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

        expect(await PolygonZKEVMV2Contract.admin()).to.be.equal(admin.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PolygonZKEVMV2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PolygonZKEVMV2Contract.networkName()).to.be.equal(networkName);
        expect(await PolygonZKEVMV2Contract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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
        await expect(PolygonZKEVMV2Contract.setForceBatchTimeout(0)).to.be.revertedWithCustomError(
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

        await expect(PolygonZKEVMV2Contract.setForceBatchTimeout(0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "OnlyAdmin"
        );

        // Set Forcebatch timeout
        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT + 1)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "InvalidRangeForceBatchTimeout");

        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "InvalidRangeForceBatchTimeout");

        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBatchTimeout(0))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBatchTimeout")
            .withArgs(0);

        expect(await PolygonZKEVMV2Contract.forceBatchTimeout()).to.be.equal(0);

        await rollupManagerContract.activateEmergencyState();
        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBatchTimeout(FORCE_BATCH_TIMEOUT))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBatchTimeout")
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

        // Check force batches are unactive
        await expect(PolygonZKEVMV2Contract.forceBatch("0x", 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );
        await expect(PolygonZKEVMV2Contract.sequenceForceBatches([])).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );

        // deployer now is the admin
        await expect(
            PolygonZKEVMV2Contract.connect(admin).setForceBatchAddress(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyAdmin");

        await expect(PolygonZKEVMV2Contract.connect(deployer).setForceBatchAddress(ethers.ZeroAddress))
            .to.emit(PolygonZKEVMV2Contract, "SetForceBatchAddress")
            .withArgs(ethers.ZeroAddress);

        await expect(
            PolygonZKEVMV2Contract.connect(deployer).setForceBatchAddress(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBatchesDecentralized");

        // Check revert onVerifyBatches
        await expect(
            PolygonZKEVMV2Contract.connect(admin).onVerifyBatches(0, ethers.ZeroHash, trustedAggregator.address)
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");
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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

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
        await expect(
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Batches
        const currentLastBatchSequenced = 1;

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [sequence],
                0,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceWithDataAvailabilityNotAllowed");

        await expect(PolygonZKEVMV2Contract.connect(admin).switchSequenceWithDataAvailability(true)).to.emit(
            PolygonZKEVMV2Contract,
            "SwitchSequenceWithDataAvailability"
        );

        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);

        await ethers.provider.send("evm_setNextBlockTimestamp", [currentTime + 1]);

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [sequence],
                currentTime + 38,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "MaxTimestampSequenceInvalid");

        await expect(
            PolygonZKEVMV2Contract.sequenceBatches(
                [sequence],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyTrustedSequencer");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceZeroBatches");

        const hugeBatchArray = new Array(_MAX_VERIFY_BATCHES + 1).fill({
            transactions: "0x",
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        });

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                hugeBatchArray,
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ExceedMaxVerifyBatches");

        // Create a huge sequence
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [
                    {
                        transactions: `0x${"00".repeat(_MAX_TRANSACTIONS_BYTE_LENGTH + 1)}` as any,
                        forcedGlobalExitRoot: ethers.ZeroHash,
                        forcedTimestamp: 0,
                        forcedBlockHashL1: ethers.ZeroHash,
                    },
                ],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "TransactionsLengthAboveMax");

        // False forced batch
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [
                    {
                        transactions: "0x",
                        forcedGlobalExitRoot: ethers.hexlify(ethers.randomBytes(32)),
                        forcedTimestamp: 1000,
                        forcedBlockHashL1: ethers.ZeroHash,
                    },
                ],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForcedDataDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatches(
                [sequence],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBatches");

        const currentTimestampSequenced = (await ethers.provider.getBlock("latest"))?.timestamp;

        const expectedAccInputHash2 = calculateAccInputHashetrog(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            await polygonZkEVMGlobalExitRoot.getRoot(),
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");
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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const hashedData = ethers.keccak256(l2txData) as any;
        const maticAmount = await rollupManagerContract.getBatchFee();

        const sequenceValidium = {
            transactionsHash: hashedData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as ValidiumBatchData;

        // Approve tokens
        await expect(
            polTokenContract.connect(trustedSequencer).approve(PolygonZKEVMV2Contract.target, maticAmount)
        ).to.emit(polTokenContract, "Approval");

        // Sequence Batches
        const currentTime = Number((await ethers.provider.getBlock("latest"))?.timestamp);
        let currentLastBatchSequenced = 1;
        await expect(
            PolygonZKEVMV2Contract.sequenceBatchesValidium(
                [sequenceValidium],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x1233"
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "OnlyTrustedSequencer");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x1233"
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "SequenceZeroBatches");

        const hugeBatchArray = new Array(_MAX_VERIFY_BATCHES + 1).fill({
            transactionsHash: hashedData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        });

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                hugeBatchArray,
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x"
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ExceedMaxVerifyBatches");

        // False forced batch
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [
                    {
                        transactionsHash: hashedData,
                        forcedGlobalExitRoot: ethers.hexlify(ethers.randomBytes(32)),
                        forcedTimestamp: 1000,
                        forcedBlockHashL1: ethers.ZeroHash,
                    },
                ],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x"
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForcedDataDoesNotMatch");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [sequenceValidium],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x1233"
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
        const signedData = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [ethers.ZeroHash, hashedData]);
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
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [sequenceValidium],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                badDataAvMessage
            )
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "UnexpectedCommitteeHash");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [sequenceValidium],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                badDataAvMessage.slice(0, -2)
            )
        ).to.be.revertedWithCustomError(PolygonDataCommitee, "UnexpectedAddrsAndSignaturesSize");

        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [sequenceValidium],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                dataAvailabilityMessage
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBatches");

        const expectedAccInputHash2 = calculateAccInputHashetrog(
            expectedAccInputHash,
            hashedData,
            await polygonZkEVMGlobalExitRoot.getRoot(),
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash
        );

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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        expect(await PolygonZKEVMV2Contract.gasTokenAddress()).to.be.equal(tokenAddress);
        expect(await PolygonZKEVMV2Contract.gasTokenNetwork()).to.be.equal(originNetwork);
    });

    it("should check forced batches and sequenced withou data commitee", async () => {
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        // Approve tokens
        await expect(polTokenContract.connect(admin).approve(PolygonZKEVMV2Contract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(0);

        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // force Batches
        await expect(PolygonZKEVMV2Contract.forceBatch(l2txData, maticAmount)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );

        //await PolygonZKEVMV2Contract.connect(admin).activateForceBatches();
        await polTokenContract.transfer(admin.address, ethers.parseEther("1000"));

        // force Batches
        await expect(PolygonZKEVMV2Contract.forceBatch(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBatch(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "NotEnoughPOLAmount"
        );

        await expect(
            PolygonZKEVMV2Contract.connect(admin).forceBatch(
                `0x${"00".repeat(_MAX_TRANSACTIONS_BYTE_LENGTH + 1)}`,
                maticAmount
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "TransactionsLengthAboveMax");

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBatch(l2txData, maticAmount))
            .to.emit(PolygonZKEVMV2Contract, "ForceBatch")
            .withArgs(1, globalExitRoot, admin.address, "0x");

        const blockForced = await ethers.provider.getBlock("latest");
        const timestampForceBatch = blockForced?.timestamp as any;

        // Sequence force batches
        const sequenceForced = {
            transactionsHash: ethers.keccak256(l2txData),
            forcedGlobalExitRoot: globalExitRoot,
            forcedTimestamp: timestampForceBatch,
            forcedBlockHashL1: blockForced?.parentHash,
        } as ValidiumBatchData;

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
        const currentLastBatchSequenced = 1;
        await expect(
            PolygonZKEVMV2Contract.connect(trustedSequencer).sequenceBatchesValidium(
                [sequenceForced],
                currentTime,
                currentLastBatchSequenced,
                trustedSequencer.address,
                "0x12"
            )
        ).to.emit(PolygonZKEVMV2Contract, "SequenceBatches");
    });

    it("should check forced batches", async () => {
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        // Approve tokens
        await expect(polTokenContract.connect(admin).approve(PolygonZKEVMV2Contract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(0);

        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        // force Batches
        await expect(PolygonZKEVMV2Contract.forceBatch(l2txData, maticAmount)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );

        //await PolygonZKEVMV2Contract.connect(admin).activateForceBatches();
        await polTokenContract.transfer(admin.address, ethers.parseEther("1000"));

        // force Batches
        await expect(PolygonZKEVMV2Contract.forceBatch(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "ForceBatchNotAllowed"
        );

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBatch(l2txData, 0)).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "NotEnoughPOLAmount"
        );

        await expect(
            PolygonZKEVMV2Contract.connect(admin).forceBatch(
                `0x${"00".repeat(_MAX_TRANSACTIONS_BYTE_LENGTH + 1)}`,
                maticAmount
            )
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "TransactionsLengthAboveMax");

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBatch(l2txData, maticAmount))
            .to.emit(PolygonZKEVMV2Contract, "ForceBatch")
            .withArgs(1, globalExitRoot, admin.address, "0x");

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(
            await rollupManagerContract.getForcedBatchFee()
        );
    });

    it("should check forced batches from a contract", async () => {
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(0);

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

        // Activate forced batches
        await expect(PolygonZKEVMV2Contract.connect(admin).setForceBatchAddress(sendDataContract.target)).to.emit(
            PolygonZKEVMV2Contract,
            "SetForceBatchAddress"
        );

        await polTokenContract.transfer(sendDataContract.target, ethers.parseEther("1000"));

        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();
        const lastForcedBatch = (await PolygonZKEVMV2Contract.lastForceBatch()) + 1n;

        const forceBatchTx = await PolygonZKEVMV2Contract.forceBatch.populateTransaction(l2txData, maticAmount);
        await expect(sendDataContract.sendData(forceBatchTx.to, forceBatchTx.data))
            .to.emit(PolygonZKEVMV2Contract, "ForceBatch")
            .withArgs(lastForcedBatch, globalExitRoot, sendDataContract.target, l2txData);

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(
            await rollupManagerContract.getForcedBatchFee()
        );
    });

    it("should check forced batches from a contract", async () => {
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
        ).to.emit(PolygonZKEVMV2Contract, "InitialSequenceBatches");

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

        const expectedAccInputHash = calculateAccInputHashetrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = ethers.parseEther("1");

        // Approve tokens
        await polTokenContract.transfer(admin.address, ethers.parseEther("1000"));
        await expect(polTokenContract.connect(admin).approve(PolygonZKEVMV2Contract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(0);
        const globalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        const adminPolBalance = await polTokenContract.balanceOf(admin.address);
        const forceBatchFee = await rollupManagerContract.getForcedBatchFee();

        await expect(PolygonZKEVMV2Contract.connect(admin).forceBatch(l2txData, maticAmount))
            .to.emit(PolygonZKEVMV2Contract, "ForceBatch")
            .withArgs(1, globalExitRoot, admin.address, "0x");

        const blockForced = await ethers.provider.getBlock("latest");
        const timestampForceBatch = blockForced?.timestamp as any;

        expect(await polTokenContract.balanceOf(admin.address)).to.be.equal(adminPolBalance - forceBatchFee);

        expect(await PolygonZKEVMV2Contract.calculatePolPerForceBatch()).to.be.equal(
            await rollupManagerContract.getForcedBatchFee()
        );

        // Sequence force batches
        const sequenceForced = {
            transactions: l2txData,
            forcedGlobalExitRoot: globalExitRoot,
            forcedTimestamp: timestampForceBatch,
            forcedBlockHashL1: blockForced?.parentHash,
        } as BatchDataStructEtrog;

        // sequence force batch
        await expect(PolygonZKEVMV2Contract.connect(admin).sequenceForceBatches([])).to.be.revertedWithCustomError(
            PolygonZKEVMV2Contract,
            "SequenceZeroBatches"
        );

        // sequence force batch
        const sequencedArray = new Array(_MAX_VERIFY_BATCHES + 1).fill(sequenceForced);

        await expect(
            PolygonZKEVMV2Contract.connect(admin).sequenceForceBatches(sequencedArray)
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ExceedMaxVerifyBatches");

        // sequence force batch
        await expect(
            PolygonZKEVMV2Contract.connect(admin).sequenceForceBatches([sequenceForced, sequenceForced])
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBatchesOverflow");

        // sequence force batch
        await expect(
            PolygonZKEVMV2Contract.connect(admin).sequenceForceBatches([sequenceForced])
        ).to.be.revertedWithCustomError(PolygonZKEVMV2Contract, "ForceBatchTimeoutNotExpired");

        // Increment timestamp
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestampForceBatch + FORCE_BATCH_TIMEOUT]);

        // sequence force batch
        await expect(PolygonZKEVMV2Contract.connect(admin).sequenceForceBatches([sequenceForced]))
            .to.emit(PolygonZKEVMV2Contract, "SequenceForceBatches")
            .withArgs(2);

        const expectedAccInputHash3 = calculateAccInputHashetrog(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            globalExitRoot,
            timestampForceBatch,
            admin.address,
            blockForced?.parentHash
        );

        // calcualte accINputHash
        expect(await PolygonZKEVMV2Contract.lastAccInputHash()).to.be.equal(expectedAccInputHash3);
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
