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
import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";

const pathOZUpgradability = path.join(__dirname, `../../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);
const genesis = require("./genesis.json");

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
        "realVerifier",
        "trustedSequencerURL",
        "networkName",
        "description",
        "trustedSequencer",
        "chainID",
        "adminZkEVM",
        "oldForkID",
        "newForkID",
        "version",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        timelockAdminAddress,
        minDelayTimelock,
        salt,
        admin,
        trustedAggregator,
        trustedAggregatorTimeout,
        pendingStateTimeout,
        emergencyCouncilAddress,
        zkEVMDeployerAddress,
        polTokenAddress,
        realVerifier,
        trustedSequencerURL,
        networkName,
        description,
        trustedSequencer,
        chainID,
        adminZkEVM,
        oldForkID,
        newForkID,
        version,
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

    // deploy veriferi
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
    let precalculateZkevmAddress;
    let timelockContract;

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // Check if the contract is already deployed
    if (
        ongoingDeployment.polygonZkEVMGlobalExitRoot &&
        ongoingDeployment.polygonZkEVMContract &&
        ongoingDeployment.polygonTimelock
    ) {
        precalculateGlobalExitRootAddress = ongoingDeployment.polygonZkEVMGlobalExitRoot;
        precalculateZkevmAddress = ongoingDeployment.polygonZkEVMContract;
        timelockContract = timelockContractFactory.attach(ongoingDeployment.polygonTimelock) as PolygonZkEVMTimelock;
    } else {
        // If both are not deployed, it's better to deploy them both again
        delete ongoingDeployment.polygonZkEVMGlobalExitRoot;
        delete ongoingDeployment.polygonZkEVMContract;
        delete ongoingDeployment.polygonTimelock;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));

        // Nonce globalExitRoot: currentNonce + 1 (deploy bridge proxy) + 1(impl globalExitRoot)
        // + 1 (deployTimelock)  = +3
        const nonceProxyGlobalExitRoot = Number(await ethers.provider.getTransactionCount(deployer.address)) + 3;
        // nonceProxyRollupManager :Nonce globalExitRoot + 1 (proxy globalExitRoot) + 1 (impl zkEVM) = +2
        const nonceProxyZkevm = nonceProxyGlobalExitRoot + 2;

        // Contracts are not deployed, normal deployment
        precalculateGlobalExitRootAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyGlobalExitRoot,
        });
        precalculateZkevmAddress = ethers.getCreateAddress({from: deployer.address, nonce: nonceProxyZkevm});

        // deploy timelock
        console.log("\n#######################");
        console.log("##### Deployment TimelockContract  #####");
        console.log("#######################");
        console.log("minDelayTimelock:", minDelayTimelock);
        console.log("timelockAdminAddress:", timelockAdminAddress);
        console.log("Rollup Manager:", precalculateZkevmAddress);
        timelockContract = await timelockContractFactory.deploy(
            minDelayTimelock,
            [timelockAdminAddress],
            [timelockAdminAddress],
            timelockAdminAddress,
            precalculateZkevmAddress
        );
        await timelockContract.waitForDeployment();
        console.log("#######################\n");
        console.log("Polygon timelockContract deployed to:", timelockContract.target);
    }

    console.log("\n#######################");
    console.log("#####  Checks TimelockContract  #####");
    console.log("#######################");
    //console.log("minDelayTimelock:", await timelockContract.getMinDelay());
    console.log("polygonZkEVM:", await timelockContract.polygonZkEVM());

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
        precalculateZkevmAddress,
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
        expect(precalculateZkevmAddress).to.be.equal(await polygonZkEVMBridgeContract.polygonRollupManager());
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
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    if (!ongoingDeployment.polygonZkEVMGlobalExitRoot) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
                    initializer: false,
                    constructorArgs: [precalculateZkevmAddress, proxyBridgeAddress],
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
        expect(precalculateZkevmAddress).to.be.equal(await polygonZkEVMGlobalExitRoot.rollupManager());
    }

    // deploy zkEVM
    console.log("\n#######################");
    console.log("##### Deployment Polygon ZK-EVM #####");
    console.log("#######################");
    console.log("deployer:", deployer.address);
    console.log("PolygonZkEVMGlobalExitRootAddress:", polygonZkEVMGlobalExitRoot?.target);
    console.log("polTokenAddress:", polTokenAddress);
    console.log("verifierAddress:", verifierContract.target);
    console.log("polygonZkEVMBridgeContract:", polygonZkEVMBridgeContract.target);

    console.log("trustedAggregator:", trustedAggregator);
    console.log("pendingStateTimeout:", pendingStateTimeout);
    console.log("trustedAggregatorTimeout:", trustedAggregatorTimeout);
    console.log("admin:", adminZkEVM);
    console.log("chainID:", chainID);
    console.log("trustedSequencer:", trustedSequencer);

    console.log("genesisRoot:", genesis.root);
    console.log("trustedSequencerURL:", trustedSequencerURL);
    console.log("networkName:", networkName);
    console.log("forkID:", oldForkID);
    console.log("emergencyCouncilAddress:", emergencyCouncilAddress);

    const PolygonZkEVMFactory = await ethers.getContractFactory("PolygonZkEVM", deployer);

    let polygonZkEVMContract: any;
    let deploymentBlockNumber;

    if (!ongoingDeployment.polygonZkEVMContract) {
        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonZkEVMContract = await upgrades.deployProxy(
                    PolygonZkEVMFactory,
                    [
                        {
                            admin: deployer.address, // should be admin, will be transfered afterwards
                            trustedSequencer: deployer.address, // should be trusted seuquencer, will be transfered afterwards
                            pendingStateTimeout: pendingStateTimeout,
                            trustedAggregator: deployer.address, // should be trusted aggregator, will be transfered afterwards
                            trustedAggregatorTimeout: trustedAggregatorTimeout,
                        },
                        genesis.root,
                        trustedSequencerURL,
                        networkName,
                        version,
                    ],
                    {
                        constructorArgs: [
                            polygonZkEVMGlobalExitRoot?.target,
                            polTokenAddress,
                            verifierContract.target,
                            polygonZkEVMBridgeContract.target,
                            chainID,
                            oldForkID,
                        ],
                        unsafeAllow: ["constructor", "state-variable-immutable"],
                    }
                );

                break;
            } catch (error: any) {
                console.log(`attempt ${i}`);
                console.log("upgrades.deployProxy of polygonZkEVMContract ", error.message);
            }

            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error("PolygonZkEVM contract has not been deployed");
            }
        }

        expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract?.target);

        console.log("#######################\n");
        console.log("polygonZkEVMContract deployed to:", polygonZkEVMContract?.target);

        // save an ongoing deployment
        ongoingDeployment.polygonZkEVMContract = polygonZkEVMContract?.target;
        fs.writeFileSync(pathOngoingDeploymentJson, JSON.stringify(ongoingDeployment, null, 1));
        deploymentBlockNumber = (await polygonZkEVMContract?.deploymentTransaction().wait()).blockNumber;
    } else {
        // Expect the precalculate address matches de onogin deployment, sanity check
        expect(precalculateZkevmAddress).to.be.equal(ongoingDeployment.polygonZkEVMContract);
        polygonZkEVMContract = PolygonZkEVMFactory.attach(ongoingDeployment.polygonZkEVMContract);

        console.log("#######################\n");
        console.log("polygonZkEVMContract already deployed on: ", ongoingDeployment.polygonZkEVMContract);

        // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
        await upgrades.forceImport(ongoingDeployment.polygonZkEVMContract, PolygonZkEVMFactory, "transparent" as any);

        deploymentBlockNumber = 0;
    }

    console.log("\n#######################");
    console.log("#####    Checks  PolygonZkEVM  #####");
    console.log("#######################");
    console.log("PolygonZkEVMGlobalExitRootAddress:", await polygonZkEVMContract.globalExitRootManager());
    console.log("polTokenAddres:", await polygonZkEVMContract.matic());
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
    expect(await upgrades.erc1967.getAdminAddress(precalculateZkevmAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(precalculateGlobalExitRootAddress)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    // Load genesis on a zkEVMDB
    const poseidon = await getPoseidon();
    const {F} = poseidon;
    const db = new MemDB(F);
    const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
    const accHashInput = [F.zero, F.zero, F.zero, F.zero];
    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );

    // Build batch params
    const currentTimestamp = (await currentProvider.getBlock("latest"))?.timestamp;
    const options = {skipUpdateSystemStorage: false};
    const batch = await zkEVMDB.buildBatch(
        currentTimestamp,
        trustedSequencer,
        smtUtils.stringToH4(ethers.ZeroHash),
        undefined,
        options
    );

    // Load signer
    const signer = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
        "m/44'/60'/0'/0/0"
    ).connect(currentProvider);

    let initialNonceGenesis = 8;
    const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock", deployer);

    const txArray = [
        // test normal ether transfer
        ethers.Transaction.from({
            to: deployer.address,
            nonce: initialNonceGenesis++,
            value: 1,
            gasLimit: 21000,
            gasPrice: 1,
            data: "0x",
            chainId: chainID,
            type: 0, // legacy transaction
        }),
        // test deployment transactions
        ethers.Transaction.from({
            to: null,
            nonce: initialNonceGenesis++,
            value: 0,
            gasLimit: 10000000,
            gasPrice: 1,
            data: (
                await polTokenFactory.getDeployTransaction(
                    "Polygon Token",
                    "POL",
                    deployer.address,
                    ethers.parseEther("1000")
                )
            ).data,
            chainId: chainID,
            type: 0, // legacy transaction
        }),
    ];

    for (let i = 0; i < txArray.length; i++) {
        const currentTx = txArray[i];
        const signedTx = await signer.signTransaction(currentTx);
        const newTx = processorUtils.rawTxToCustomRawTx(signedTx);
        // Add the raw tx to the batch builder
        batch.addRawTx(newTx);
    }

    // execute the transactions added to the batch
    await batch.executeTxs();
    // consolidate state
    await zkEVMDB.consolidate(batch);

    const sequence = {
        transactions: batch.getBatchL2Data(),
        globalExitRoot: ethers.ZeroHash,
        timestamp: currentTimestamp,
        minForcedTimestamp: 0,
    } as any;

    // Approve tokens
    const maticAmount = ethers.parseEther("1");
    const polTokenContract = polTokenFactory.attach(polTokenAddress) as any;
    await (await polTokenContract.approve(polygonZkEVMContract.target, maticAmount)).wait();

    // Sequence batches
    await (await polygonZkEVMContract.sequenceBatches([sequence], trustedSequencer)).wait();

    // Verify batches
    const oldBatch = 0;
    const newBatch = 1;
    const newRoot = smtUtils.h4toString(batch.currentStateRoot);
    const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);

    await (
        await polygonZkEVMContract.verifyBatchesTrustedAggregator(
            0, // pending state not used
            oldBatch,
            newBatch,
            ethers.ZeroHash, // local exit root
            newRoot,
            zkProofFFlonk
        )
    ).wait();

    // TRrnsfer roles
    await (await polygonZkEVMContract.setTrustedSequencer(trustedSequencer)).wait();
    await (await polygonZkEVMContract.setTrustedAggregator(trustedAggregator)).wait();
    await (await polygonZkEVMContract.transferAdminRole(adminZkEVM)).wait();

    // Update current system to rollup manager
    const PolygonZkEVMV2ExistentFactory = await ethers.getContractFactory("PolygonZkEVMExistentEtrog");

    const newPolygonZkEVMContract = (await upgrades.deployProxy(PolygonZkEVMV2ExistentFactory, [], {
        initializer: false,
        constructorArgs: [
            polygonZkEVMGlobalExitRoot?.target,
            polTokenAddress,
            polygonZkEVMBridgeContract.target,
            polygonZkEVMContract.target,
        ],
        unsafeAllow: ["constructor", "state-variable-immutable"],
    })) as any;

    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
    const txRollupManager = await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactory, {
        constructorArgs: [polygonZkEVMGlobalExitRoot?.target, polTokenAddress, polygonZkEVMBridgeContract.target],
        unsafeAllow: ["constructor", "state-variable-immutable"],
        unsafeAllowRenames: false,
        call: {
            fn: "initialize",
            args: [
                trustedAggregator,
                pendingStateTimeout,
                trustedAggregatorTimeout,
                admin,
                timelockAdminAddress,
                emergencyCouncilAddress,
                newPolygonZkEVMContract.target,
                verifierContract.target,
                newForkID,
                chainID,
            ],
        },
    });
    await txRollupManager.waitForDeployment();

    // Transfer ownership of the proxyAdmin to timelock
    await (await proxyAdminInstance.transferOwnership(timelockContract.target)).wait();

    const outputJson = {
        polygonRollupManager: polygonZkEVMContract.target,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.target,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot?.target,
        newPolygonZkEVM: newPolygonZkEVMContract.target,
        polTokenAddress,
        zkEVMDeployerContract: zkEVMDeployerContract.target,
        deployerAddress: deployer.address,
        timelockContractAddress: timelockContract.target,
        deploymentBlockNumber,
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
