import {expect} from "chai";
import {ethers} from "hardhat";
import fs from "fs";
import path from "path";
const deployOutput = JSON.parse(fs.readFileSync(path.join(__dirname, "./deploymentOutput/deploy_output.json"), "utf8"));
const {polygonRollupManagerAddress, polygonZkEVMBridgeAddress, polygonZkEVMGlobalExitRootAddress, polTokenAddress} =
    deployOutput;
const createRollupOutput = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./deploymentOutput/create_rollup_output.json"), "utf8")
);
const {rollupAddress} = createRollupOutput;
import {
    PolygonRollupManager,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMEtrog,
} from "../typechain-types";

describe("Docker build tests Contract", () => {
    it("should check PolygonZkEVMEtrog", async () => {
        const PolygonZkEVMEtrogFactory = await ethers.getContractFactory("PolygonZkEVMEtrog");
        const PolygonZkEVMEtrogContract = PolygonZkEVMEtrogFactory.attach(rollupAddress) as PolygonZkEVMEtrog;
        expect(PolygonZkEVMEtrogContract.target).to.equal(rollupAddress);
        expect(await PolygonZkEVMEtrogContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZkEVMEtrogContract.pol()).to.equal(polTokenAddress);
        expect(await PolygonZkEVMEtrogContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZkEVMEtrogContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await PolygonZkEVMEtrogContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });

    it("should check RollupManager", async () => {
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            polygonRollupManagerAddress
        ) as PolygonRollupManager;
        expect(rollupManagerContract.target).to.equal(polygonRollupManagerAddress);
        expect(await rollupManagerContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await rollupManagerContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await rollupManagerContract.pol()).to.equal(polTokenAddress);
    });

    it("should check GlobalExitRootV2", async () => {
        const PolygonZkEVMGlobalExitRootV2Factory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        const PolygonZkEVMGlobalExitRootV2Contract = PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRootAddress
        ) as PolygonZkEVMGlobalExitRootV2;
        expect(PolygonZkEVMGlobalExitRootV2Contract.target).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZkEVMGlobalExitRootV2Contract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZkEVMGlobalExitRootV2Contract.rollupManager()).to.equal(polygonRollupManagerAddress);
        // Check already initialized
        await expect(
            PolygonZkEVMGlobalExitRootV2Contract.initialize()
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check PolygonZkEVMBridgeV2", async () => {
        const PolygonZkEVMBridgeV2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        const PolygonZkEVMBridgeV2Contract = PolygonZkEVMBridgeV2Factory.attach(
            polygonZkEVMBridgeAddress
        ) as PolygonZkEVMBridgeV2;
        expect(PolygonZkEVMBridgeV2Contract.target).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZkEVMBridgeV2Contract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZkEVMBridgeV2Contract.polygonRollupManager()).to.equal(polygonRollupManagerAddress);
        // Check already initialized
        await expect(
            PolygonZkEVMBridgeV2Contract.initialize(
                0,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRootAddress,
                polygonRollupManagerAddress,
                "0x"
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });
});
