/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { argv } = require('yargs');

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';
process.env.HARDHAT_NETWORK = 'hardhat';
process.env.MNEMONIC = argv.test ? DEFAULT_MNEMONIC : process.env.MNEMONIC;
const { ethers, upgrades } = require('hardhat');
const {
    MemDB, ZkEVMDB, getPoseidon, smtUtils,
} = require('@0xpolygonhermez/zkevm-commonjs');

const { deployPolygonZkEVMDeployer, create2Deployment } = require('./helpers/deployment-helpers');

const outPath = argv.out ? argv.out : './genesis.json';
const pathOutputJson = path.join(__dirname, outPath);

/*
 * bytes32 internal constant _ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
 * bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 */
const _ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

// Genesis mainnet address:
const mainnetZkEVMDeployerAddress = '0xCB19eDdE626906eB1EE52357a27F62dd519608C2';
const mainnetProxyAdminAddress = '0x0F99738B2Fc14D77308337f3e2596b63aE7BCC4A';
const mainnetZkEVMBridgeImplementationAddress = '0x5ac4182A1dd41AeEf465E40B82fd326BF66AB82C';
const mainnetZkEVMBridgeProxyAddress = '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe';
const mainnetGlobalExitRootL2ImplementationAddress = '0x0200143Fa295EE4dffEF22eE2616c2E008D81688';
const mainnetGlobalExitRootL2ProxyAddress = '0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa';
const mainnetZkEVMTimelockAddress = '0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13';

const mainnetMultisig = '0x4c1665d6651ecEfa59B9B3041951608468b18891';
const mainnetInitialZkEVMDeployerOwner = '0x4c1665d6651ecEfa59B9B3041951608468b18891';
const mainnetMinDelayTimelock = 864000;

