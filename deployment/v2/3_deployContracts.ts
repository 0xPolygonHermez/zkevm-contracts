/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";

const {create2Deployment} = require("../helpers/deployment-helpers");

const pathOutputJson = path.join(__dirname, "./deploy_output.json");
const pathOngoingDeploymentJson = path.join(__dirname, "./deploy_ongoing.json");

const deployParameters = require("./deploy_parameters.json");

const pathOZUpgradability = path.join(__dirname, `../../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

import {
    PolygonZkEVMBridgeV2,
    PolygonZkEVMDeployer,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMTimelock,
    ProxyAdmin,
} from "../../typechain-types";
import "../helpers/utils";

const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");
const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id("OBSOLETE_ROLLUP_TYPE_ROLE");
const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");
const ADD_EXISTING_ROLLUP_ROLE = ethers.id("ADD_EXISTING_ROLLUP_ROLE");
const UPDATE_ROLLUP_ROLE = ethers.id("UPDATE_ROLLUP_ROLE");
const TRUSTED_AGGREGATOR_ROLE = ethers.id("TRUSTED_AGGREGATOR_ROLE");
const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id("TRUSTED_AGGREGATOR_ROLE_ADMIN");
const TWEAK_PARAMETERS_ROLE = ethers.id("TWEAK_PARAMETERS_ROLE");
const SET_FEE_ROLE = ethers.id("SET_FEE_ROLE");
const STOP_EMERGENCY_ROLE = ethers.id("STOP_EMERGENCY_ROLE");
const EMERGENCY_COUNCIL_ROLE = ethers.id("EMERGENCY_COUNCIL_ROLE");
const EMERGENCY_COUNCIL_ADMIN = ethers.id("EMERGENCY_COUNCIL_ADMIN");

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
    const gasTokenMetadata = "0x";

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "timelockAdminAddress",
        "minDelayTimelock",
        "salt",
        "admin",
        "trustedAggregator",
        "trustedAggregatorTimeout",
        "pendingStateTimeout",
        "emergencyCouncilAddress",
        "zkEVMDeployerAddress",
        "polTokenAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        admin,
        trustedAggregator,
        trustedAggregatorTimeout,
        pendingStateTimeout,
        emergencyCouncilAddress,
        timelockAdminAddress,
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

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
        deployer
    );
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

    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress) as ProxyAdmin;
    const proxyAdminOwner = await proxyAdminInstance.owner();
    if (proxyAdminOwner !== deployer.address) {
        throw new Error(
            `Proxy admin was deployed, but the owner is not the deployer, deployer address: ${deployer.address}, proxyAdmin: ${proxyAdminOwner}`
        );
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

    let precalculateGlobalExitRootAddress;
    let precalculateRollupManager;
    let timelockContract;

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // Check if the contract is already deployed
    if (
        ongoingDeployment.polygonZkEVMGlobalExitRoot &&
        ongoingDeployment.polygonRollupManagerContract &&
        ongoingDeployment.polygonTimelock
    ) {
        precalculateGlobalExitRootAddress = ongoingDeployment.polygonZkEVMGlobalExitRoot;
        precalculateRollupManager = ongoingDeployment.polygonRollupManagerContract;
        timelockContract = timelockContractFactory.attach(ongoingDeployment.polygonTimelock) as PolygonZkEVMTimelock;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.polygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.polygonRollupManagerContract;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Nonce globalExitRoot: currentNonce + 1 (deploy bridge proxy) + 1(impl globalExitRoot)
        // + 1 (deployTimelock) + 1 (transfer Ownership Admin) = +4
        const nonceProxyGlobalExitRoot = Number(await ethers.provider.getTransactionCount(deployer.address)) + 4;
        // nonceProxyRollupManager :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl rollupManager) = +2
        const nonceProxyRollupManager = nonceProxyGlobalExitRoot + 2;

        // Contracts are not deployed, normal deployment
        precalculateGlobalExitRootAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyGlobalExitRoot,
        });
        precalculateRollupManager = ethers.getCreateAddress({from: deployer.address, nonce: nonceProxyRollupManager});

        // deploy timelock
        console.log("\n#######################");
        console.log("##### Deployment TimelockContract  #####");
        console.log("#######################");
        console.log("minDelayTimelock:", minDelayTimelock);
        console.log("timelockAdminAddress:", timelockAdminAddress);
        console.log("Rollup Manager:", precalculateRollupManager);
        timelockContract = await timelockContractFactory.deploy(
            minDelayTimelock,
            [timelockAdminAddress],
            [timelockAdminAddress],
            timelockAdminAddress,
            precalculateRollupManager
        );
        await timelockContract.waitForDeployment();
        console.log("#######################\n");
        console.log("Polygon timelockContract deployed to:", timelockContract.target);
    }
    // Transfer ownership of the proxyAdmin to timelock
    await (await proxyAdminInstance.transferOwnership(timelockContract.target)).wait();

    console.log("\n#######################");
    console.log("#####  Checks TimelockContract  #####");
    console.log("#######################");
    //console.log("minDelayTimelock:", await timelockContract.getMinDelay());
    console.log("polygonZkEVM (Rollup Manager):", await timelockContract.polygonZkEVM());

    /*
     * deploy proxy
     * Do not initialize directly the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
        deployer
    );
    const initializeEmptyDataProxy = "0x";
    const deployTransactionProxy = (
        await transparentProxyFactory.getDeployTransaction(
            bridgeImplementationAddress,
            proxyAdminAddress,
            initializeEmptyDataProxy
        )
    ).data;

    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData("initialize", [
        networkIDMainnet,
        gasTokenAddressMainnet,
        gasTokenNetworkMainnet,
        precalculateGlobalExitRootAddress,
        precalculateRollupManager,
        gasTokenMetadata,
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
    console.log("Rollup Manager:", await polygonZkEVMBridgeContract.polygonRollupManager());

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically (admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, polygonZkEVMBridgeFactory, "transparent" as any);

    /*
     *Deployment Global exit root manager
     */
    let polygonZkEVMGlobalExitRoot;
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

    const timelockAddressRollupManager = deployParameters.test ? deployer.address : timelockContract.target;

    // deploy Rollup Manager
    console.log("\n#######################");
    console.log("##### Deployment Rollup Manager #####");
    console.log("#######################");
    console.log("deployer:", deployer.address);
    console.log("PolygonZkEVMGlobalExitRootAddress:", polygonZkEVMGlobalExitRoot?.target);
    console.log("polTokenAddress:", polTokenAddress);
    console.log("polygonZkEVMBridgeContract:", polygonZkEVMBridgeContract.target);

    console.log("trustedAggregator:", trustedAggregator);
    console.log("pendingStateTimeout:", pendingStateTimeout);
    console.log("trustedAggregatorTimeout:", trustedAggregatorTimeout);
    console.log("admin:", admin);
    console.log("timelockContract:", timelockAddressRollupManager);
    console.log("emergencyCouncilAddress:", emergencyCouncilAddress);

    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerNotUpgraded", deployer);

    let polygonRollupManagerContract: any;
    let deploymentBlockNumber;
    if (!ongoingDeployment.polygonRollupManagerContract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonRollupManagerContract = await upgrades.deployProxy(
                    PolygonRollupManagerFactory,
                    [
                        trustedAggregator,
                        pendingStateTimeout,
                        trustedAggregatorTimeout,
                        admin,
                        timelockAddressRollupManager,
                        emergencyCouncilAddress,
                        ethers.ZeroAddress, // unused parameter
                        ethers.ZeroAddress, // unused parameter
                        0, // unused parameter
                        0, // unused parameter
                    ],
                    {
                        initializer: "initialize",
                        constructorArgs: [
                            polygonZkEVMGlobalExitRoot?.target,
                            polTokenAddress,
                            polygonZkEVMBridgeContract.target,
                        ],
                        unsafeAllow: ["constructor", "state-variable-immutable"],
                    }
                );

                break;
            } catch (error: any) {
                console.log(`attempt ${i}`);
                console.log("upgrades.deployProxy of polygonRollupManagerContract ", error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error("Rollup Manager contract has not been deployed");
            }
        }

        expect(precalculateRollupManager).to.be.equal(polygonRollupManagerContract?.target);

        console.log("#######################\n");
        console.log("polygonRollupManagerContract deployed to:", polygonRollupManagerContract?.target);

        // save an ongoing deployment
        ongoingDeployment.polygonRollupManagerContract = polygonRollupManagerContract?.target;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
        deploymentBlockNumber = (await polygonRollupManagerContract?.deploymentTransaction().wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateRollupManager).to.be.equal(ongoingDeployment.polygonRollupManagerContract);
        polygonRollupManagerContract = PolygonRollupManagerFactory.attach(
            ongoingDeployment.polygonRollupManagerContract
        );

        console.log("#######################\n");
        console.log(
            "polygonRollupManagerContract already deployed on: ",
            ongoingDeployment.polygonRollupManagerContract
        );

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(
            ongoingDeployment.polygonRollupManagerContract,
            PolygonRollupManagerFactory,
            "transparent" as any
        );

        deploymentBlockNumber = 0;
    }

    console.log("\n#######################");
    console.log("#####    Checks  Rollup Manager  #####");
    console.log("#######################");
    console.log("PolygonZkEVMGlobalExitRootAddress:", await polygonRollupManagerContract.globalExitRootManager());
    console.log("polTokenAddress:", await polygonRollupManagerContract.pol());
    console.log("polygonZkEVMBridgeContract:", await polygonRollupManagerContract.bridgeAddress());

    console.log("pendingStateTimeout:", await polygonRollupManagerContract.pendingStateTimeout());
    console.log("trustedAggregatorTimeout:", await polygonRollupManagerContract.trustedAggregatorTimeout());

    // Check roles
    expect(await polygonRollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelockAddressRollupManager)).to.be.equal(
        true
    );
    expect(await polygonRollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelockAddressRollupManager)).to.be.equal(
        true
    );
    expect(await polygonRollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelockAddressRollupManager)).to.be.equal(
        true
    );
    expect(
        await polygonRollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelockAddressRollupManager)
    ).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator)).to.be.equal(true);

    expect(await polygonRollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin)).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin)).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin)).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin)).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(SET_FEE_ROLE, admin)).to.be.equal(true);
    expect(await polygonRollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin)).to.be.equal(true);

    expect(await polygonRollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncilAddress)).to.be.equal(
        true
    );
    expect(await polygonRollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncilAddress)).to.be.equal(
        true
    );

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(precalculateRollupManager)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGlobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    const outputJson = {
        polygonRollupManagerAddress: polygonRollupManagerContract.target,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.target,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot?.target,
        polTokenAddress,
        zkEVMDeployerContract: zkEVMDeployerContract.target,
        deployerAddress: deployer.address,
        timelockContractAddress: timelockContract.target,
        deploymentRollupManagerBlockNumber: deploymentBlockNumber,
        upgradeToULxLyBlockNumber: deploymentBlockNumber,
        admin,
        trustedAggregator,
        proxyAdminAddress,
        salt,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
