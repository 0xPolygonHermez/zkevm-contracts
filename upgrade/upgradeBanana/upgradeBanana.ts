/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import {utils} from "ffjavascript";

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {PolygonRollupManager, PolygonZkEVM} from "../../typechain-types";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    upgrades.silenceWarnings();

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryUpgradeParameters = ["rollupManagerAddress", "timelockDelay"];

    for (const parameterName of mandatoryUpgradeParameters) {
        if (upgradeParameters[parameterName] === undefined || upgradeParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const {rollupManagerAddress, timelockDelay} = upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    const polygonRMFactory = await ethers.getContractFactory("PolygonRollupManagerPrevious");
    const polygonRMContract = (await polygonRMFactory.attach(rollupManagerAddress)) as PolygonRollupManager;

    const globalExitRootManagerAddress = await polygonRMContract.globalExitRootManager();
    const polAddress = await polygonRMContract.pol();
    const bridgeAddress = await polygonRMContract.bridgeAddress();

    // Load provider
    let currentProvider = ethers.provider;
    if (upgradeParameters.multiplierGas || upgradeParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (upgradeParameters.maxPriorityFeePerGas && upgradeParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${upgradeParameters.maxPriorityFeePerGas} gwei, MaxFee${upgradeParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(upgradeParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(upgradeParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", upgradeParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(upgradeParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(upgradeParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (upgradeParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(upgradeParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("deploying with: ", deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prapare upgrades

    // prepare upgrade global exit root
    // Prepare Upgrade  PolygonZkEVMGlobalExitRootV2
    const polygonGlobalExitRootV2 = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);

    const newGlobalExitRoortImpl = await upgrades.prepareUpgrade(
        globalExitRootManagerAddress,
        polygonGlobalExitRootV2,
        {
            constructorArgs: [rollupManagerAddress, bridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        }
    );

    console.log("#######################\n");
    console.log(`polygonGlobalExitRootV2 impl: ${newGlobalExitRoortImpl}`);

    console.log("you can verify the new impl address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${newGlobalExitRoortImpl} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
        rollupManagerAddress,
        bridgeAddress,
    ]);

    const operationGlobalExitRoot = genOperation(
        proxyAdmin.target,
        0, // value,
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            globalExitRootManagerAddress,
            newGlobalExitRoortImpl,
            polygonGlobalExitRootV2.interface.encodeFunctionData("initialize", []),
        ]),
        ethers.ZeroHash, // predecesoor
        salt // salt
    );

    // Upgrade to rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, PolygonRollupManagerFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress],
        unsafeAllow: ["constructor", "state-variable-immutable"],
    });

    console.log("#######################\n");
    console.log(`Polygon rollup manager: ${implRollupManager}`);

    console.log("you can verify the new impl address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${implRollupManager} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
        globalExitRootManagerAddress,
        polAddress,
        bridgeAddress,
    ]);

    const operationRollupManager = genOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgrade", [rollupManagerAddress, implRollupManager]),
        ethers.ZeroHash, // predecesoor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("scheduleBatch", [
        [operationGlobalExitRoot.target, operationRollupManager.target],
        [operationGlobalExitRoot.value, operationRollupManager.value],
        [operationGlobalExitRoot.data, operationRollupManager.data],
        ethers.ZeroHash, // predecesoor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("executeBatch", [
        [operationGlobalExitRoot.target, operationRollupManager.target],
        [operationGlobalExitRoot.value, operationRollupManager.value],
        [operationGlobalExitRoot.data, operationRollupManager.data],
        ethers.ZeroHash, // predecesoor
        salt, // salt
    ]);

    console.log({scheduleData});
    console.log({executeData});

    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAdress: timelockAddress,
    };

    // Decode the scheduleData for better readibility
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {};

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "payloads") {
            // for each payload
            const payloads = timelockTx?.args[i];
            for (let j = 0; j < payloads.length; j++) {
                const data = payloads[j];
                const decodedProxyAdmin = proxyAdmin.interface.parseTransaction({
                    data,
                });

                const resultDecodeProxyAdmin = {};
                resultDecodeProxyAdmin.signature = decodedProxyAdmin?.signature;
                resultDecodeProxyAdmin.selector = decodedProxyAdmin?.selector;

                const paramsArrayData = decodedProxyAdmin?.fragment.inputs;

                for (let n = 0; n < paramsArrayData?.length; n++) {
                    const currentParam = paramsArrayData[n];
                    resultDecodeProxyAdmin[currentParam.name] = decodedProxyAdmin?.args[n];
                }
                objectDecoded[`decodePayload_${j}`] = resultDecodeProxyAdmin;
            }
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
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
