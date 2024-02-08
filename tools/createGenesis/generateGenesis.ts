/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import yargs from "yargs/yargs";

const argv = yargs(process.argv.slice(2))
    .options({
        out: {type: "string", default: "./new_genesis.json"},
    })
    .parse() as any;

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
process.env.HARDHAT_NETWORK = "hardhat";
process.env.MNEMONIC = DEFAULT_MNEMONIC;
import {ethers, upgrades} from "hardhat";
import {MemDB, ZkEVMDB, getPoseidon, smtUtils} from "@0xpolygonhermez/zkevm-commonjs";

import {
    deployPolygonZkEVMDeployer,
    create2Deployment,
    getCreate2Address,
} from "../../deployment/helpers/deployment-helpers";
import {ProxyAdmin} from "../../typechain-types";
import {Addressable} from "ethers";
import "../../deployment/helpers/utils";

const deployParameters = require("./deploy_parameters.json");
const genesisBase = require("./genesis_base.json");

const pathOutputJson = path.join(__dirname, argv.out);

/*
 * bytes32 internal constant _ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
 * bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 */
const _ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as any;
const _IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as any;

const baseGenesisInfo = genesisBase.genesis;

// Genesis mainnet address:
const mainnetZkEVMDeployerAddress = baseGenesisInfo.find(
    (account: any) => account.contractName === "PolygonZkEVMDeployer"
).address;

const mainnetZkEVMTimelockAddress = baseGenesisInfo.find(
    (account: any) => account.contractName === "PolygonZkEVMTimelock"
).address;

const mainnetProxyAdminAddress = baseGenesisInfo.find((account: any) => account.contractName === "ProxyAdmin").address;

const mainnetZkEVMBridgeImplementationAddress = baseGenesisInfo.find(
    (account: any) => account.contractName === "PolygonZkEVMBridge implementation"
).address;

const mainnetZkEVMBridgeProxyAddress = baseGenesisInfo.find(
    (account: any) => account.contractName === "PolygonZkEVMBridge proxy"
).address;

const mainnetGlobalExitRootL2ImplementationAddress = baseGenesisInfo.find(
    (account: any) => account.contractName === "PolygonZkEVMGlobalExitRootL2 implementation"
).address;

const keylessDeployerMainnet = baseGenesisInfo.find(
    (account: any) => account.accountName === "keyless Deployer"
).address;

const deployerMainnet = baseGenesisInfo.find((account: any) => account.accountName === "deployer").address;

const mainnetMultisig = deployParameters.timelockAddress;
const mainnetInitialZkEVMDeployerOwner = deployParameters.initialZkEVMDeployerOwner;
const mainnetMinDelayTimelock = deployParameters.minDelayTimelock;

const globalExitRootL2Address = "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa";
const zkevmAddressL2 = ethers.ZeroAddress;

