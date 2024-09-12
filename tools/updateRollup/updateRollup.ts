/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, network} from "hardhat";

const addRollupParameters = require("./updateRollup.json");

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./updateRollupOutput-${dateStr}.json`);
import {PolygonRollupManager} from "../../typechain-types";
import "../../deployment/helpers/utils";

async function main() {
    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "rollupAddress",
        "newRollupTypeID",
        "upgradeData",
        "polygonRollupManagerAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupParameters[parameterName] === undefined || addRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {rollupAddress, newRollupTypeID, upgradeData, polygonRollupManagerAddress} = addRollupParameters;

    // Load provider
    let currentProvider = ethers.provider;
    if (addRollupParameters.multiplierGas || addRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (addRollupParameters.maxPriorityFeePerGas && addRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${addRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${addRollupParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(addRollupParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(addRollupParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", addRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(addRollupParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(addRollupParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (addRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(addRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("Using with: ", deployer.address);

    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolgonRollupManagerFactory.attach(
        polygonRollupManagerAddress
    ) as PolygonRollupManager;

    // Check role
    const UPDATE_ROLLUP_ROLE = ethers.id("UPDATE_ROLLUP_ROLE");

    if ((await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, deployer.address)) == false) {
        // log that address ha sno role
        throw new Error(`Address ${deployer.address} does not have the UPDATE_ROLLUP_ROLE role`);
    }

    // Add a new rollup type with timelock
    console.log(await (await rollupManagerContract.updateRollup(rollupAddress, newRollupTypeID, upgradeData)).wait());

    outputJson.networkName = network.name;
    outputJson.polygonRollupManagerAddress = polygonRollupManagerAddress;
    outputJson.rollupAddress = rollupAddress;
    outputJson.newRollupTypeID = newRollupTypeID;
    outputJson.upgradeData = upgradeData;

    // add time to output path
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
