/* eslint-disable no-console, no-unused-vars, no-use-before-define */
const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    // Set multiplier Gas
    const multiplierGas = 3;
    const currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
    async function overrideFeeData() {
        const feedata = await ethers.provider.getFeeData();
        return {
            maxFeePerGas: feedata.maxFeePerGas.mul(multiplierGas),
            maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(multiplierGas),
        };
    }
    currentProvider.getFeeData = overrideFeeData;

    let deployer;
    if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // compìle contracts
    await hre.run('compile');

    const proxyPolygonAddress = '0xfefefefefefefefefefefefee';
    const polygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock', deployer);

    // Upgrade zkevm
    const newImplPolygonAddress = await upgrades.prepareUpgrade(proxyPolygonAddress, polygonZkEVMFactory);
    const proxyAdmin = await upgrades.admin.getInstance();

    console.log({ newImplPolygonAddress });
    console.log("you can verify the new impl address with:")
    console.log(`npx hardhat verify ${proxyPolygonAddress} --network ${process.env.HARDHAT_NETWORK}`);

    // show timelock address
    // Use timelock
    const operation = genOperation(
        proxyAdmin.address,
        0, // value
        proxyAdmin.interface.encodeFunctionData(
            'upgrade',
            [proxyPolygonAddress,
                newImplPolygonAddress],
        ),
        ethers.constants.HashZero, // predecesoor
        ethers.constants.HashZero, // salt TODO
    );

    // Timelock operations
    const TimelockFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const minDelay = 10; // TODO upgrade parameter

    // Schedule operation
    const scheduleData = TimelockFactory.interface.encodeFunctionData(
        'schedule',
        [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            minDelay,
        ],
    );
    // Executre operation
    const executeData = TimelockFactory.interface.encodeFunctionData(
        'execute',
        [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ],
    );

    console.log({ scheduleData });
    console.log({ executeData });
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// OZ test functions
function genOperation(target, value, data, predecessor, salt) {
    const id = ethers.utils.solidityKeccak256([
        'address',
        'uint256',
        'bytes',
        'uint256',
        'bytes32',
    ], [
        target,
        value,
        data,
        predecessor,
        salt,
    ]);
    return {
        id, target, value, data, predecessor, salt,
    };
}
