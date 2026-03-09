/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { getStorageAt, setCode, setNonce } from '@nomicfoundation/hardhat-network-helpers';
import { ethers, upgrades } from 'hardhat';
import { MemDB, ZkEVMDB, getPoseidon, smtUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { GENESIS_CONTRACT_NAMES } from '../../src/constants';
import {
    deployPolygonZkEVMDeployer,
    create2Deployment,
    getAddressInfo,
} from '../../deployment/helpers/deployment-helpers';
import { ProxyAdmin, AgglayerBridgeL2 } from '../../typechain-types';
import '../../deployment/helpers/utils';
import genesisSovereign from '../../docker/deploymentOutput/genesis_sovereign.json';
import createRollupParameters from '../../deployment/v2/create_rollup_parameters.json';
import createRollupOutput from '../../docker/deploymentOutput/create_rollup_output.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const argv = yargs(process.argv.slice(2))
    .options({
        test: { type: 'boolean', default: false },
        input: {
            type: 'string',
            default: '../../deployment/v2/deploy_parameters.json',
        },
        out: { type: 'string', default: './genesis-sovereign_hardhat.json' },
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

const zkevmAddressL2 = ethers.ZeroAddress;
const globalExitRootL2ProxyAddress = '0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa';

async function main() {
    // Constant variables
    const balanceBridge = BigInt('0xffffffffffffffffffffffffffffffff'); // 128 bits
    const genesis = [];

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
    const { timelockAdminAddress, minDelayTimelock, salt, initialZkEVMDeployerOwner } = deployParameters;

    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [initialZkEVMDeployerOwner]);
    await ethers.provider.send('hardhat_setBalance', [initialZkEVMDeployerOwner, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(initialZkEVMDeployerOwner);

    // Deploy PolygonZkEVMDeployer if is not deployed already
    const [zkEVMDeployerContract, keylessDeployer] = await deployPolygonZkEVMDeployer(
        initialZkEVMDeployerOwner,
        deployer,
    );
    const finalDeployer = deployer.address;
    const finalKeylessDeployer = keylessDeployer;
    const finalZkEVMDeployerAddress = zkEVMDeployerContract.target;
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

    // Deploy implementation SovereignBridge
    const bridgeContractName = GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE;
    const sovereignBridgeFactory = await ethers.getContractFactory(bridgeContractName, deployer);
    const deployTransactionBridge = (await sovereignBridgeFactory.getDeployTransaction()).data;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = BigInt(10500000);
    let [bridgeImplementationAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit,
    );
    // Get genesis params
    const sovereignGenesisBridgeProxy = genesisSovereign.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY;
    });
    const sovereignGenesisBridgeImplementation = genesisSovereign.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE;
    });
    const sovereignGenesisGERProxy = genesisSovereign.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY;
    });
    const sovereignGenesisGERImplementation = genesisSovereign.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN;
    });
    const sovereignDeployerAccount = genesisSovereign.genesis.find(function (obj) {
        return obj.accountName === 'deployer';
    });
    // Change bridge implementation address to the one set at original sovereign genesis. The address is different because they have different initcode
    const deployedBytecode = await ethers.provider.getCode(bridgeImplementationAddress as string);
    bridgeImplementationAddress = sovereignGenesisBridgeImplementation.address;
    await setCode(bridgeImplementationAddress as string, deployedBytecode);
    await setNonce(bridgeImplementationAddress as string, 1);
    /*
     * deploy bridge proxy and initialize
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
    // Import OZ manifest the deployed contracts, its enough to import just the proxy, the rest are imported automatically ( admin/impl)
    await upgrades.forceImport(proxyBridgeAddress as string, sovereignBridgeFactory, 'transparent' as any);
    /*
     *Deployment Global exit root manager implementation, proxy and initialize
     */
    const { sovereignParams } = createRollupParameters;
    const globalExitRootContractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN;
    const GERSovereignFactory = await ethers.getContractFactory(globalExitRootContractName, deployer);
    const proxyGERContract = await upgrades.deployProxy(GERSovereignFactory, [sovereignParams.globalExitRootUpdater], {
        constructorArgs: [proxyBridgeAddress as string],
        unsafeAllow: ['constructor', 'state-variable-immutable'],
    });
    const proxyGERAddress = proxyGERContract.target;
    const GERImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyGERAddress as string);

    expect(sovereignGenesisGERImplementation.bytecode).to.be.equal(
        await ethers.provider.getCode(GERImplementationAddress),
    );
    // Compare storage
    for (const key in sovereignGenesisGERProxy.storage) {
        if (Object.prototype.hasOwnProperty.call(sovereignGenesisGERProxy.storage, key)) {
            expect(sovereignGenesisGERProxy.storage[key]).to.be.equal(
                await getStorageAt(proxyGERAddress as string, key),
            );
        }
    }
    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(proxyGERAddress as string)).to.be.equal(proxyAdminAddress);
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
    const finalTimelockContractAddress = timelockContract.target;

    // Transfer ownership of the proxyAdmin to timelock
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (await proxyAdminInstance.connect(deployer).transferOwnership(finalTimelockContractAddress as string)).wait();

    // Initialize bridge
    const sovereignBridgeContract = sovereignBridgeFactory.attach(
        bridgeImplementationAddress as string,
    ) as AgglayerBridgeL2;
    let gasTokenMetadata;
    let gasTokenAddress;
    let gasTokenNetwork;
    if (
        createRollupParameters.gasTokenAddress &&
        createRollupParameters.gasTokenAddress !== '' &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        gasTokenMetadata = createRollupOutput.gasTokenMetadata;
        gasTokenAddress = createRollupParameters.gasTokenAddress;
        const wrappedData = await sovereignBridgeContract.wrappedTokenToTokenInfo(
            createRollupParameters.gasTokenAddress,
        );
        if (wrappedData.originNetwork !== 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createRollupParameters.gasTokenAddress;
            gasTokenNetwork = 0;
        }
    } else {
        gasTokenMetadata = '0x';
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
    }
    const initializeData = sovereignBridgeFactory.interface.encodeFunctionData(
        'initialize(uint32,address,uint32,address,address,bytes,address,address,bool)',
        [
            1, // rollupID
            gasTokenAddress,
            gasTokenNetwork, // gasTokenNetwork,
            sovereignGenesisGERProxy.address, // GlobalExitRootManager address
            ethers.ZeroAddress, // polygonRollupManager
            gasTokenMetadata, // gasTokenMetadata,
            sovereignParams.bridgeManager,
            sovereignParams.sovereignWETHAddress,
            sovereignParams.sovereignWETHAddressIsNotMintable,
        ],
    );
    await deployer.sendTransaction({
        to: proxyBridgeAddress as string,
        data: initializeData,
    });
    // Check bytecode
    expect(sovereignGenesisBridgeProxy.bytecode).to.be.equal(
        await ethers.provider.getCode(proxyBridgeAddress as string),
    );
    // Check storage
    for (const key in sovereignGenesisBridgeProxy.storage) {
        if (Object.prototype.hasOwnProperty.call(sovereignGenesisBridgeProxy.storage, key)) {
            expect(sovereignGenesisBridgeProxy.storage[key]).to.be.equal(
                await getStorageAt(proxyBridgeAddress as string, key),
            );
        }
    }

    // Check weth
    if (
        createRollupParameters.gasTokenAddress &&
        createRollupParameters.gasTokenAddress !== '' &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        const sovereignBridgeProxyContract = sovereignBridgeFactory.attach(
            proxyBridgeAddress as string,
        ) as AgglayerBridgeL2;
        // Add deployed weth
        const wethAddress = await sovereignBridgeProxyContract.WETHToken();
        const wethBytecode = await ethers.provider.getCode(wethAddress);
        const sovereignWETH = genesisSovereign.genesis.find(function (obj) {
            return obj.contractName === GENESIS_CONTRACT_NAMES.WETH_PROXY;
        });
        // Check storage
        for (const key in sovereignWETH.storage) {
            if (Object.prototype.hasOwnProperty.call(sovereignWETH.storage, key)) {
                expect(sovereignWETH.storage[key]).to.be.equal(await getStorageAt(wethAddress, key));
            }
        }
        genesis.push({
            contractName: 'WETH',
            balance: '0',
            nonce: '1',
            address: wethAddress,
            bytecode: wethBytecode,
            storage: sovereignWETH.storage,
        });
    }

    // ZKEVMDeployer
    const zkEVMDeployerInfo = await getAddressInfo(zkEVMDeployerContract.target);
    genesis.push({
        contractName: 'PolygonZkEVMDeployer',
        balance: '0',
        nonce: zkEVMDeployerInfo.nonce.toString(),
        address: finalZkEVMDeployerAddress,
        bytecode: zkEVMDeployerInfo.bytecode,
        storage: zkEVMDeployerInfo.storage,
    });

    // Proxy Admin
    const proxyAdminInfo = await getAddressInfo(proxyAdminAddress as string);
    genesis.push({
        contractName: 'ProxyAdmin',
        balance: '0',
        nonce: proxyAdminInfo.nonce.toString(),
        address: proxyAdminAddress,
        bytecode: proxyAdminInfo.bytecode,
        storage: proxyAdminInfo.storage,
    });

    // Bridge implementation
    const bridgeImplementationInfo = await getAddressInfo(bridgeImplementationAddress as string);
    genesis.push({
        contractName: `${bridgeContractName}`,
        balance: '0',
        nonce: bridgeImplementationInfo.nonce.toString(),
        address: bridgeImplementationAddress,
        bytecode: bridgeImplementationInfo.bytecode,
        // storage: bridgeImplementationInfo.storage, implementation do not have storage
    });

    // Bridge proxy
    const bridgeProxyInfo = await getAddressInfo(proxyBridgeAddress as string);
    // Override admin and implementation slots:
    bridgeProxyInfo.storage[ADMIN_SLOT] = ethers.zeroPadValue(proxyAdminAddress as string, 32);
    bridgeProxyInfo.storage[IMPLEMENTATION_SLOT] = ethers.zeroPadValue(bridgeImplementationAddress as string, 32);

    genesis.push({
        contractName: `${bridgeContractName} proxy`,
        balance: balanceBridge,
        nonce: bridgeProxyInfo.nonce.toString(),
        address: proxyBridgeAddress,
        bytecode: bridgeProxyInfo.bytecode,
        storage: sovereignGenesisBridgeProxy.storage, // Already checked is the same
    });

    // GER Manager implementation
    const implGlobalExitRootL2Info = await getAddressInfo(GERImplementationAddress as string);

    genesis.push({
        contractName: `${globalExitRootContractName}`,
        balance: '0',
        nonce: implGlobalExitRootL2Info.nonce.toString(),
        address: GERImplementationAddress,
        bytecode: implGlobalExitRootL2Info.bytecode,
    });

    // polygonZkEVMGlobalExitRootL2 proxy
    const proxyGlobalExitRootL2Info = await getAddressInfo(proxyGERAddress as string);

    proxyGlobalExitRootL2Info.storage[ADMIN_SLOT] = ethers.zeroPadValue(proxyAdminAddress as string, 32);
    proxyGlobalExitRootL2Info.storage[IMPLEMENTATION_SLOT] = ethers.zeroPadValue(
        GERImplementationAddress as string,
        32,
    );

    genesis.push({
        contractName: `${globalExitRootContractName} proxy`,
        balance: '0',
        nonce: proxyGlobalExitRootL2Info.nonce.toString(),
        address: globalExitRootL2ProxyAddress,
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
        contractName: 'PolygonZkEVMTimelock',
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
    genesis.push({
        accountName: 'deployer',
        balance: '0',
        // We get nonce from sovereign genesis because the number of transactions is different. With hardhat proxies are deployed and initialized in same transaction
        nonce: sovereignDeployerAccount.nonce,
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
    // Check roots match
    const SR = smtUtils.h4toString(zkEVMDB.stateRoot);
    // expect(SR).to.be.equal(genesisSovereign.root);
    fs.writeFileSync(
        pathOutputJson,
        JSON.stringify(
            {
                root: SR,
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
