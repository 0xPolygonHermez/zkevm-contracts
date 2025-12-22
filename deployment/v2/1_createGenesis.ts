/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { ethers, upgrades } from 'hardhat';
import { MemDB, ZkEVMDB, getPoseidon, smtUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { deployPolygonZkEVMDeployer, create2Deployment, getAddressInfo } from '../helpers/deployment-helpers';
import { ProxyAdmin } from '../../typechain-types';
import { GENESIS_CONTRACT_NAMES } from '../../src/constants';
import '../helpers/utils';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const argv = yargs(process.argv.slice(2))
    .options({
        test: { type: 'boolean', default: false },
        input: { type: 'string', default: './deploy_parameters.json' },
        out: { type: 'string', default: './genesis.json' },
    })
    .parse() as any;

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';
process.env.HARDHAT_NETWORK = 'hardhat';
process.env.MNEMONIC = argv.test ? DEFAULT_MNEMONIC : process.env.MNEMONIC;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const deployParameters = require(argv.input);
const pathOutputJson = path.join(__dirname, argv.out);

/*
 * bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
 * bytes32 internal constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 */
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as any;
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as any;

// Genesis mainnet address:
const mainnetZkEVMDeployerAddress = '0xCB19eDdE626906eB1EE52357a27F62dd519608C2';
const mainnetZkEVMTimelockAddress = '0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13';
const mainnetProxyAdminAddress = '0x0F99738B2Fc14D77308337f3e2596b63aE7BCC4A';
const mainnetZkEVMBridgeImplementationAddress = '0x5ac4182A1dd41AeEf465E40B82fd326BF66AB82C';
const mainnetZkEVMBridgeProxyAddress = '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe';
const mainnetGlobalExitRootL2ImplementationAddress = '0x0200143Fa295EE4dffEF22eE2616c2E008D81688';

const keylessDeployerMainnet = '0x9d90066e7478496e2284E54c3548106bb4F90E50';
const deployerMainnet = '0x4c1665d6651ecEfa59B9B3041951608468b18891';

const mainnetMultisig = '0x4c1665d6651ecEfa59B9B3041951608468b18891';
const mainnetInitialZkEVMDeployerOwner = '0x4c1665d6651ecEfa59B9B3041951608468b18891';
const mainnetMinDelayTimelock = 864000;

const globalExitRootL2Address = '0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa';
const zkevmAddressL2 = ethers.ZeroAddress;

async function main() {
    // Constant variables
    const attemptsDeployProxy = 20;
    const balanceBridge = BigInt('0xffffffffffffffffffffffffffffffff'); // 128 bits

    let timelockAdminAddress;
    let initialZkEVMDeployerOwner;
    let salt;
    let minDelayTimelock;

    let finalBridgeImplAddress;
    let finalBridgeProxyAddress;
    let finalProxyAdminAddress;
    let finalTimelockContractAddress;
    let finalZkEVMDeployerAddress;

    const finalGlobalExitRootL2ProxyAddress = globalExitRootL2Address;

    let finalGlobalExitRootL2ImplAddress;

    let finalKeylessDeployer;
    let finalDeployer;

    const genesis = [];

    // Check if it's mainnet deployment
    const isMainnet = deployParameters.isMainnet === true;

    if (isMainnet === true) {
        timelockAdminAddress = mainnetMultisig;
        minDelayTimelock = mainnetMinDelayTimelock;
        salt = '0x0000000000000000000000000000000000000000000000000000000000000000'; // salt mock
        initialZkEVMDeployerOwner = mainnetInitialZkEVMDeployerOwner;

        finalZkEVMDeployerAddress = mainnetZkEVMDeployerAddress;
        finalTimelockContractAddress = mainnetZkEVMTimelockAddress;
        finalProxyAdminAddress = mainnetProxyAdminAddress;
        finalBridgeImplAddress = mainnetZkEVMBridgeImplementationAddress;
        finalBridgeProxyAddress = mainnetZkEVMBridgeProxyAddress;
        finalGlobalExitRootL2ImplAddress = mainnetGlobalExitRootL2ImplementationAddress;
        finalKeylessDeployer = keylessDeployerMainnet;
        finalDeployer = deployerMainnet;
    } else {
        // load deploy parameters
        const mandatoryDeploymentParameters = [
            'timelockAdminAddress',
            'minDelayTimelock',
            'salt',
            'initialZkEVMDeployerOwner',
        ];

        for (const parameterName of mandatoryDeploymentParameters) {
            if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === '') {
                throw new Error(`Missing parameter: ${parameterName}`);
            }
        }
        ({ timelockAdminAddress, minDelayTimelock, salt, initialZkEVMDeployerOwner } = deployParameters);
    }

    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [initialZkEVMDeployerOwner]);
    await ethers.provider.send('hardhat_setBalance', [initialZkEVMDeployerOwner, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(initialZkEVMDeployerOwner);

    // Deploy PolygonZkEVMDeployer if is not deployed already
    const [zkEVMDeployerContract, keylessDeployer] = await deployPolygonZkEVMDeployer(
        initialZkEVMDeployerOwner,
        deployer,
    );
    if (isMainnet === false) {
        finalDeployer = deployer.address;
        finalKeylessDeployer = keylessDeployer;
        finalZkEVMDeployerAddress = zkEVMDeployerContract.target;
    }
    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        deployer,
    );
    const deployTransactionAdmin = (await proxyAdminFactory.getDeployTransaction()).data;
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData('transferOwnership', [deployer.address]);
    const [proxyAdminAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionAdmin,
        dataCallAdmin,
        deployer,
        null,
    );

    if (isMainnet === false) {
        finalProxyAdminAddress = proxyAdminAddress;
    }

    // Deploy implementation PolygonZkEVMBridge
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.BRIDGE_V2, deployer);
    const deployTransactionBridge = (await polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = BigInt(10500000);
    const [bridgeImplementationAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit,
    );

    // Retrieve bridge contract instance
    const bridgeContract = polygonZkEVMBridgeFactory.attach(bridgeImplementationAddress) as AgglayerBridge;

    if (isMainnet === false) {
        finalBridgeImplAddress = bridgeImplementationAddress;
    }

    // Retrieve wrappedTokenBridgeImplementation contract to add it to the genesis, necessary for token wrapped deployments from the bridge
    const wrappedTokenImplementationAddress = await bridgeContract.getWrappedTokenBridgeImplementation();

    const wrappedTokenImplementationInfo = await getAddressInfo(wrappedTokenImplementationAddress as string);
    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
        balance: '0',
        nonce: wrappedTokenImplementationInfo.nonce.toString(),
        address: wrappedTokenImplementationAddress,
        bytecode: wrappedTokenImplementationInfo.bytecode,
        storage: wrappedTokenImplementationInfo.storage, // preserve initialization state from _disableInitializers() call in constructor
    });

    // Retrieve bridgeLib contract to add it to the genesis
    const bridgeLibAddress = await bridgeContract.bridgeLib();

    const bridgeLibInfo = await getAddressInfo(bridgeLibAddress as string);
    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.BRIDGE_LIB,
        balance: '0',
        nonce: bridgeLibInfo.nonce.toString(),
        address: bridgeLibAddress,
        bytecode: bridgeLibInfo.bytecode,
    });

    // Do not initialize the bridge!

    /*
     * deploy proxy
     * Do not initialize directly the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );
    const initializeEmptyDataProxy = '0x';
    const deployTransactionProxy = (
        await transparentProxyFactory.getDeployTransaction(
            bridgeImplementationAddress as string, // must have bytecode
            proxyAdminAddress as string,
            initializeEmptyDataProxy,
        )
    ).data;

    const [proxyBridgeAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionProxy,
        null,
        deployer,
        null,
    );

    if (isMainnet === false) {
        finalBridgeProxyAddress = proxyBridgeAddress;
    }

    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically ( admin/impl)
    await upgrades.forceImport(proxyBridgeAddress as string, polygonZkEVMBridgeFactory, 'transparent' as any);

    /*
     *Deployment Global exit root manager
     */
    const PolygonZkEVMGlobalExitRootL2Factory = await ethers.getContractFactory(
        GENESIS_CONTRACT_NAMES.GER_L2,
        deployer,
    );
    let polygonZkEVMGlobalExitRootL2;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            // ProxyAdmin:
            //  - it uses the already deployed ProxyAdmin (added into the manifest file)
            //  - 'proxyAdminAddress' will be used a the ProxyAdmin
            // TransparentUpgradeableProxy:
            //   - internally it uses the following artifact when deploying the 'TransparentUpgradeableProxy'
            //   - artifact: @openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json
            //   - build-info: @openzeppelin/upgrades-core/artifacts/build-info.json
            //      - "solcVersion": "0.8.9",
            //      - "solcLongVersion": "0.8.9+commit.e5eed63a",
            polygonZkEVMGlobalExitRootL2 = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootL2Factory, [], {
                initializer: false,
                constructorArgs: [finalBridgeProxyAddress],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });
            break;
        } catch (error: any) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZkEVMGlobalExitRootL2 ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('polygonZkEVMGlobalExitRootL2 contract has not been deployed');
        }
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(polygonZkEVMGlobalExitRootL2?.target as string)).to.be.equal(
        proxyAdminAddress,
    );
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress as string)).to.be.equal(proxyAdminAddress);

    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = await timelockContractFactory.deploy(
        minDelayTimelock,
        [timelockAdminAddress],
        [timelockAdminAddress],
        timelockAdminAddress,
        zkevmAddressL2,
    );
    await timelockContract.waitForDeployment();
    if (isMainnet === false) {
        finalTimelockContractAddress = timelockContract.target;
    }

    // Transfer ownership of the proxyAdmin to timelock
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (await proxyAdminInstance.connect(deployer).transferOwnership(finalTimelockContractAddress as string)).wait();

    // Recreate genesis with the current information:

    // ZKEVMDeployer
    const zkEVMDeployerInfo = await getAddressInfo(zkEVMDeployerContract.target);
    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.POLYGON_DEPLOYER,
        balance: '0',
        nonce: zkEVMDeployerInfo.nonce.toString(),
        address: finalZkEVMDeployerAddress,
        bytecode: zkEVMDeployerInfo.bytecode,
        storage: zkEVMDeployerInfo.storage,
    });

    // Proxy Admin
    const proxyAdminInfo = await getAddressInfo(proxyAdminAddress as string);
    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.PROXY_ADMIN,
        balance: '0',
        nonce: proxyAdminInfo.nonce.toString(),
        address: finalProxyAdminAddress,
        bytecode: proxyAdminInfo.bytecode,
        storage: proxyAdminInfo.storage,
    });

    // Bridge implementation
    const bridgeImplementationInfo = await getAddressInfo(bridgeImplementationAddress as string);
    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.BRIDGE_V2_IMPLEMENTATION,
        balance: '0',
        nonce: bridgeImplementationInfo.nonce.toString(),
        address: finalBridgeImplAddress,
        bytecode: bridgeImplementationInfo.bytecode,
        // storage: bridgeImplementationInfo.storage, implementation do not have storage
    });

    // Bridge proxy
    const bridgeProxyInfo = await getAddressInfo(proxyBridgeAddress as string);
    // Override admin and implementation slots:
    bridgeProxyInfo.storage[ADMIN_SLOT] = ethers.zeroPadValue(finalProxyAdminAddress as string, 32);
    bridgeProxyInfo.storage[IMPLEMENTATION_SLOT] = ethers.zeroPadValue(finalBridgeImplAddress as string, 32);

    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.BRIDGE_V2_PROXY,
        balance: balanceBridge,
        nonce: bridgeProxyInfo.nonce.toString(),
        address: finalBridgeProxyAddress,
        bytecode: bridgeProxyInfo.bytecode,
        storage: bridgeProxyInfo.storage,
    });

    // polygonZkEVMGlobalExitRootL2 implementation
    const implGlobalExitRootL2 = await upgrades.erc1967.getImplementationAddress(
        polygonZkEVMGlobalExitRootL2?.target as string,
    );
    const implGlobalExitRootL2Info = await getAddressInfo(implGlobalExitRootL2);

    if (isMainnet === false) {
        finalGlobalExitRootL2ImplAddress = implGlobalExitRootL2;
    }

    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_IMPLEMENTATION,
        balance: '0',
        nonce: implGlobalExitRootL2Info.nonce.toString(),
        address: finalGlobalExitRootL2ImplAddress,
        bytecode: implGlobalExitRootL2Info.bytecode,
        // storage: implGlobalExitRootL2Info.storage, , implementation do not have storage
    });

    // polygonZkEVMGlobalExitRootL2 proxy
    const proxyGlobalExitRootL2Info = await getAddressInfo(polygonZkEVMGlobalExitRootL2?.target as string);

    proxyGlobalExitRootL2Info.storage[ADMIN_SLOT] = ethers.zeroPadValue(finalProxyAdminAddress as string, 32);
    proxyGlobalExitRootL2Info.storage[IMPLEMENTATION_SLOT] = ethers.zeroPadValue(
        finalGlobalExitRootL2ImplAddress as string,
        32,
    );

    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_PROXY,
        balance: '0',
        nonce: proxyGlobalExitRootL2Info.nonce.toString(),
        address: finalGlobalExitRootL2ProxyAddress,
        bytecode: proxyGlobalExitRootL2Info.bytecode,
        storage: proxyGlobalExitRootL2Info.storage,
    });

    // Timelock
    const timelockInfo = await getAddressInfo(timelockContract.target);

    /*
     * Since roles are used, most storage is written in pseudoRandom storage slots
     * bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
     * bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
     * bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
     * bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
     */
    const timelockRolesHash = [
        ethers.id('TIMELOCK_ADMIN_ROLE'),
        ethers.id('PROPOSER_ROLE'),
        ethers.id('EXECUTOR_ROLE'),
        ethers.id('CANCELLER_ROLE'),
    ];

    for (let i = 0; i < timelockRolesHash.length; i++) {
        const rolesMappingStoragePositionStruct = 0;
        const storagePosition = ethers.solidityPackedKeccak256(
            ['uint256', 'uint256'],
            [timelockRolesHash[i], rolesMappingStoragePositionStruct],
        );

        // check timelock address manager, and timelock address itself
        const addressArray = [timelockAdminAddress, timelockContract.target];
        for (let j = 0; j < addressArray.length; j++) {
            const storagePositionRole = ethers.solidityPackedKeccak256(
                ['uint256', 'uint256'],
                [addressArray[j], storagePosition],
            );
            const valueRole = await ethers.provider.getStorage(timelockContract.target, storagePositionRole);
            if (valueRole !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                timelockInfo.storage[storagePositionRole] = valueRole;
            }
        }
        const roleAdminSlot = ethers.zeroPadValue(ethers.toQuantity(ethers.toBigInt(storagePosition) + 1n), 32);
        const valueRoleAdminSlot = await ethers.provider.getStorage(timelockContract.target, roleAdminSlot);
        if (valueRoleAdminSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            timelockInfo.storage[roleAdminSlot] = valueRoleAdminSlot;
        }
    }

    genesis.push({
        contractName: GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
        balance: '0',
        nonce: timelockInfo.nonce.toString(),
        address: finalTimelockContractAddress,
        bytecode: timelockInfo.bytecode,
        storage: timelockInfo.storage,
    });

    // Put nonces on deployers

    // Keyless deployer
    genesis.push({
        accountName: 'keyless Deployer',
        balance: '0',
        nonce: '1',
        address: finalKeylessDeployer,
    });

    // deployer
    const deployerInfo = await getAddressInfo(deployer.address);
    genesis.push({
        accountName: 'deployer',
        balance: '0',
        nonce: deployerInfo.nonce.toString(),
        address: finalDeployer,
    });

    if (deployParameters.test) {
        // Add tester account with ether
        genesis[genesis.length - 1].balance = '100000000000000000000000';
    }

    // calculate root
    const poseidon = await getPoseidon();
    const { F } = poseidon;
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
        defaultChainId,
    );

    fs.writeFileSync(
        pathOutputJson,
        JSON.stringify(
            {
                root: smtUtils.h4toString(zkEVMDB.stateRoot),
                genesis,
            },
            null,
            1,
        ),
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
