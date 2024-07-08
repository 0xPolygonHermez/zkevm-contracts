/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import * as dotenv from "dotenv";
import {ethers} from "hardhat";
import {PolygonZkEVMDeployer} from "../../typechain-types";
import "../helpers/utils";
import path = require("path");
import fs = require("fs");
dotenv.config({path: path.resolve(__dirname, "../../.env")});
const pathOutputJson = path.join(__dirname, "./deploy_output.json");
const pathRollupOutputJson = path.join(__dirname, "./create_rollup_output.json");
const postDeploymentParameters = require("./post_deployment_parameters.json");

async function main() {
    if (!fs.existsSync(pathOutputJson)) {
        throw new Error("Deploy output json not found");
    }

    const outputJson = require(pathOutputJson);

    let mandatoryDeploymentParameters = [
        "zkEVMDeployerContract",
        "polygonZkEVMBridgeAddress",
        "polygonRollupManagerAddress",
        "timelockContractAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (outputJson[parameterName] === undefined || outputJson[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    if (!fs.existsSync(pathRollupOutputJson)) {
        throw new Error("Rollup deploy output json not found");
    }
    const rollupOutputJson = require(pathRollupOutputJson);

    mandatoryDeploymentParameters = ["polygonDataCommitteeAddress"];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (rollupOutputJson[parameterName] === undefined || rollupOutputJson[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (postDeploymentParameters.multiplierGas || postDeploymentParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://eth-${process.env.HARDHAT_NETWORK}.g.alchemy.com/v2/${process.env.ALCHEMY_PROJECT_ID}`
            ) as any;
            if (postDeploymentParameters.maxPriorityFeePerGas && postDeploymentParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${postDeploymentParameters.maxPriorityFeePerGas} gwei, MaxFee${postDeploymentParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(postDeploymentParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(postDeploymentParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", postDeploymentParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(postDeploymentParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(postDeploymentParameters.multiplierGas)) /
                            1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (postDeploymentParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(postDeploymentParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("Setting up committee members parameters");
    const committeeLength = postDeploymentParameters.committeeMembersAddresses.length;
    if (committeeLength === 0) {
        throw new Error("The committee members addresses must be greater than 0");
    }
    if (committeeLength !== postDeploymentParameters.committeeMembersURLs.length) {
        throw new Error("The number of committee members addresses and URLs must be equal");
    }
    if (
        postDeploymentParameters.committeeMembersThreshold === 0 ||
        postDeploymentParameters.committeeMembersThreshold > committeeLength
    ) {
        throw new Error("The committee members threshold must be greater than 0 and less than the number of members");
    }
    const committeeMembersAddresses = postDeploymentParameters.committeeMembersAddresses;
    const committeeMembersAddressesConcatenated = `0x${committeeMembersAddresses
        .map((address: string) => ethers.getAddress(address.toLowerCase()).slice(2))
        .join("")}`;
    const committeeMembersURLs = postDeploymentParameters.committeeMembersURLs;
    const committeeMembersThreshold = postDeploymentParameters.committeeMembersThreshold;

    const cdkDataCommitteeContract = await ethers.getContractAt(
        "PolygonDataCommittee",
        rollupOutputJson.polygonDataCommitteeAddress,
        deployer
    );

    const expectedHash = ethers.solidityPackedKeccak256(["bytes"], [committeeMembersAddressesConcatenated]);
    if ((await cdkDataCommitteeContract.committeeHash()) !== expectedHash) {
        await (
            await cdkDataCommitteeContract.setupCommittee(
                committeeMembersThreshold,
                committeeMembersURLs,
                committeeMembersAddressesConcatenated
            )
        ).wait();
        expect(await cdkDataCommitteeContract.committeeHash()).to.be.equal(expectedHash);
        console.log(`Committee set with ${committeeMembersAddresses} as members`);
    } else {
        console.log(`Committee already set with ${committeeMembersAddresses} as members`);
    }

    // Load zkEVM deployer
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory("PolygonZkEVMDeployer", deployer);
    const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(
        outputJson.zkEVMDeployerContract
    ) as PolygonZkEVMDeployer;

    // check deployer is the owner of the deployer
    if ((await deployer.provider?.getCode(zkEVMDeployerContract.target)) === "0x") {
        throw new Error("zkEVM deployer contract is not deployed");
    }
    expect(deployer.address).to.be.equal(await zkEVMDeployerContract.owner());

    const polygonZkEVMBridgeContract = await ethers.getContractAt(
        "PolygonZkEVMBridgeV2",
        outputJson.polygonZkEVMBridgeAddress,
        deployer
    );

    const polygonRollupManagerContract = await ethers.getContractAt(
        "PolygonRollupManager",
        outputJson.polygonRollupManagerAddress,
        deployer
    );

    if ((await polygonRollupManagerContract.getBatchFee()) !== ethers.parseEther("0.0001")) {
        console.log("\n#######################");
        console.log("Setting the batch fee to 0.0001 ether");
        await (await polygonRollupManagerContract.setBatchFee(ethers.parseEther("0.0001"))).wait();
        expect(await polygonRollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("0.0001"));
    } else {
        console.log("Batch fee already set");
    }

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    if (!(await polygonRollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, outputJson.timelockContractAddress))) {
        console.log("\n#######################");
        console.log("Adding the timelock contract as the default admin of the rollup manager");
        await (
            await polygonRollupManagerContract.grantRole(DEFAULT_ADMIN_ROLE, outputJson.timelockContractAddress)
        ).wait();
        expect(
            await polygonRollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, outputJson.timelockContractAddress)
        ).to.be.equal(true);
    } else {
        console.log("Timelock contract already added as the default admin of the rollup manager");
    }

    const timelockContract = await ethers.getContractAt(
        "PolygonZkEVMTimelock",
        outputJson.timelockContractAddress,
        deployer
    );
    if ((await timelockContract.getMinDelay()) !== 3600n) {
        throw new Error("Timelock contract min delay is not 3600");
    }
    const timelockAddress = outputJson.timelockContractAddress;

    if ((await polygonZkEVMBridgeContract.owner()) !== timelockAddress) {
        console.log("\n#######################");
        console.log("Current owner of the bridge: " + (await polygonZkEVMBridgeContract.owner()));
        console.log("transferring ownership of the bridge to the timelock address: " + timelockAddress);
        const bridgeAdminTransfer = polygonZkEVMBridgeContract.interface.encodeFunctionData("transferOwnership", [
            timelockAddress,
        ]);
        await (
            await zkEVMDeployerContract.functionCall(polygonZkEVMBridgeContract.getAddress(), bridgeAdminTransfer, 0n)
        ).wait();
        expect(await polygonZkEVMBridgeContract.owner()).to.be.equal(timelockAddress);
    } else {
        console.log("Bridge already owned by the deployer");
    }

    if ((await cdkDataCommitteeContract.owner()) !== timelockAddress) {
        console.log("\n#######################");
        console.log("Current owner of the committee: " + (await cdkDataCommitteeContract.owner()));
        console.log("transferring ownership of the committee to the timelock address: " + timelockAddress);
        await (await cdkDataCommitteeContract.transferOwnership(timelockAddress)).wait();
        expect(await cdkDataCommitteeContract.owner()).to.be.equal(timelockAddress);
    } else {
        console.log("Committee already owned by the timelock");
    }

    console.log("Post deployment setup completed");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
