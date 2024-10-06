/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";

const addRollupParameters = require("./add_rollup_type.json");
const genesis = require("./genesis.json");

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./add_rollup_type_output-${dateStr}.json`);

import {PolygonRollupManager} from "../../typechain-types";
import "../../deployment/helpers/utils";

async function main() {
    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "description",
        "forkID",
        "consensusContract",
        "polygonRollupManagerAddress",
        "verifierAddress",
        "genesisRoot",
        "programVKey",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupParameters[parameterName] === undefined || addRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        description,
        forkID,
        consensusContract,
        polygonRollupManagerAddress,
        verifierAddress,
        genesisRoot,
        programVKey,
    } = addRollupParameters;

    const supportedConensus = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"];
    const isPessimistic = consensusContract === "PolygonPessimisticConsensus";

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

    // get data from rollupManagerContract
    const polygonZkEVMBridgeAddress = await rollupManagerContract.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManagerContract.globalExitRootManager();
    const polTokenAddress = await rollupManagerContract.pol();

    if (!isPessimistic) {
        // checks for rollups
        // Sanity checks genesisRoot
        if (consensusContract)
            if (genesisRoot !== genesis.root) {
                throw new Error(
                    `Genesis root in the 'add_rollup_type.json' does not match the root in the 'genesis.json'`
                );
            }

        // get bridge address in genesis file
        let genesisBridgeAddress = ethers.ZeroAddress;
        for (let i = 0; i < genesis.genesis.length; i++) {
            if (genesis.genesis[i].contractName === "PolygonZkEVMBridge proxy") {
                genesisBridgeAddress = genesis.genesis[i].address;
                break;
            }
        }

        if (polygonZkEVMBridgeAddress.toLowerCase() !== genesisBridgeAddress.toLowerCase()) {
            throw new Error(
                `'PolygonZkEVMBridge proxy' root in the 'genesis.json' does not match 'bridgeAddress' in the 'PolygonRollupManager'`
            );
        }
    }

    // Check roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) == false) {
        throw new Error(
            `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`
        );
    }

    // Since it's a mock deployment deployer has all the rights
    const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");

    // Check role:
    if ((await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, deployer.address)) == false)
        await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);

    // Create consensus implementation if needed
    let consensusContractAddress;

    if (
        typeof addRollupParameters.consensusContractAddress !== "undefined" &&
        ethers.isAddress(addRollupParameters.consensusContractAddress)
    ) {
        consensusContractAddress = addRollupParameters.consensusContractAddress;
    } else {
        const PolygonconsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
        let PolygonconsensusContract;

        PolygonconsensusContract = await PolygonconsensusFactory.deploy(
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress
        );
        await PolygonconsensusContract.waitForDeployment();

        console.log("#######################\n");
        console.log(`new consensus name: ${consensusContract}`);
        console.log(`new PolygonconsensusContract impl: ${PolygonconsensusContract.target}`);

        console.log("you can verify the new impl address with:");
        console.log(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonconsensusContract.target} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress,
        ]);

        consensusContractAddress = PolygonconsensusContract.target;
    }

    // Add a new rollup type
    let rollupVerifierType;
    let genesisFinal;
    let programVKeyFinal;

    if (consensusContract == "PolygonPessimisticConsensus") {
        rollupVerifierType = 1;
        genesisFinal = ethers.ZeroHash;
        programVKeyFinal = programVKey || ethers.ZeroHash;
    } else {
        rollupVerifierType = 0;
        genesisFinal = genesis.root;
        programVKeyFinal = ethers.ZeroHash;
    }

    console.log(
        await (
            await rollupManagerContract.addNewRollupType(
                consensusContractAddress,
                verifierAddress,
                forkID,
                rollupVerifierType,
                genesisFinal,
                description,
                programVKeyFinal
            )
        ).wait()
    );

    console.log("#######################\n");
    console.log("Added new Rollup Type deployed");
    const newRollupTypeID = await rollupManagerContract.rollupTypeCount();

    outputJson.genesis = genesis.root;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;
    outputJson.rollupTypeID = newRollupTypeID;

    // add time to output path
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
