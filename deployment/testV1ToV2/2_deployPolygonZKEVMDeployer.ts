/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

import {deployPolygonZkEVMDeployer} from "../helpers/deployment-helpers";
import "../helpers/utils";

const pathDeployParameters = path.join(__dirname, "./deploy_parameters.json");
const deployParameters = require("./deploy_parameters.json");

async function main() {
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

    // Load initialZkEVMDeployerOwner
    const {initialZkEVMDeployerOwner} = deployParameters;

    if (initialZkEVMDeployerOwner === undefined || initialZkEVMDeployerOwner === "") {
        throw new Error("Missing parameter: initialZkEVMDeployerOwner");
    }

    // Deploy PolygonZkEVMDeployer if is not deployed already using keyless deployment
    const [zkEVMDeployerContract, keylessDeployer] = await deployPolygonZkEVMDeployer(
        initialZkEVMDeployerOwner,
        deployer as HardhatEthersSigner
    );

    if (keylessDeployer === ethers.ZeroAddress) {
        console.log("#######################\n");
        console.log("polygonZkEVMDeployer already deployed on: ", zkEVMDeployerContract.target);
    } else {
        console.log("#######################\n");
        console.log("polygonZkEVMDeployer deployed on: ", zkEVMDeployerContract.target);
    }

    deployParameters.zkEVMDeployerAddress = zkEVMDeployerContract.target;
    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
