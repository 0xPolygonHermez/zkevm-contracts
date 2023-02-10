/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const deployParameters = require('./deploy_parameters.json');

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

async function main() {
    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(`There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`);
    }

    // Constant variables
    const networkIDMainnet = 0;

    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(`Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`);
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),
                    };
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
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    const salt = deployParameters.salt || ethers.constants.HashZero;

    // Deploy PolygonZkEVMDeployer if is not deployed already
    const zkEVMDeployerContract = await deployPolygonZkEVMDeployer(deployer);

    // Precalcualte bridge address
    const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
    const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
    const transparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy', deployer);

    const deployTransactionBridge = (polygonZkEVMBridgeFactory.getDeployTransaction()).data;
    const precalculateBridgeImplementation = await getCreate2Address(zkEVMDeployerContract, salt, deployTransactionBridge);

    const deployTransactionAdmin = (proxyAdminFactory.getDeployTransaction()).data;
    const precalculateProxyAdmin = await getCreate2Address(zkEVMDeployerContract, salt, deployTransactionAdmin);

    const initializeEmptyDataProxy = '0x';
    const deployTransactionProxy = (transparentProxyFactory.getDeployTransaction(
        precalculateBridgeImplementation,
        precalculateProxyAdmin,
        initializeEmptyDataProxy,
    )).data;
    const precalculateProxy = await getCreate2Address(zkEVMDeployerContract, salt, deployTransactionProxy);

    // Deploy admin --> implementation --> proxy

    // Deploy proxy admin:
    const dataCallAdmin = proxyAdminFactory.interface.encodeFunctionData('transferOwnership', [deployer.address]);
    const proxyAdminAddress = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionAdmin, dataCallAdmin);
    expect(proxyAdminAddress).to.be.equal(precalculateProxyAdmin);

    // Deploy implementation

    /*
     * deploy PolygonZkEVMBridge
     * Mandatory to override the gasLimit since the estimation with create are mess up D:
     */
    const overrideGasLimit = ethers.BigNumber.from(6000000); // Should be more than enough with 5M
    const bridgeImplementationAddress = await create2Deployment(
        zkEVMDeployerContract,
        salt,
        deployTransactionBridge,
        null,
        deployer,
        overrideGasLimit,
    );
    expect(bridgeImplementationAddress).to.be.equal(precalculateBridgeImplementation);

    /*
     * deploy proxy
     * Do not initialize the proxy since we want to deploy the same code on L2 and this will alter the bytecode deployed of the proxy
     */

    const precalculateZkevmAddress = ethers.constants.AddressZero;
    const polygonZkEVMGlobalExitRootAddress = ethers.constants.AddressZero;
    const dataCallProxy = polygonZkEVMBridgeFactory.interface.encodeFunctionData(
        'initialize',
        [
            networkIDMainnet,
            polygonZkEVMGlobalExitRootAddress,
            precalculateZkevmAddress,
        ],
    );
    const proxyAddress = await create2Deployment(zkEVMDeployerContract, salt, deployTransactionProxy, dataCallProxy);
    expect(precalculateProxy).to.be.equal(proxyAddress);

    const polygonZkEVMBridgeContract = polygonZkEVMBridgeFactory.attach(proxyAddress);

    console.log('#######################\n');
    console.log('PolygonZkEVMBridge deployed to:', polygonZkEVMBridgeContract.address);

    console.log('\n#######################');
    console.log('#####    Checks PolygonZkEVMBridge   #####');
    console.log('#######################');
    console.log('PolygonZkEVMGlobalExitRootAddress:', await polygonZkEVMBridgeContract.globalExitRootManager());
    console.log('networkID:', await polygonZkEVMBridgeContract.networkID());
    console.log('zkEVMaddress:', await polygonZkEVMBridgeContract.polygonZkEVMaddress());

    // Import OZ manifest the deployed contracts, its enpought o import just the proyx, the rest are imported automatically
    await upgrades.forceImport(proxyAddress, polygonZkEVMBridgeFactory, 'transparent');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

