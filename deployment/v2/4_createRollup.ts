/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

const {create2Deployment} = require("../helpers/deployment-helpers");

const pathOutputJson = path.join(__dirname, "./deploy_output.json");

const deployParameters = require("./deploy_parameters.json");
const genesis = require("./genesis.json");
const deployOutput = require("./deploy_output.json");
import "../helpers/utils";

import {PolygonRollupManager} from "../../typechain-types";

async function main() {
    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "realVerifier",
        "trustedSequencerURL",
        "networkName",
        "description",
        "trustedSequencer",
        "chainID",
        "adminZkEVM",
        "forkID",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {realVerifier, trustedSequencerURL, networkName, description, trustedSequencer, chainID, adminZkEVM, forkID} =
        deployParameters;

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

    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolgonRollupManagerFactory.attach(
        deployOutput.polygonRollupManager
    ) as PolygonRollupManager;

    let verifierContract;
    if (realVerifier === true) {
        const VerifierRollup = await ethers.getContractFactory("FflonkVerifier", deployer);
        verifierContract = await VerifierRollup.deploy();
        await verifierContract.waitForDeployment();
    } else {
        const VerifierRollupHelperFactory = await ethers.getContractFactory("VerifierRollupHelperMock", deployer);
        verifierContract = await VerifierRollupHelperFactory.deploy();
        await verifierContract.waitForDeployment();
    }
    console.log("#######################\n");
    console.log("Verifier deployed to:", verifierContract.target);

    // Since it's a mock deployment deployer has all the rights
    const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");
    const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");

    await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);
    await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address);

    // Create zkEVM implementation
    const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMV2");
    const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
        deployOutput.polygonZkEVMGlobalExitRootAddress,
        deployOutput.polTokenAddress,
        deployOutput.polygonZkEVMBridgeAddress,
        deployOutput.polygonRollupManager
    );
    await PolygonZKEVMV2Contract.waitForDeployment();

    // Add a new rollup type with timelock
    const newRollupTypeID = 1;
    const rollupCompatibilityID = 0;
    await rollupManagerContract.addNewRollupType(
        PolygonZKEVMV2Contract.target,
        verifierContract.target,
        forkID,
        rollupCompatibilityID,
        genesis.root,
        description
    );

    console.log("#######################\n");
    console.log("Added new Rollup Type deployed");

    let gasTokenAddress, gasTokenNetwork;

    if (deployParameters.gasTokenAddress && deployParameters.gasTokenAddress != "") {
        gasTokenAddress = deployParameters.gasTokenAddress;
        gasTokenNetwork = deployParameters.gasTokenNetwork;
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
    }

    const newZKEVMAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce: await currentProvider.getTransactionCount(rollupManagerContract.target),
    });

    // Create new rollup
    const txDeployRollup = await rollupManagerContract.createNewRollup(
        newRollupTypeID,
        chainID,
        adminZkEVM,
        trustedSequencer,
        gasTokenAddress,
        gasTokenNetwork,
        trustedSequencerURL,
        networkName
    );
    await txDeployRollup.wait();
    console.log("#######################\n");
    console.log("Created new Rollup:", newZKEVMAddress);

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(newZKEVMAddress)).to.be.equal(rollupManagerContract.target);
    expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress)).to.be.equal(PolygonZKEVMV2Contract.target);

    deployOutput.genesis = genesis.root;
    deployOutput.newZKEVMAddress = newZKEVMAddress;
    deployOutput.verifierAddress = verifierContract.target;

    fs.writeFileSync(pathOutputJson, JSON.stringify(deployOutput, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