async function main() {
    // Constant variables
    const attemptsDeployProxy = 20;
    const networkIDL2 = 1;
    const zkevmAddressL2 = ethers.constants.AddressZero;

    const timelockAddress = mainnetMultisig;
    const initialZkEVMDeployerOwner = mainnetInitialZkEVMDeployerOwner;
    const salt = '0x0000000000000000000000000000000000000000000000000000000000000000'; // salt mock
    const minDelayTimelock = mainnetMinDelayTimelock;

    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [initialZkEVMDeployerOwner]);
    await ethers.provider.send('hardhat_setBalance', [initialZkEVMDeployerOwner, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(initialZkEVMDeployerOwner);

    // Deploy PolygonZkEVMDeployer if is not deployed already
    const [zkEVMDeployerContract] = await deployPolygonZkEVMDeployer(initialZkEVMDeployerOwner, deployer);

    /*
     * Deploy Bridge
     * Deploy admin --> implementation --> proxy
     */

    // Deploy proxy admin:
    const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
    const deployTransactionAdmin = (proxyAdminFactory.getDeployTransaction()).data;
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData('transferOwnership', [deployer.address]);
    const [proxyAdminAddress] = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionAdmin, dataCallAdmin, deployer);

    // Deploy implementation PolygonZkEVMBridg
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
    const deployTransactionBridge = (polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    // Mandatory to override the gasLimit since the estimation with create are mess up D:
    const overrideGasLimit = ethers.BigNumber.from(5500000);
    const [bridgeImplementationAddress] = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit,
    );

    /*
     * deploy proxy
     * Do not initialize directlythe proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */
    const transparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy', deployer);
    const initializeEmptyDataProxy = '0x';
    const deployTransactionProxy = (transparentProxyFactory.getDeployTransaction(
        bridgeImplementationAddress,
        proxyAdminAddress,
        initializeEmptyDataProxy,
    )).data;

    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize',
        [
            networkIDL2,
            mainnetGlobalExitRootL2ProxyAddress,
            zkevmAddressL2,
        ],
    );
    const [proxyBridgeAddress] = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionProxy, dataCallProxy, deployer);

    // Import OZ manifest the deployed contracts, its enough to import just the proyx, the rest are imported automatically ( admin/impl)
    await upgrades.forceImport(proxyBridgeAddress, polygonZkEVMBridgeFactory, 'transparent');

    /*
     *Deployment Global exit root manager
     */
    const PolygonZkEVMGlobalExitRootL2Factory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootL2', deployer);
    let polygonZkEVMGlobalExitRootL2;
    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonZkEVMGlobalExitRootL2 = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootL2Factory, [], {
                initializer: false,
                constructorArgs: [mainnetZkEVMBridgeProxyAddress],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of polygonZkEVMGlobalExitRootL2 ', error.message);
        }

        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error('polygonZkEVMGlobalExitRootL2 contract has not been deployed');
        }
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(polygonZkEVMGlobalExitRootL2.address)).to.be.equal(proxyAdminAddress);
    expect(await upgrades.erc1967.getAdminAddress(proxyBridgeAddress)).to.be.equal(proxyAdminAddress);

    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = await timelockContractFactory.deploy(
        minDelayTimelock,
        [timelockAddress],
        [timelockAddress],
        timelockAddress,
        zkevmAddressL2,
    );
    await timelockContract.deployed();

    // Transfer ownership of the proxyAdmin to timelock
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress);
    await (await proxyAdminInstance.connect(deployer).transferOwnership(mainnetZkEVMTimelockAddress)).wait();

    // Recreate genesis with the current information:
    const genesis = [];

    // ZKEVMDeployer
    const zkEVMDeployerInfo = await getAddressInfo(zkEVMDeployerContract.address);
    genesis.push({
        contractName: 'PolygonZkEVMDeployer',
        balance: '0',
        nonce: zkEVMDeployerInfo.nonce.toString(),
        address: mainnetZkEVMDeployerAddress, // override adddress
        bytecode: zkEVMDeployerInfo.bytecode,
        storage: zkEVMDeployerInfo.storage,
    });

    // Proxy Admin
    const proxyAdminInfo = await getAddressInfo(proxyAdminAddress);
    genesis.push({
        contractName: 'ProxyAdmin',
        balance: '0',
        nonce: proxyAdminInfo.nonce.toString(),
        address: mainnetProxyAdminAddress, // override adddress
        bytecode: proxyAdminInfo.bytecode,
        storage: proxyAdminInfo.storage,
    });

    // Bridge implementation
    const bridgeImplementationInfo = await getAddressInfo(bridgeImplementationAddress);
    genesis.push({
        contractName: 'PolygonZkEVMBridge implementation',
        balance: '0',
        nonce: bridgeImplementationInfo.nonce.toString(),
        address: mainnetZkEVMBridgeImplementationAddress, // override adddress
        bytecode: bridgeImplementationInfo.bytecode,
        // storage: bridgeImplementationInfo.storage, implementation do not have storage
    });

    // Bridge proxy
    const bridgeProxyInfo = await getAddressInfo(proxyBridgeAddress);

    // Override admin and implementation slots:
    bridgeProxyInfo.storage[_ADMIN_SLOT] = ethers.utils.hexZeroPad(mainnetProxyAdminAddress, 32);
    bridgeProxyInfo.storage[_IMPLEMENTATION_SLOT] = ethers.utils.hexZeroPad(mainnetZkEVMBridgeImplementationAddress, 32);

    // update proxy storage
    genesis.push({
        contractName: 'PolygonZkEVMBridge proxy',
        balance: '200000000000000000000000000',
        nonce: bridgeProxyInfo.nonce.toString(),
        address: mainnetZkEVMBridgeProxyAddress, // override adddress
        bytecode: bridgeProxyInfo.bytecode,
        storage: bridgeProxyInfo.storage,
    });

    // polygonZkEVMGlobalExitRootL2 implementation
    const implGlobalExitRootL2 = await upgrades.erc1967.getImplementationAddress(polygonZkEVMGlobalExitRootL2.address);
    const implGlobalExitRootL2Info = await getAddressInfo(implGlobalExitRootL2);
    genesis.push({
        contractName: 'PolygonZkEVMGlobalExitRootL2 implementation',
        balance: '0',
        nonce: implGlobalExitRootL2Info.nonce.toString(),
        address: mainnetGlobalExitRootL2ImplementationAddress, // override address
        bytecode: implGlobalExitRootL2Info.bytecode,
        // storage: implGlobalExitRootL2Info.storage, , implementation do not have storage
    });

    // polygonZkEVMGlobalExitRootL2 proxy
    const proxyGlobalExitRootL2Info = await getAddressInfo(polygonZkEVMGlobalExitRootL2.address);

    // Override admin and implementation slots:
    proxyGlobalExitRootL2Info.storage[_ADMIN_SLOT] = ethers.utils.hexZeroPad(mainnetProxyAdminAddress, 32);
    proxyGlobalExitRootL2Info.storage[_IMPLEMENTATION_SLOT] = ethers.utils.hexZeroPad(mainnetGlobalExitRootL2ImplementationAddress, 32);

    genesis.push({
        contractName: 'PolygonZkEVMGlobalExitRootL2 proxy',
        balance: '0',
        nonce: proxyGlobalExitRootL2Info.nonce.toString(),
        address: mainnetGlobalExitRootL2ProxyAddress, // Override address!
        bytecode: proxyGlobalExitRootL2Info.bytecode,
        storage: proxyGlobalExitRootL2Info.storage,
    });

    // Timelock
    const timelockInfo = await getAddressInfo(timelockContract.address);

    /*
     * Since roles are used, most storage are writted in peusdoRandom storage slots
     * bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
     * bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
     * bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
     * bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
     */
    const timelockRolesHash = [
        ethers.utils.id('TIMELOCK_ADMIN_ROLE'),
        ethers.utils.id('PROPOSER_ROLE'),
        ethers.utils.id('EXECUTOR_ROLE'),
        ethers.utils.id('CANCELLER_ROLE'),
    ];

    for (let i = 0; i < timelockRolesHash.length; i++) {
        const rolesMappingStoragePositionStruct = 0;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [timelockRolesHash[i], rolesMappingStoragePositionStruct]);

        // check timelock address manager, and timelock address itself
        const addressArray = [timelockAddress, timelockContract.address];
        for (let j = 0; j < addressArray.length; j++) {
            const storagePositionRole = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [addressArray[j], storagePosition]);
            const valueRole = await ethers.provider.getStorageAt(timelockContract.address, storagePositionRole);
            if (valueRole !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                timelockInfo.storage[storagePositionRole] = valueRole;
            }
        }
        const roleAdminSlot = ethers.utils.hexZeroPad((ethers.BigNumber.from(storagePosition).add(1)).toHexString(), 32);
        const valueRoleAdminSlot = await ethers.provider.getStorageAt(timelockContract.address, roleAdminSlot);
        if (valueRoleAdminSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            timelockInfo.storage[roleAdminSlot] = valueRoleAdminSlot;
        }
    }

    genesis.push({
        contractName: 'PolygonZkEVMTimelock',
        balance: '0',
        nonce: timelockInfo.nonce.toString(),
        address: timelockContract.address,
        bytecode: timelockInfo.bytecode,
        storage: timelockInfo.storage,
    });

    // Put nonces on deployers

    // deployer
    const deployerInfo = await getAddressInfo(deployer.address);
    genesis.push({
        accountName: 'deployer',
        balance: '0',
        nonce: deployerInfo.nonce.toString(),
        address: deployer.address,
    });

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

    fs.writeFileSync(pathOutputJson, JSON.stringify({
        root: smtUtils.h4toString(zkEVMDB.stateRoot),
        genesis,
    }, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

async function getAddressInfo(address) {
    const nonce = await ethers.provider.getTransactionCount(address);
    const bytecode = await ethers.provider.getCode(address);

    const storage = {};
    for (let i = 0; i < 120; i++) {
        const storageValue = await ethers.provider.getStorageAt(address, i);
        if (storageValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            storage[ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 32)] = storageValue;
        }
    }

    const valueAdminSlot = await ethers.provider.getStorageAt(address, _ADMIN_SLOT);
    if (valueAdminSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        storage[_ADMIN_SLOT] = valueAdminSlot;
    }
    const valuImplementationSlot = await ethers.provider.getStorageAt(address, _IMPLEMENTATION_SLOT);
    if (valuImplementationSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        storage[_IMPLEMENTATION_SLOT] = valuImplementationSlot;
    }

    return { nonce, bytecode, storage };
}