async function deployPolygonZkEVMDeployer(deployer) {
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory('PolygonZkEVMDeployer', deployer);

    const deployTxZKEVMDeployer = (PolgonZKEVMDeployerFactory.getDeployTransaction(
        deployer.address,
    )).data;

    const gasLimit = ethers.BigNumber.from(1000000); // Put 1 Million, aprox 650k are necessary
    const gasPrice = ethers.BigNumber.from(ethers.utils.parseUnits('100', 'gwei')); // just in case , seems pretty standard
    const to = '0x'; // bc deployment transaction, "to" is "0x"
    const tx = {
        to,
        nonce: 0,
        value: 0,
        gasLimit: gasLimit.toHexString(),
        gasPrice: gasPrice.toHexString(),
        data: deployTxZKEVMDeployer,
    };

    const signature = {
        v: 27,
        r: '0x247000', // Equals 0x0000000000000000000000000000000000000000000000000000000000247000 TODO
        s: '0x2470', // Equals 0x0000000000000000000000000000000000000000000000000000000000002470 TODO
    };
    const serializedTransaction = ethers.utils.serializeTransaction(tx, signature);
    const resultTransaction = ethers.utils.parseTransaction(serializedTransaction);
    const totalEther = gasLimit.mul(gasPrice); // 0.1 ether

    // Check if it's already deployed
    const zkEVMDeployerAddress = ethers.utils.getContractAddress(resultTransaction);
    if (await ethers.provider.getCode(zkEVMDeployerAddress) !== '0x') {
        const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);
        expect(await zkEVMDeployerContract.owner()).to.be.equal(deployer.address);
        return zkEVMDeployerContract;
    }
    // Fund keyless deployment
    const params = {
        to: resultTransaction.from,
        value: totalEther.toHexString(),
    };
    await (await deployer.sendTransaction(params)).wait();

    // Deploy zkEVMDeployer
    await (await ethers.provider.sendTransaction(serializedTransaction)).wait();

    const zkEVMDeployerContract = await PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);
    expect(await zkEVMDeployerContract.owner()).to.be.equal(deployer.address);
    return zkEVMDeployerContract;
}

async function create2Deployment(polgonZKEVMDeployerContract, salt, deployTransaction, dataCall, deployer, hardcodedGasLimit) {
    // Encode deploy transaction
    const hashInitCode = ethers.utils.solidityKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    const precalculatedAddressDeployed = ethers.utils.getCreate2Address(polgonZKEVMDeployerContract.address, salt, hashInitCode);
    const amount = 0;

    if (dataCall) {
        // Deploy using create2 and call
        if (hardcodedGasLimit) {
            const populatedTransaction = await polgonZKEVMDeployerContract.populateTransaction.deployDeterministicAndCall(
                amount,
                salt,
                deployTransaction,
                dataCall,
            );
            populatedTransaction.gasLimit = ethers.BigNumber.from(hardcodedGasLimit);
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (await polgonZKEVMDeployerContract.deployDeterministicAndCall(amount, salt, deployTransaction, dataCall)).wait();
        }
    } else {
        // Deploy using create2
        if (hardcodedGasLimit) {
            const populatedTransaction = await polgonZKEVMDeployerContract.populateTransaction.deployDeterministic(
                amount,
                salt,
                deployTransaction,
            );
            populatedTransaction.gasLimit = ethers.BigNumber.from(hardcodedGasLimit);
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (await polgonZKEVMDeployerContract.deployDeterministic(amount, salt, deployTransaction)).wait();
        }
    }
    return precalculatedAddressDeployed;
}

async function getCreate2Address(polgonZKEVMDeployerContract, salt, deployTransaction) {
    const hashInitCode = ethers.utils.solidityKeccak256(['bytes'], [deployTransaction]);
    const precalculatedAddressDeployed = ethers.utils.getCreate2Address(polgonZKEVMDeployerContract.address, salt, hashInitCode);
    return precalculatedAddressDeployed;
}
