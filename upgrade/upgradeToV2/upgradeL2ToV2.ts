/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {PolygonZkEVMTimelock} from "../../typechain-types";

const pathOutputJson = path.join(__dirname, "./upgrade_outputL2.json");
const deployParameters = require("./deploy_parameters.json");
const deployOutputParameters = require("./deploy_output.json");
const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    upgrades.silenceWarnings();

    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;
    const currentBridgeAddress = deployOutputParameters.polygonZkEVMBridgeAddress;

    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(deployParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(deployParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("deploying with: ", deployer.address);

    // Prepare Upgrade PolygonZkEVMBridge
    const PreviousBridgeFactory = (await ethers.getContractFactory("PolygonZkEVMBridge")) as any;

    // Import OZ upgrades
    await upgrades.forceImport(currentBridgeAddress as string, PreviousBridgeFactory, "transparent" as any);
    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(currentBridgeAddress as string)).to.be.equal(proxyAdmin.target);

    // Check current timelock address and delay
    const timelockL2Address = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockContract = (await timelockContractFactory.attach(timelockL2Address)) as PolygonZkEVMTimelock;
    const timelockDelay = await timelockContract.getMinDelay();

    console.log("timelockAddress: ", timelockContract.target, {timelockDelay});

    // prapare upgrades
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);

    const newBridgeImpl = await upgrades.prepareUpgrade(currentBridgeAddress, polygonZkEVMBridgeFactory, {
        unsafeAllow: ["constructor"],
    });

    console.log("#######################\n");
    console.log(`PolygonZkEVMBridge impl: ${newBridgeImpl}`);

    console.log("you can verify the new impl address with:");
    console.log(`npx hardhat verify ${newBridgeImpl} --network ${process.env.HARDHAT_NETWORK}`);

    const operationBridge = genOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgrade", [currentBridgeAddress, newBridgeImpl]),
        ethers.ZeroHash, // predecesoor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecesoor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecesoor
        salt, // salt
    ]);

    console.log({scheduleData});
    console.log({executeData});

    const outputJson = {
        scheduleData,
        executeData,
        timelockL2Address,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

// OZ test functions
function genOperation(target: any, value: any, data: any, predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "uint256", "bytes32"],
        [target, value, data, predecessor, salt]
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}
