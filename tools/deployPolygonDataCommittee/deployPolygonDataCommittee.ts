/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, upgrades} from "hardhat";
const deployParameters = require("./deploy_dataCommittee_parameters.json");
const pathOZUpgradability = path.join(__dirname, `../../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);
const pathOutput = path.join(__dirname, `./deploy_dataCommittee_output.json`);

async function main() {
    const outputJson = {} as any;

    const attemptsDeployProxy = 20;

    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(
            `There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`
        );
    }

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

    /*
     *Deployment pol
     */
    const PolygonDataCommitteeContract = (await ethers.getContractFactory("PolygonDataCommittee", deployer)) as any;
    let polygonDataCommittee;

    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
                unsafeAllow: ["constructor"],
            });
            break;
        } catch (error: any) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of polygonDataCommittee ", error.message);
        }
        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error("polygonDataCommittee contract has not been deployed");
        }
    }
    await polygonDataCommittee?.waitForDeployment();

    console.log("#######################\n");
    console.log("PolygonDataCommittee deployed to:", polygonDataCommittee?.target);
    console.log("#######################\n");
    console.log("polygonDataCommittee deployed to:", polygonDataCommittee?.target);
    console.log("you can verify the new polygonDataCommittee address with:");
    console.log(`npx hardhat verify ${polygonDataCommittee?.target} --network ${process.env.HARDHAT_NETWORK}\n`);

    // tranfer ownership of the contract, and the proxy
    const proxyAdmin = await upgrades.admin.getInstance(); //await upgrades.erc1967.getAdminAddress(polygonDataCommittee.target);
    await (await proxyAdmin.transferOwnership(deployParameters.admin)).wait();
    await (await polygonDataCommittee?.transferOwnership(deployParameters.admin)).wait();

    outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    outputJson.proxyAdmin = proxyAdmin.target;

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
