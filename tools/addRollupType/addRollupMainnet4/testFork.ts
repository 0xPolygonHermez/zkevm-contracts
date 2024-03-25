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
const updateOutput = require("./updateRollupOutput.json");
const addRollupTypeOutput = require("./add_rollup_type_output.json");
const grantRoleOutput = require("./grantRoleOutput.json");

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

    const RollupMangerFactory = await ethers.getContractFactory("PolygonRollupManager");
    const rollupManager = (await RollupMangerFactory.attach(
        deployOutputParameters.polygonZkEVMAddress
    )) as PolygonRollupManager;

    // Set emergency state:
    const emergencyMultisig = "0x37c58Dfa7BF0A165C5AAEdDf3e2EdB475ac6Dcb6";
    await ethers.provider.send("hardhat_impersonateAccount", [emergencyMultisig]);
    const emergencySigner = await ethers.getSigner(emergencyMultisig as any);
    await setBalance(emergencyMultisig, 100n ** 18n);

    await rollupManager.connect(emergencySigner).activateEmergencyState();

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockContract = (await timelockContractFactory.attach(
        deployOutputParameters.timelockContractAddress
    )) as PolygonZkEVMTimelock;

    const timelockDelay = await timelockContract.getMinDelay();

    const polygonZkEVMFactory = await ethers.getContractFactory("PolygonZkEVM");
    const polygonZkEVMContract = (await polygonZkEVMFactory.attach(
        deployOutputParameters.polygonZkEVMAddress
    )) as PolygonZkEVM;

    const txScheduleAddType = {
        to: timelockContract.target,
        data: addRollupTypeOutput.scheduleData,
    };

    await (await multisigSigner.sendTransaction(txScheduleAddType)).wait();

    const txScheduleGrantRol = {
        to: timelockContract.target,
        data: grantRoleOutput.scheduleData,
    };

    await (await multisigSigner.sendTransaction(txScheduleGrantRol)).wait();

    await time.increase(timelockDelay + 1n);

    // send mutlsig transaction
    const txExecuteAddType = {
        to: timelockContract.target,
        data: addRollupTypeOutput.executeData,
    };

    await (await multisigSigner.sendTransaction(txExecuteAddType)).wait();

    const txExecuteGrantRol = {
        to: timelockContract.target,
        data: grantRoleOutput.executeData,
    };

    await (await multisigSigner.sendTransaction(txExecuteGrantRol)).wait();

    // add rollup
    await rollupManager
        .connect(multisigSigner)
        .updateRollup(
            updateOutput.decodedScheduleData.decodedData.rollupContract,
            updateOutput.decodedScheduleData.decodedData.newRollupTypeID,
            updateOutput.decodedScheduleData.decodedData.upgradeData
        );

    expect(await rollupManager.rollupCount()).to.be.equal(2);
    expect(await rollupManager.rollupTypeCount()).to.be.equal(3);
    console.log("Contracts upgraded");

    await (await rollupManager.connect(multisigSigner).deactivateEmergencyState()).wait();

    // Deploy a validium
    const verifierAddress = addRollupTypeOutput.decodedScheduleData.decodedData.verifier;

    const rollupDataFinal = await rollupManager.rollupIDToRollupData(1);
    expect(rollupDataFinal.rollupContract).to.be.equal("0x519E42c24163192Dca44CD3fBDCEBF6be9130987");
    expect(rollupDataFinal.chainID).to.be.equal(1101);
    expect(rollupDataFinal.verifier).to.be.equal(verifierAddress);
    expect(rollupDataFinal.forkID).to.be.equal(9);
    expect(rollupDataFinal.rollupTypeID).to.be.equal(3);
    expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

    console.log("Updated zkevm Succedd");

    // test send proofs
    const data =
        "0x1489ed100000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001e8a2200000000000000000000000000000000000000000000000000000000001e8a28d6b09a304c1325a27d1a7d9d96716be3920d3da8935a6786c70d4b5a67b14e55f2ef1c2ab6e2b3eec6ed2548d8ee3f04a0cdbe030a198a7c29e7493b1ac750e70000000000000000000000006329fe417621925c81c16f9f9a18c203c21af7ab2463a2efb16d392337e3548d6969c0ec270d7d874ef92272efd206b08fb17d8a2cc7dcdbda9f05a132fb18a6faabbb19f0c421f9ef46cfbc6f0bb36020616a9b01d283d5f505873fe8dab7ef89a5022cde735962e7da2534c3805772c8fe7b5c2f9a979557cea5edaf8fd633d3d52b071339baa32835f93338ba31e864963b822dfa56e33ff664db4540eedc0e4cb158ca44ecfa5b8b5bbbc55a2a833229b08d264bcdea19b3b684084ec48000dfc9af18a0355cbcdd7bff5cdd134959e921cc29899a7ae9f39e94886074debb8d8ec4d1feb60cd0b54d198a758803cb26eb792c936577b48ff072fc02d6de84a8b402d56727fb26a1c93c205a1048c9cc41990afc32a3a60bb468ad8f939239dfd29ed9922dadd58c0a365b52e389e924e89a10565c6dbec95900a31560df050c094b936d9e1c5a4f6c7632867baece9a72101a95d88c38fac73686e2a26a578dc1bb22398e43cc56f5c0fb268da509a9aea317f31f6ca142fc47d8987ce502203ab1a69a250e8f6313fa920e301d065b86a308f65f748ce68065dba1918872c724f1f353b21d01dbbaf1bb1baa497e94624a1d8cc75dfe932334f5ea1a15b9af74e55bfb280731a8536180c9689e78c7af992cb6bc33fa5d232e760e6b11bba6b2ca017a92ae3bc4469b576f2f9cf7cf3da90dd3a8d2644db151b32df2b5b267bd022c5c72a9eecff7436bc9ac1c6381366b07231ea18c5661bdf0700929a5f0d8afd590d1e694a0f257fabc8e839af345352956bb3adbdc5f79ebe2f8ab9be8a501443ecef43909ccfae545ef4938a1432f0712839ab85cca5a3b052fae1a0806aaae61c63ed991eb5b08b8ab2ec25de83918b4d49452f01cf1b3b60d2185d8d9c459d69d8d8a422aa131ac26d64c72b55c141ecd66b59b3acdee601fedb1f8038d70be16822a56c8aa738e7f05d357a6b123eb1677158a22d6868099fb1a1820ccbff79c063f6f29bcb32fc79c85563aa32ff9e44a72b103e0e18ee760a6d72b307aca41c3ffaa4dc70d1d1fe2710b41221bf047c0247134b90e1013705f6e7f9b389b9ecb272a13db65a768c2699b0ad2";

    const aggregator = "0x6329Fe417621925C81c16F9F9a18c203C21Af7ab";
    const tx = {
        from: aggregator,
        to: "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
        data: data,
    };

    try {
        const resposneCall = await ethers.provider.send("eth_call", [tx, "latest"]);
        console.log({resposneCall});
    } catch (error: any) {
        console.log(error.data);
        console.log(error);
        console.log(RollupMangerFactory.interface.parseError(error.data));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
