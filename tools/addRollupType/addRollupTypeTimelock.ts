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

const pathOutputJson = path.join(__dirname, "./add_rollup_type_output.json");
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
        "polygonZkEVMBridgeAddress",
        "polygonZkEVMGlobalExitRootAddress",
        "polTokenAddress",
        "verifierAddress",
        "rollupCompatibilityID",
        "timelockDelay",
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
        polygonZkEVMBridgeAddress,
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        verifierAddress,
        timelockDelay,
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

    // Create consensus implementation
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

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    const operation = genOperation(
        polygonRollupManagerAddress,
        0, // value
        PolgonRollupManagerFactory.interface.encodeFunctionData("addNewRollupType", [
            PolygonconsensusContract.target,
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