async function main() {
    // Constant variables
    const attemptsDeployProxy = 20;
    const balanceBrige = BigInt("0xffffffffffffffffffffffffffffffff"); // 128 bits // TODO review

    const finalGlobalExitRootL2ProxyAddress = globalExitRootL2Address;
    const genesis = [];

    const timelockAdminAddress = mainnetMultisig;
    const minDelayTimelock = mainnetMinDelayTimelock;
    const salt = "0x0000000000000000000000000000000000000000000000000000000000000000"; // salt mock
    const initialZkEVMDeployerOwner = mainnetInitialZkEVMDeployerOwner;

    const finalzkEVMDeployerAdress = mainnetZkEVMDeployerAddress;
    const finalTimelockContractAdress = mainnetZkEVMTimelockAddress;
    const finalProxyAdminAddress = mainnetProxyAdminAddress;
    const finalBridgeImplAddress = mainnetZkEVMBridgeImplementationAddress;
    const finalBridgeProxyAddress = mainnetZkEVMBridgeProxyAddress;
    const finalGlobalExitRootL2ImplAddress = mainnetGlobalExitRootL2ImplementationAddress;
    const finalKeylessDeployer = keylessDeployerMainnet;
    const finalDeployer = deployerMainnet;

    let bridgeImplementationAddress;
    let proxyBridgeAddress;
    let proxyAdminAddress;

    // Load deployer
    await ethers.provider.send("hardhat_impersonateAccount", [initialZkEVMDeployerOwner]);
    await ethers.provider.send("hardhat_setBalance", [initialZkEVMDeployerOwner, "0xffffffffffffffff"]); // 18 ethers aprox
    const deployer = await ethers.getSigner(initialZkEVMDeployerOwner);

    // Deploy PolygonZkEVMDeployer if is not deployed already
    const [zkEVMDeployerContract, keylessDeployer] = await deployPolygonZkEVMDeployer(
        initialZkEVMDeployerOwner,
        deployer
    );

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
    [proxyAdminAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionAdmin,
        dataCallAdmin,
        deployer,
        null
    );

    // Deploy implementation PolygonZkEVMBridge
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const deployTransactionBridge = (await polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = BigInt(5500000);
    [bridgeImplementationAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit
    );

    // Do not initialize the bridge!

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
            bridgeImplementationAddress as string, // must have bytecode
            proxyAdminAddress as string,
            initializeEmptyDataProxy
        )
    ).data;

    [proxyBridgeAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionProxy,
        null,
        deployer,
        null
    );

    // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
    await upgrades.forceImport(proxyBridgeAddress as string, polygonZkEVMBridgeFactory, "transparent" as any);

    /*
     *Deployment Global exit root manager
     */
    const PolygonZkEVMGlobalExitRootL2Factory = await ethers.getContractFactory(
        "PolygonZkEVMGlobalExitRootL2",
        deployer
    );
    let polygonZkEVMGlobalExitRootL2;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMGlobalExitRootL2 = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootL2Factory, [], {
                initializer: false,
                constructorArgs: [finalBridgeProxyAddress],
                unsafeAllow: ["constructor", "state-variable-immutable"],
            });
            break;
        } catch (error: any) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of polygonZkEVMGlobalExitRootL2 ", error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error("polygonZkEVMGlobalExitRootL2 contract has not been deployed");
        }
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(polygonZkEVMGlobalExitRootL2?.target as string)).to.be.equal(
        proxyAdminAddress
    );
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress as string)).to.be.equal(proxyAdminAddress);

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);
    const timelockContract = await timelockContractFactory.deploy(
        minDelayTimelock,
        [timelockAdminAddress],
        [timelockAdminAddress],
        timelockAdminAddress,
        zkevmAddressL2
    );
    await timelockContract.waitForDeployment();

    // Transfer ownership of the proxyAdmin to timelock
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (await proxyAdminInstance.connect(deployer).transferOwnership(finalTimelockContractAdress as string)).wait();

    // Recreate genesis with the current information:

    // ZKEVMDeployer
    const zkEVMDeployerInfo = await getAddressInfo(zkEVMDeployerContract.target);
    genesis.push({
        contractName: "PolygonZkEVMDeployer",
        balance: "0",
        nonce: zkEVMDeployerInfo.nonce.toString(),
        address: finalzkEVMDeployerAdress,
        bytecode: zkEVMDeployerInfo.bytecode,
        storage: zkEVMDeployerInfo.storage,
    });

    // Proxy Admin
    const proxyAdminInfo = await getAddressInfo(proxyAdminAddress as string);
    genesis.push({
        contractName: "ProxyAdmin",
        balance: "0",
        nonce: proxyAdminInfo.nonce.toString(),
        address: finalProxyAdminAddress,
        bytecode: proxyAdminInfo.bytecode,
        storage: proxyAdminInfo.storage,
    });

    // Bridge implementation
    const bridgeImplementationInfo = await getAddressInfo(bridgeImplementationAddress as string);
    genesis.push({
        contractName: "PolygonZkEVMBridge implementation",
        balance: "0",
        nonce: bridgeImplementationInfo.nonce.toString(),
        address: finalBridgeImplAddress,
        bytecode: bridgeImplementationInfo.bytecode,
        // storage: bridgeImplementationInfo.storage, implementation do not have storage
    });

    // Bridge proxy
    const bridgeProxyInfo = await getAddressInfo(proxyBridgeAddress as string);
    // Override admin and implementation slots:
    bridgeProxyInfo.storage[_ADMIN_SLOT] = ethers.zeroPadValue(finalProxyAdminAddress as string, 32);
    bridgeProxyInfo.storage[_IMPLEMENTATION_SLOT] = ethers.zeroPadValue(finalBridgeImplAddress as string, 32);

    genesis.push({
        contractName: "PolygonZkEVMBridge proxy",
        balance: balanceBrige,
        nonce: bridgeProxyInfo.nonce.toString(),
        address: finalBridgeProxyAddress,
        bytecode: bridgeProxyInfo.bytecode,
        storage: bridgeProxyInfo.storage,
    });

    // polygonZkEVMGlobalExitRootL2 implementation
    const implGlobalExitRootL2 = await upgrades.erc1967.getImplementationAddress(
        polygonZkEVMGlobalExitRootL2?.target as string
    );
    const implGlobalExitRootL2Info = await getAddressInfo(implGlobalExitRootL2);

    genesis.push({
        contractName: "PolygonZkEVMGlobalExitRootL2 implementation",
        balance: "0",
        nonce: implGlobalExitRootL2Info.nonce.toString(),
        address: finalGlobalExitRootL2ImplAddress,
        bytecode: implGlobalExitRootL2Info.bytecode,
        // storage: implGlobalExitRootL2Info.storage, , implementation do not have storage
    });

    // polygonZkEVMGlobalExitRootL2 proxy
    const proxyGlobalExitRootL2Info = await getAddressInfo(polygonZkEVMGlobalExitRootL2?.target as string);

    proxyGlobalExitRootL2Info.storage[_ADMIN_SLOT] = ethers.zeroPadValue(finalProxyAdminAddress as string, 32);
    proxyGlobalExitRootL2Info.storage[_IMPLEMENTATION_SLOT] = ethers.zeroPadValue(
        finalGlobalExitRootL2ImplAddress as string,
        32
    );

    genesis.push({
        contractName: "PolygonZkEVMGlobalExitRootL2 proxy",
        balance: "0",
        nonce: proxyGlobalExitRootL2Info.nonce.toString(),
        address: finalGlobalExitRootL2ProxyAddress,
        bytecode: proxyGlobalExitRootL2Info.bytecode,
        storage: proxyGlobalExitRootL2Info.storage,
    });

    // Timelock
    const timelockInfo = await getAddressInfo(timelockContract.target);

    /*
     * Since roles are used, most storage are writted in peusdoRandom storage slots
     * bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
     * bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
     * bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
     * bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
     */
    const timelockRolesHash = [
        ethers.id("TIMELOCK_ADMIN_ROLE"),
        ethers.id("PROPOSER_ROLE"),
        ethers.id("EXECUTOR_ROLE"),
        ethers.id("CANCELLER_ROLE"),
    ];

    for (let i = 0; i < timelockRolesHash.length; i++) {
        const rolesMappingStoragePositionStruct = 0;
        const storagePosition = ethers.solidityPackedKeccak256(
            ["uint256", "uint256"],
            [timelockRolesHash[i], rolesMappingStoragePositionStruct]
        );

        // check timelock address manager, and timelock address itself
        const addressArray = [timelockAdminAddress, timelockContract.target];
        for (let j = 0; j < addressArray.length; j++) {
            const storagePositionRole = ethers.solidityPackedKeccak256(
                ["uint256", "uint256"],
                [addressArray[j], storagePosition]
            );
            const valueRole = await ethers.provider.getStorage(timelockContract.target, storagePositionRole);
            if (valueRole !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                timelockInfo.storage[storagePositionRole] = valueRole;
            }
        }
        const roleAdminSlot = ethers.zeroPadValue(ethers.toQuantity(ethers.toBigInt(storagePosition) + 1n), 32);
        const valueRoleAdminSlot = await ethers.provider.getStorage(timelockContract.target, roleAdminSlot);
        if (valueRoleAdminSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            timelockInfo.storage[roleAdminSlot] = valueRoleAdminSlot;
        }
    }

    genesis.push({
        contractName: "PolygonZkEVMTimelock",
        balance: "0",
        nonce: timelockInfo.nonce.toString(),
        address: finalTimelockContractAdress,
        bytecode: timelockInfo.bytecode,
        storage: timelockInfo.storage,
    });

    // Put nonces on deployers

    // Keyless deployer
    genesis.push({
        accountName: "keyless Deployer",
        balance: "0",
        nonce: "1",
        address: finalKeylessDeployer,
    });

    // deployer
    const deployerInfo = await getAddressInfo(deployer.address);
    genesis.push({
        accountName: "deployer",
        balance: "0",
        nonce: deployerInfo.nonce.toString(),
        address: finalDeployer,
    });

    if (deployParameters.test) {
        // Add tester account with ether
        genesis[genesis.length - 1].balance = "100000000000000000000000";
    }

    // calculate root
    const poseidon = await getPoseidon();
    const {F} = poseidon;
    const db = new MemDB(F);
    const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
    const accHashInput = [F.zero, F.zero, F.zero, F.zero];
    const defaultChainId = 1000;

    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        genesisRoot,
        accHashInput,
        genesis,
        null,
        null,
        defaultChainId
    );

    fs.writeFileSync(
        pathOutputJson,
        JSON.stringify(
            {
                root: smtUtils.h4toString(zkEVMDB.stateRoot),
                genesis,
            },
            null,
            1
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

async function getAddressInfo(address: string | Addressable) {
    const nonce = await ethers.provider.getTransactionCount(address);
    const bytecode = await ethers.provider.getCode(address);

    const storage = {} as {
        [key: string]: number | string;
    };

    for (let i = 0; i < 200; i++) {
        const storageValue = await ethers.provider.getStorage(address, i);
        if (storageValue !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            storage[ethers.toBeHex(i, 32)] = storageValue;
        }
    }

    const valueAdminSlot = await ethers.provider.getStorage(address, _ADMIN_SLOT);
    if (valueAdminSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        storage[_ADMIN_SLOT] = valueAdminSlot;
    }
    const valuImplementationSlot = await ethers.provider.getStorage(address, _IMPLEMENTATION_SLOT);
    if (valuImplementationSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        storage[_IMPLEMENTATION_SLOT] = valuImplementationSlot;
    }

    return {nonce, bytecode, storage};
}
