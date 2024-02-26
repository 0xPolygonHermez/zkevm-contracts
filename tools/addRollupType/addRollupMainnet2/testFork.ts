/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, upgrades} from "hardhat";
import {PolygonRollupManager, PolygonZkEVMTimelock} from "../../../typechain-types";

import {takeSnapshot, time, reset, setBalance, setStorageAt} from "@nomicfoundation/hardhat-network-helpers";

const deployOutputParameters = require("./deploy_output_mainnet.json");
const upgradeOutput = require("./upgrade_output.json");
const addRollupTypeOutput = require("./add_rollup_type_output.json");

async function main() {
    const polTokenAddress = "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"; // mainnet address
    const deployer = (await ethers.getSigners())[0];
    console.log("using signer: ", deployer.address);

    // hard fork
    const rpc = `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
    await reset(rpc);
    await setBalance(deployer.address, 100n ** 18n);

    // Get timelock multisig
    const timelockMultisig = "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21";
    await ethers.provider.send("hardhat_impersonateAccount", [timelockMultisig]);
    const multisigSigner = await ethers.getSigner(timelockMultisig as any);
    await setBalance(timelockMultisig, 100n ** 18n);

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockContract = (await timelockContractFactory.attach(
        deployOutputParameters.timelockContractAddress
    )) as PolygonZkEVMTimelock;

    const timelockDelay = await timelockContract.getMinDelay();

    const polygonZkEVMFactory = await ethers.getContractFactory("PolygonZkEVM");
    const polygonZkEVMContract = (await polygonZkEVMFactory.attach(
        deployOutputParameters.polygonZkEVMAddress
    )) as PolygonZkEVM;

    const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

    await setStorageAt(polygonZkEVMContract.target, 116, lastBatchSequenced);

    const lastBatchVerified = await polygonZkEVMContract.lastVerifiedBatch();
    console.log({lastBatchSequenced});
    console.log({lastBatchVerified});

    await time.increase(timelockDelay);

    // Set storage slot

    // send mutlsig transaction
    const txUpgrade = {
        to: timelockContract.target,
        data: upgradeOutput.executeData,
    };

    const receipt = await (await multisigSigner.sendTransaction(txUpgrade)).wait();

    const RollupMangerFactory = await ethers.getContractFactory("PolygonRollupManager");
    const rollupManager = (await RollupMangerFactory.attach(
        deployOutputParameters.polygonZkEVMAddress
    )) as PolygonRollupManager;

    expect(await rollupManager.rollupCount()).to.be.equal(1);

    console.log("Contracts upgraded");

    // Deploy a validium
    const verifierAddress = upgradeOutput.verifierAddress;

    // send mutlsig transaction
    const txAddRollupType = {
        to: timelockContract.target,
        data: addRollupTypeOutput.executeData,
    };
    const receiptAddRollupType = await (await multisigSigner.sendTransaction(txAddRollupType)).wait();

    expect(await rollupManager.rollupTypeCount()).to.be.equal(1);

    // Create new rollup
    const chainID = 123213;
    const txDeployRollup = await rollupManager.connect(multisigSigner).createNewRollup(
        1, // rollupType
        chainID,
        deployer.address, // admin
        deployer.address, // sequencer
        ethers.ZeroAddress, // gas token address
        "trustedsequencer url",
        "network name"
    );

    console.log("Validum added");

    const receiptDeployRollup = (await txDeployRollup.wait()) as any;
    expect(await rollupManager.rollupCount()).to.be.equal(2);

    // Update rollup to this type: this is just a test is NOT intended to update our zkevm to a validium
    await ethers.provider.send("hardhat_impersonateAccount", [deployOutputParameters.timelockContractAddress]);
    const tiemelockSigner = await ethers.getSigner(deployOutputParameters.timelockContractAddress as any);
    await setBalance(deployOutputParameters.timelockContractAddress, 100n ** 18n);
    const txUpdateRollup = await rollupManager.connect(tiemelockSigner).updateRollup(
        upgradeOutput.newPolygonZKEVM, //new poylgon zkevm
        1, // new rollupTypeID
        "0x" // upgradeData
    );

    const receiptUpdateRollup = (await txUpdateRollup.wait()) as any;

    const rollupDataFinal2 = await rollupManager.rollupIDToRollupData(2);
    //expect(rollupDataFinal2.rollupContract).to.be.equal(upgradeOutput.newPolygonZKEVM);
    expect(rollupDataFinal2.chainID).to.be.equal(chainID);
    expect(rollupDataFinal2.verifier).to.be.equal(verifierAddress);
    expect(rollupDataFinal2.forkID).to.be.equal(7);
    expect(rollupDataFinal2.lastBatchSequenced).to.be.equal(1);
    expect(rollupDataFinal2.lastVerifiedBatch).to.be.equal(0);
    expect(rollupDataFinal2.lastPendingState).to.be.equal(0);
    expect(rollupDataFinal2.lastPendingStateConsolidated).to.be.equal(0);
    expect(rollupDataFinal2.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);
    expect(rollupDataFinal2.rollupTypeID).to.be.equal(1);
    expect(rollupDataFinal2.rollupCompatibilityID).to.be.equal(0);

    const rollupDataFinal = await rollupManager.rollupIDToRollupData(1);
    expect(rollupDataFinal.rollupContract).to.be.equal(upgradeOutput.newPolygonZKEVM);
    expect(rollupDataFinal.chainID).to.be.equal(1101);
    expect(rollupDataFinal.verifier).to.be.equal(verifierAddress);
    expect(rollupDataFinal.forkID).to.be.equal(7);
    expect(rollupDataFinal.lastBatchSequenced).to.be.equal(lastBatchSequenced + 1n);
    expect(rollupDataFinal.lastVerifiedBatch).to.be.equal(lastBatchSequenced);
    expect(rollupDataFinal.lastPendingState).to.be.equal(0);
    expect(rollupDataFinal.lastPendingStateConsolidated).to.be.equal(0);
    expect(rollupDataFinal.lastVerifiedBatchBeforeUpgrade).to.be.equal(lastBatchSequenced);
    expect(rollupDataFinal.rollupTypeID).to.be.equal(1);
    expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

    console.log("Updated zkevm Succedd");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
