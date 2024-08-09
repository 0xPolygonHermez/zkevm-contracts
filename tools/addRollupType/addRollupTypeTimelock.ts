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
        "polTokenAddress",
        "verifierAddress",
        "rollupCompatibilityID",
        "timelockDelay",
        "genesisRoot",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupParameters[parameterName] === undefined || addRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        description,
        rollupCompatibilityID,
        forkID,
        consensusContract,
        polygonRollupManagerAddress,
        verifierAddress,
        timelockDelay,
        genesisRoot,
    } = addRollupParameters;

    const salt = addRollupParameters.timelockSalt || ethers.ZeroHash;
    const predecessor = addRollupParameters.predecessor || ethers.ZeroHash;

    const supportedConensus = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonValidiumStorageMigration"];

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

    // Sanity checks genesisRoot
    if (genesisRoot !== genesis.root) {
        throw new Error(`Genesis root in the 'add_rollup_type.json' does not match the root in the 'genesis.json'`);
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
        console.log(polygonZkEVMBridgeAddress, genesisBridgeAddress);

        throw new Error(
            `'PolygonZkEVMBridge proxy' root in the 'genesis.json' does not match 'bridgeAddress' in the 'PolygonRollupManager'`
        );
    }

    // Create consensus implementation
    const PolygonconsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
    let PolygonconsensusContract;
    let PolygonconsensusContractAddress;

    if (
        addRollupParameters.polygonconsensusContract === undefined ||
        addRollupParameters.polygonconsensusContract === ""
    ) {
        PolygonconsensusContract = await PolygonconsensusFactory.deploy(
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress
        );
        await PolygonconsensusContract.waitForDeployment();

        PolygonconsensusContractAddress = PolygonconsensusContract.target;

        console.log("#######################\n");
        console.log(`new PolygonconsensusContract impl: ${PolygonconsensusContractAddress}`);

        console.log("you can verify the new impl address with:");
        console.log(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonconsensusContractAddress} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress,
        ]);
    } else {
        PolygonconsensusContractAddress = addRollupParameters.polygonconsensusContract;
    }

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    const operation = genOperation(
        polygonRollupManagerAddress,
        0, // value
        PolgonRollupManagerFactory.interface.encodeFunctionData("addNewRollupType", [
            PolygonconsensusContractAddress,
            verifierAddress,
            forkID,
            rollupCompatibilityID,
            genesis.root,
            description,
        ]),
        predecessor, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
        timelockDelay,
    ]);
    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
    ]);

    console.log({scheduleData});
    console.log({executeData});

    outputJson.genesis = genesis.root;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;
    outputJson.scheduleData = scheduleData;
    outputJson.executeData = executeData;
    outputJson.id = operation.id;

    // Decode the scheduleData for better readibility
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {};

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];

        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedRollupManagerData = PolgonRollupManagerFactory.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {};
            const paramsArrayData = decodedRollupManagerData?.fragment.inputs;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedRollupManagerData?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    // Decode the schedule data to better readibiltiy:

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
