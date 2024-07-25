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
    PolygonDataCommittee,
    PolygonPessimisticConsensus,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";

enum VerifierType {
    StateTransition = 0,
    Pessimistic = 1,
}

describe("Polygon Rollup Manager with Polygon Pessimistic Consensus", () => {
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
    let PolygonPPConsensusContract: PolygonPessimisticConsensus;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

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
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        });

        // deploy polygon rollup manager mock
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

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("0.1"));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther("10"));
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.be.equal(0);

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

    it("should add a new rollup type: PolygonConsensusPessimistic", async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = "new pessimistic consensus";
        const programVKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        const newRollupTypeID = 1;
        const nonZeroGenesis = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        // sender does not have _ADD_ROLLUP_TYPE_ROLE role
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // genesis != 0 on Pessimistic Verifier type
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonPPConsensusContract.target,
                    verifierContract.target,
                    forkID,
                    VerifierType.Pessimistic,
                    nonZeroGenesis,
                    description,
                    programVKey
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "InvalidRollupType");

        // correct add new rollup via timelock
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonPPConsensusContract.target,
                    verifierContract.target,
                    forkID,
                    VerifierType.Pessimistic,
                    genesis,
                    description,
                    programVKey
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonPPConsensusContract.target,
            verifierContract.target,
            forkID,
            VerifierType.Pessimistic,
            false,
            genesis,
            programVKey,
        ];

        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // do obsoleteRollupType
        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);
    });

    it("should create a new rollup: PolygonConsensusPessimistic", async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = "new pessimistic consensus";
        const programVKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        const newRollupTypeID = 1;

        // correct add new rollup via timelock
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonPPConsensusContract.target,
                    verifierContract.target,
                    forkID,
                    VerifierType.Pessimistic,
                    genesis,
                    description,
                    programVKey
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey
            );

        // create new pessimsitic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = "https://pessimistic:8545";
        const networkName = "testPessimistic";
        const newCreatedRollupID = 1;

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

        // create new pessimistic
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const newZkEVMContract = ppConsensusFactory.attach(newZKEVMAddress) as PolygonPessimisticConsensus;

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
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress);

        // assert new rollup created
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);

        // assert new rollup
        const resRollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);

        const expectedRollupData = [
            newZKEVMAddress,
            chainID,
            verifierContract.target,
            forkID,
            ethers.ZeroHash,
            0,
            0,
            0,
            0,
            newRollupTypeID,
            VerifierType.Pessimistic,
            ethers.ZeroHash,
            programVKey,
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);
    });

    it("should add an existing rollup: PolygonConsensusPessimistic", async () => {
        // add existing rollup
        const rollupAddress = "0xAa000000000000000000000000000000000000Bb";
        const forkID = 1;
        const chainID = 1;
        const initLER = "0xff000000000000000000000000000000000000000000000000000000000000ff";
        const programVKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        // add existing rollup: pessimistic type
        const newCreatedRollupID = 1;

        await expect(
            rollupManagerContract
                .connect(timelock)
                .addExistingRollup(
                    rollupAddress,
                    verifierContract.target,
                    forkID,
                    chainID,
                    initLER,
                    VerifierType.Pessimistic,
                    programVKey
                )
        )
            .to.emit(rollupManagerContract, "AddExistingRollup")
            .withArgs(newCreatedRollupID, forkID, rollupAddress, chainID, VerifierType.Pessimistic, 0, programVKey);
    });

    it("should prevent to update rollup by rollup admin if different verifier type", async () => {});

    it("should update rollup: pessismsitic type", async () => {});

    it("should verify pessimistic proof: pessismsitic type", async () => {});
});
