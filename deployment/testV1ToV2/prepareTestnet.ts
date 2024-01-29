/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, no-restricted-syntax */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../.env")});
import {ethers} from "hardhat";

import yargs from "yargs/yargs";

const argv = yargs(process.argv.slice(2))
    .options({
        input: {type: "string", default: "./deploy_parameters.json"},
    })
    .parse() as any;

const pathDeployParameters = path.join(__dirname, argv.input);
const deployParameters = require(argv.input);

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

    // Check trusted address from deploy parameters
    const mandatoryDeploymentParameters = ["trustedAggregator", "trustedSequencer"];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {trustedAggregator, trustedSequencer} = deployParameters;

    /*
     *Deployment pol
     */
    const polTokenName = "Pol Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock", deployer);
    const polTokenContract = await polTokenFactory.deploy(
        polTokenName,
        polTokenSymbol,
        deployer.address,
        polTokenInitialBalance
    );
    await polTokenContract.waitForDeployment();

    console.log("#######################\n");
    console.log("pol deployed to:", polTokenContract.target);

    // fund sequencer account with tokens and ether if it have less than 0.1 ether.
    const balanceEther = await ethers.provider.getBalance(trustedSequencer);
    const minEtherBalance = ethers.parseEther("0.1");
    if (balanceEther < minEtherBalance) {
        const params = {
            to: trustedSequencer,
            value: minEtherBalance,
        };
        await deployer.sendTransaction(params);
    }
    const tokensBalance = ethers.parseEther("100000");
    await (await polTokenContract.transfer(trustedSequencer, tokensBalance)).wait();

    // fund aggregator account with ether if it have less than 0.1 ether.
    const balanceEtherAggr = await ethers.provider.getBalance(trustedAggregator);
    if (balanceEtherAggr < minEtherBalance) {
        const params = {
            to: trustedAggregator,
            value: minEtherBalance,
        };
        await deployer.sendTransaction(params);
    }

    deployParameters.polTokenAddress = polTokenContract.target;
    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
