/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";

const addRollupParameters = require("./add_rollup_type.json");

const pathOutputJson = path.join(__dirname, "./deployIsolatedOutput.json");

import {PolygonRollupManager} from "../../typechain-types";
import "../../deployment/helpers/utils";

async function main() {
    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "consensusContract",
        "polygonRollupManagerAddress",
        "polygonZkEVMBridgeAddress",
        "polygonZkEVMGlobalExitRootAddress",
        "polTokenAddress",
        "adminZkEVM",
        "trustedSequencer",
        "trustedSequencerURL",
        "networkName",
        "version",
        "chainID",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupParameters[parameterName] === undefined || addRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        consensusContract,
        polygonRollupManagerAddress,
        polygonZkEVMBridgeAddress,
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        chainID,
    } = addRollupParameters;

    const supportedConensus = ["PolygonZkEVMEtrogIsolatedPreEtrog"];

    if (!supportedConensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConensus}`);
    }

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

    // Create consensus implementation
    const PolygonconsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;

    const admin = addRollupParameters.adminZkEVM;
    const sequencer = addRollupParameters.trustedSequencer;
    const sequencerURL = addRollupParameters.trustedSequencerURL;
    const networkName = addRollupParameters.networkName;
    const version = addRollupParameters.version;

    let PolygonconsensusContractImplementation = await PolygonconsensusFactory.deploy(
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        polygonZkEVMBridgeAddress,
        polygonRollupManagerAddress
    );
    await PolygonconsensusContractImplementation.waitForDeployment();

    // deploy polygon zkEVM proxy

    const dataCallInitialize = PolygonconsensusFactory.interface.encodeFunctionData(
        "initialize(address,address,uint64,string,string,string)",
        [admin, sequencer, chainID, sequencerURL, networkName, version]
    );

    const PolygonTransparentProxy = await ethers.getContractFactory("PolygonTransparentProxy");
    const PolygonconsensusContract = await PolygonTransparentProxy.deploy(
        PolygonconsensusContractImplementation.target,
        polygonRollupManagerAddress,
        dataCallInitialize
    );

    await PolygonconsensusContract?.waitForDeployment();

    console.log("#######################\n");
    console.log(`new PolygonconsensusContract impl: ${PolygonconsensusContract?.target}`);

    console.log("you can verify the new impl address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonconsensusContract?.target} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        polygonZkEVMBridgeAddress,
        polygonRollupManagerAddress,
    ]);

    console.log("#######################\n");
    console.log(`new PolygonProxy impl: ${PolygonconsensusContract?.target}`);

    console.log("you can verify the new impl address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonconsensusContract?.target} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
        PolygonconsensusContractImplementation.target,
        polygonRollupManagerAddress,
        dataCallInitialize,
    ]);

    const tx = await PolygonconsensusContract.deploymentTransaction();
    const receiptDeploy = await tx?.wait();

    outputJson.consensusDeployed = PolygonconsensusContract?.target;
    outputJson.genesisBlockNumber = receiptDeploy?.blockNumber;

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
