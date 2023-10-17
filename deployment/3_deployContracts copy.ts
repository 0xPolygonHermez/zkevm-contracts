/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../.env")});
import {ethers, upgrades} from "hardhat";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

const {create2Deployment} = require("./helpers/deployment-helpers");

const pathOutputJson = path.join(__dirname, "./deploy_output.json");
const pathOngoingDeploymentJson = path.join(__dirname, "./deploy_ongoing.json");

const deployParameters = require("./deploy_parameters.json");
const genesis = require("./genesis.json");

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRoot,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMV2,
    PolygonRollupBase,
    TokenWrapped,
    Address,
    PolygonZkEVM,
    PolygonZkEVMV2Existent,
    PolygonZkEVMDeployer,
    PolygonZkEVMGlobalExitRootV2,
} from "../typechain-types";

async function main() {
    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(
            `There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`
        );
    }

    // Check if there's an ongoing deployment
    let ongoingDeployment = {} as any;
    if (fs.existsSync(pathOngoingDeploymentJson)) {
        console.log("WARNING: using ongoing deployment");
        ongoingDeployment = require(pathOngoingDeploymentJson);
    }

    // Constant variables
    const networkIDMainnet = 0;

    // Gas token variables are 0 in mainnet, since native token it's ether
    const gasTokenAddressMainnet = ethers.ZeroAddress;
    const gasTokenNetworkMainnet = 0n;
    const attemptsDeployProxy = 20;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "realVerifier",
        "trustedSequencerURL",
        "networkName",
        "version",
        "trustedSequencer",
        "chainID",
        "admin",
        "trustedAggregator",
        "trustedAggregatorTimeout",
        "pendingStateTimeout",
        "forkID",
        "zkEVMOwner",
        "timelockAddress",
        "minDelayTimelock",
        "salt",
        "zkEVMDeployerAddress",
        "polTokenAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        realVerifier,
        trustedSequencerURL,
        networkName,
        version,
        trustedSequencer,
        chainID,
        admin,
        trustedAggregator,
        trustedAggregatorTimeout,
        pendingStateTimeout,
        forkID,
        zkEVMOwner,
        timelockAddress,
        minDelayTimelock,
        salt,
        zkEVMDeployerAddress,
        polTokenAddress,
    } = deployParameters;

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

    // Load zkEVM deployer
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory("PolygonZkEVMDeployer", deployer);
    const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress) as PolygonZkEVMDeployer;

    // check deployer is the owner of the deployer
    if ((await deployer.provider?.getCode(zkEVMDeployerContract.target)) === "0x") {
        throw new Error("zkEVM deployer contract is not deployed");
    }
    expect(deployer.address).to.be.equal(await zkEVMDeployerContract.owner());

    let verifierContract;
    if (!ongoingDeployment.verifierContract) {
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

        // save an ongoing deployment
        ongoingDeployment.verifierContract = verifierContract.target;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        console.log("Verifier already deployed on: ", ongoingDeployment.verifierContract);
        const VerifierRollupFactory = await ethers.getContractFactory("FflonkVerifier", deployer);
        verifierContract = VerifierRollupFactory.attach(ongoingDeployment.verifierContract);
    }

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory("ProxyAdmin", deployer);
    const deployTransactionAdmin = (await proxyAdminFactory.getDeployTransaction()).data;
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData("transferOwnership", [deployer.address]);
    const [proxyAdminAddress, isProxyAdminDeployed] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionAdmin,
        dataCallAdmin,
        deployer
    );

    if (isProxyAdminDeployed) {
        console.log("#######################\n");
        console.log("Proxy admin deployed to:", proxyAdminAddress);
    } else {
        console.log("#######################\n");
        console.log("Proxy admin was already deployed to:", proxyAdminAddress);
    }

    // Deploy implementation PolygonZkEVMBridge
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const deployTransactionBridge = (await polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    const dataCallNull = null;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = 5500000n;
    const [bridgeImplementationAddress, isBridgeImplDeployed] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        dataCallNull,
        deployer,
        overrideGasLimit
    );

    if (isBridgeImplDeployed) {
        console.log("#######################\n");
        console.log("bridge impl deployed to:", bridgeImplementationAddress);
    } else {
        console.log("#######################\n");
        console.log("bridge impl was already deployed to:", bridgeImplementationAddress);
    }

    /*
     * deploy proxy
     * Do not initialize directly the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const initializeEmptyDataProxy = "0x";
    const deployTransactionProxy = (
        await transparentProxyFactory.getDeployTransaction(
            bridgeImplementationAddress,
            proxyAdminAddress,
            initializeEmptyDataProxy
        )
    ).data;

    // Nonce globalExitRoot: currentNonce + 1 (deploy bridge proxy) + 1(impl globalExitRoot) = +2
    const nonceProxyGlobalExitRoot = Number(await ethers.provider.getTransactionCount(deployer.address)) + 2;
    // nonceProxyRollupManager :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl rollupManager) = +2
    const nonceProxyRollupManager = nonceProxyGlobalExitRoot + 2;

    let precalculateGlobalExitRootAddress;
    let precalculateRollupManager;

    // Check if the contract is already deployed
    if (ongoingDeployment.polygonZkEVMGlobalExitRoot && ongoingDeployment.polygonZkEVMContract) {
        precalculateGlobalExitRootAddress = ongoingDeployment.polygonZkEVMGlobalExitRoot;
        precalculateRollupManager = ongoingDeployment.polygonZkEVMContract;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.polygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.polygonZkEVMContract;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Contracts are not deployed, normal deployment
        precalculateGlobalExitRootAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyGlobalExitRoot,
        });
        precalculateRollupManager = ethers.getCreateAddress({from: deployer.address, nonce: nonceProxyRollupManager});
    }

    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData("initialize", [
        networkIDMainnet,
        gasTokenAddressMainnet,
        gasTokenNetworkMainnet,
        precalculateGlobalExitRootAddress,
        precalculateRollupManager,
    ]);

    const [proxyBridgeAddress, isBridgeProxyDeployed] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionProxy,
        dataCallProxy,
        deployer
    );
    const polygonZkEVMBridgeContract = polygonZkEVMBridgeFactory.attach(proxyBridgeAddress) as PolygonZkEVMBridgeV2;

    if (isBridgeProxyDeployed) {
        console.log("#######################\n");
        console.log("PolygonZkEVMBridge deployed to:", polygonZkEVMBridgeContract.target);
    } else {
        console.log("#######################\n");
        console.log("PolygonZkEVMBridge was already deployed to:", polygonZkEVMBridgeContract.target);

        // If it was already deployed, check that the initialized calldata matches the actual deployment
        expect(precalculateGlobalExitRootAddress).to.be.equal(await polygonZkEVMBridgeContract.globalExitRootManager());
        expect(precalculateRollupManager).to.be.equal(await polygonZkEVMBridgeContract.polygonRollupManager());
    }

    console.log("\n#######################");
    console.log("#####    Checks PolygonZkEVMBridge   #####");
    console.log("#######################");
    console.log("PolygonZkEVMGlobalExitRootAddress:", await polygonZkEVMBridgeContract.globalExitRootManager());
    console.log("networkID:", await polygonZkEVMBridgeContract.networkID());
    console.log("zkEVMaddress:", await polygonZkEVMBridgeContract.polygonRollupManager());

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically (admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, polygonZkEVMBridgeFactory, "transparent" as any);

    /*
     *Deployment Global exit root manager
     */
    let polygonZkEVMGlobalExitRoot;
    // TODO review should use V2?¿
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    if (!ongoingDeployment.polygonZkEVMGlobalExitRoot) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                    initializer: false,
                    constructorArgs: [precalculateRollupManager, proxyBridgeAddress],
                    unsafeAllow: ["constructor", "state-variable-immutable"],
                });
                break;
            } catch (error: any) {
                console.log(`attempt ${i}`);
                console.log("upgrades.deployProxy of polygonZkEVMGlobalExitRoot ", error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error("polygonZkEVMGlobalExitRoot contract has not been deployed");
            }
        }

        expect(precalculateGlobalExitRootAddress).to.be.equal(polygonZkEVMGlobalExitRoot?.target);

        console.log("#######################\n");
        console.log("polygonZkEVMGlobalExitRoot deployed to:", polygonZkEVMGlobalExitRoot?.target);

        // save an ongoing deployment
        ongoingDeployment.polygonZkEVMGlobalExitRoot = polygonZkEVMGlobalExitRoot?.target;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
    } else {
        // sanity check
        expect(precalculateGlobalExitRootAddress).to.be.equal(ongoingDeployment.polygonZkEVMGlobalExitRoot);

        // Expect the precalculate address matches de onogin deployment
        polygonZkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRootFactory.attach(
            ongoingDeployment.polygonZkEVMGlobalExitRoot
        ) as PolygonZkEVMGlobalExitRootV2;

        console.log("#######################\n");
        console.log("polygonZkEVMGlobalExitRoot already deployed on: ", ongoingDeployment.polygonZkEVMGlobalExitRoot);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically (admin/impl)
        await upgrades.forceImport(
            ongoingDeployment.polygonZkEVMGlobalExitRoot,
            PolygonZkEVMGlobalExitRootFactory,
            "transparent" as any
        );

        // Check against current deployment
        expect(polygonZkEVMBridgeContract.target).to.be.equal(await polygonZkEVMGlobalExitRoot.bridgeAddress());
        expect(precalculateRollupManager).to.be.equal(await polygonZkEVMGlobalExitRoot.rollupManager());
    }

    // deploy PolygonZkEVMM
    const genesisRootHex = genesis.root;

    console.log("\n#######################");
    console.log("##### Deployment Polygon ZK-EVM #####");
    console.log("#######################");
    console.log("deployer:", deployer.address);
    console.log("PolygonZkEVMGlobalExitRootAddress:", polygonZkEVMGlobalExitRoot?.target);
    console.log("polTokenAddress:", polTokenAddress);
    console.log("polygonZkEVMBridgeContract:", polygonZkEVMBridgeContract.target);

    console.log("trustedAggregator:", trustedAggregator);
    console.log("pendingStateTimeout:", pendingStateTimeout);
    console.log("trustedAggregatorTimeout:", trustedAggregatorTimeout);
    console.log("admin:", admin);

    console.log("chainID:", chainID);
    console.log("trustedSequencer:", trustedSequencer);

    console.log("genesisRoot:", genesisRootHex);
    console.log("verifierAddress:", verifierContract.target);
    console.log("trustedSequencerURL:", trustedSequencerURL);
    console.log("networkName:", networkName);
    console.log("forkID:", forkID);

    const PolygonZkEVMFactory = await ethers.getContractFactory("PolygonRollupManagerMock", deployer);

    let polygonZkEVMContract;
    let deploymentBlockNumber;
    if (!ongoingDeployment.polygonZkEVMContract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMContract = await upgrades.deployProxy(
                    PolygonZkEVMFactory,
                    [
                        trustedAggregator,
                        pendingStateTimeout,
                        trustedAggregatorTimeout,
                        admin,
                        timelock.address,
                        emergencyCouncil.address,
                    ],
                    {
                        constructorArgs: [
                            polygonZkEVMGlobalExitRoot?.target,
                            polTokenAddress,
                            polygonZkEVMBridgeContract.target,
                        ],
                        unsafeAllow: ["constructor", "state-variable-immutable"],
                    }
                );

                break;
            } catch (error) {
                console.log(`attempt ${i}`);
                console.log("upgrades.deployProxy of polygonZkEVMContract ", error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error("PolygonZkEVM contract has not been deployed");
            }
        }

        expect(precalculateRollupManager).to.be.equal(polygonZkEVMContract.address);

        console.log("#######################\n");
        console.log("polygonZkEVMContract deployed to:", polygonZkEVMContract.address);

        // save an ongoing deployment
        ongoingDeployment.polygonZkEVMContract = polygonZkEVMContract.address;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Transfer ownership of polygonZkEVMContract
        if (zkEVMOwner !== deployer.address) {
            await (await polygonZkEVMContract.transferOwnership(zkEVMOwner)).wait();
        }

        deploymentBlockNumber = (await polygonZkEVMContract.deployTransaction.wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateRollupManager).to.be.equal(ongoingDeployment.polygonZkEVMContract);
        polygonZkEVMContract = PolygonZkEVMFactory.attach(ongoingDeployment.polygonZkEVMContract);

        console.log("#######################\n");
        console.log("polygonZkEVMContract already deployed on: ", ongoingDeployment.polygonZkEVMContract);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(ongoingDeployment.polygonZkEVMContract, PolygonZkEVMFactory, "transparent");

        const zkEVMOwnerContract = await polygonZkEVMContract.owner();
        if (zkEVMOwnerContract === deployer.address) {
            // Transfer ownership of polygonZkEVMContract
            if (zkEVMOwner !== deployer.address) {
                await (await polygonZkEVMContract.transferOwnership(zkEVMOwner)).wait();
            }
        } else {
            expect(zkEVMOwner).to.be.equal(zkEVMOwnerContract);
        }
        deploymentBlockNumber = 0;
    }

    console.log("\n#######################");
    console.log("#####    Checks  PolygonZkEVM  #####");
    console.log("#######################");
    console.log("PolygonZkEVMGlobalExitRootAddress:", await polygonZkEVMContract.globalExitRootManager());
    console.log("polTokenAddress:", await polygonZkEVMContract.matic());
    console.log("verifierAddress:", await polygonZkEVMContract.rollupVerifier());
    console.log("polygonZkEVMBridgeContract:", await polygonZkEVMContract.bridgeAddress());

    console.log("admin:", await polygonZkEVMContract.admin());
    console.log("chainID:", await polygonZkEVMContract.chainID());
    console.log("trustedSequencer:", await polygonZkEVMContract.trustedSequencer());
    console.log("pendingStateTimeout:", await polygonZkEVMContract.pendingStateTimeout());
    console.log("trustedAggregator:", await polygonZkEVMContract.trustedAggregator());
    console.log("trustedAggregatorTimeout:", await polygonZkEVMContract.trustedAggregatorTimeout());

    console.log("genesiRoot:", await polygonZkEVMContract.batchNumToStateRoot(0));
    console.log("trustedSequencerURL:", await polygonZkEVMContract.trustedSequencerURL());
    console.log("networkName:", await polygonZkEVMContract.networkName());
    console.log("owner:", await polygonZkEVMContract.owner());
    console.log("forkID:", await polygonZkEVMContract.forkID());

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(precalculateRollupManager)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGlobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress);
    const proxyAdminOwner = await proxyAdminInstance.owner();
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // TODO test stop here

    let timelockContract;
    if (proxyAdminOwner !== deployer.address) {
        // Check if there's a timelock deployed there that match the current deployment
        timelockContract = timelockContractFactory.attach(proxyAdminOwner);
        expect(precalculateRollupManager).to.be.equal(await timelockContract.polygonZkEVM());

        console.log("#######################\n");
        console.log("Polygon timelockContract already deployed to:", timelockContract.address);
    } else {
        // deploy timelock
        console.log("\n#######################");
        console.log("##### Deployment TimelockContract  #####");
        console.log("#######################");
        console.log("minDelayTimelock:", minDelayTimelock);
        console.log("timelockAddress:", timelockAddress);
        console.log("zkEVMAddress:", polygonZkEVMContract.address);
        timelockContract = await timelockContractFactory.deploy(
            minDelayTimelock,
            [timelockAddress],
            [timelockAddress],
            timelockAddress,
            polygonZkEVMContract.address
        );
        await timelockContract.deployed();
        console.log("#######################\n");
        console.log("Polygon timelockContract deployed to:", timelockContract.address);

        // Transfer ownership of the proxyAdmin to timelock
        const proxyAdminContract = proxyAdminFactory.attach(proxyAdminAddress);
        await (await proxyAdminContract.transferOwnership(timelockContract.address)).wait();
    }

    console.log("\n#######################");
    console.log("#####  Checks TimelockContract  #####");
    console.log("#######################");
    console.log("minDelayTimelock:", await timelockContract.getMinDelay());
    console.log("polygonZkEVM:", await timelockContract.polygonZkEVM());

    const outputJson = {
        polygonZkEVMAddress: polygonZkEVMContract.address,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot.address,
        polTokenAddress,
        verifierAddress: verifierContract.address,
        zkEVMDeployerContract: zkEVMDeployerContract.address,
        deployerAddress: deployer.address,
        timelockContractAddress: timelockContract.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        trustedSequencer,
        trustedSequencerURL,
        chainID,
        networkName,
        admin,
        trustedAggregator,
        proxyAdminAddress,
        forkID,
        salt,
        version,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
