/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {Address, PolygonPessimisticConsensus} from "../../typechain-types";

describe("PolygonPessimisticConsensus", () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;

    let PolygonPPConsensusContract: PolygonPessimisticConsensus;

    const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
    const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
    const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
    const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const networkName = "zkevm";
    const networkID = 1;

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin] = await ethers.getSigners();

        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
        PolygonPPConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        await PolygonPPConsensusContract.waitForDeployment();
    });

    it("should check the initalized parameters", async () => {
        // initialize zkEVM using non admin address
        await expect(
            PolygonPPConsensusContract.initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(PolygonPPConsensusContract, "OnlyRollupManager");

        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PolygonPPConsensusContract.connect(rolllupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        expect(await PolygonPPConsensusContract.admin()).to.be.equal(admin.address);
        expect(await PolygonPPConsensusContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PolygonPPConsensusContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PolygonPPConsensusContract.networkName()).to.be.equal(networkName);
        expect(await PolygonPPConsensusContract.gasTokenAddress()).to.be.equal(gasTokenAddress);

        // initialize again
        await expect(
            PolygonPPConsensusContract.connect(rolllupManagerSigner).initialize(
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
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PolygonPPConsensusContract.connect(rolllupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        // setTrustedSequencer
        await expect(PolygonPPConsensusContract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            PolygonPPConsensusContract,
            "OnlyAdmin"
        );

        await expect(PolygonPPConsensusContract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(PolygonPPConsensusContract, "SetTrustedSequencer")
            .withArgs(deployer.address);

        // setTrustedSequencerURL
        await expect(PolygonPPConsensusContract.setTrustedSequencerURL("0x1253")).to.be.revertedWithCustomError(
            PolygonPPConsensusContract,
            "OnlyAdmin"
        );
        await expect(PolygonPPConsensusContract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(PolygonPPConsensusContract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        // transferAdminRole & acceptAdminRole
        await expect(PolygonPPConsensusContract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(PolygonPPConsensusContract, "TransferAdminRole")
            .withArgs(deployer.address);

        await expect(PolygonPPConsensusContract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            PolygonPPConsensusContract,
            "OnlyPendingAdmin"
        );

        await expect(PolygonPPConsensusContract.connect(deployer).acceptAdminRole())
            .to.emit(PolygonPPConsensusContract, "AcceptAdminRole")
            .withArgs(deployer.address);
    });

    it("should check getConsensusHash", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rolllupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PolygonPPConsensusContract.connect(rolllupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        // pessimistic constant CONSENSUS_TYPE = 0;
        const CONSENSUS_TYPE = 0;
        const consensusHashJs = ethers.solidityPackedKeccak256(
            ["uint32", "address"],
            [CONSENSUS_TYPE, trustedSequencer.address]
        );

        // getConsensusHash
        const resGetConsensusHash = await PolygonPPConsensusContract.getConsensusHash();

        expect(resGetConsensusHash).to.be.equal(consensusHashJs);
    });
});
