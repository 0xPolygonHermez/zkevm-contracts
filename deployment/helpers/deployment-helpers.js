/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers } = require('hardhat');

const gasPriceKeylessDeployment = '100'; // 100 gweis

async function deploySupernets2Deployer(deployerAddress, signer) {
    const Supernets2DeployerFactory = await ethers.getContractFactory('Supernets2Deployer', signer);

    const deployTxSupernets2Deployer = (Supernets2DeployerFactory.getDeployTransaction(
        deployerAddress,
    )).data;

    const gasLimit = ethers.BigNumber.from(1000000); // Put 1 Million, aprox 650k are necessary
    const gasPrice = ethers.BigNumber.from(ethers.utils.parseUnits(gasPriceKeylessDeployment, 'gwei'));
    const to = '0x'; // bc deployment transaction, "to" is "0x"
    const tx = {
        to,
        nonce: 0,
        value: 0,
        gasLimit: gasLimit.toHexString(),
        gasPrice: gasPrice.toHexString(),
        data: deployTxSupernets2Deployer,
    };

    const signature = {
        v: 27,
        r: '0x5ca1ab1e0', // Equals 0x00000000000000000000000000000000000000000000000000000005ca1ab1e0
        s: '0x5ca1ab1e', // Equals 0x000000000000000000000000000000000000000000000000000000005ca1ab1e
    };
    const serializedTransaction = ethers.utils.serializeTransaction(tx, signature);
    const resultTransaction = ethers.utils.parseTransaction(serializedTransaction);
    const totalEther = gasLimit.mul(gasPrice); // 0.1 ether

    // Check if it's already deployed
    const supernets2DeployerAddress = ethers.utils.getContractAddress(resultTransaction);
    if (await signer.provider.getCode(supernets2DeployerAddress) !== '0x') {
        const supernets2DeployerContract = Supernets2DeployerFactory.attach(supernets2DeployerAddress);
        expect(await supernets2DeployerContract.owner()).to.be.equal(signer.address);
        return [supernets2DeployerContract, ethers.constants.AddressZero];
    }

    // Fund keyless deployment
    const params = {
        to: resultTransaction.from,
        value: totalEther.toHexString(),
    };
    await (await signer.sendTransaction(params)).wait();

    // Deploy supernes2Deployer
    await (await signer.provider.sendTransaction(serializedTransaction)).wait();

    const supernets2DeployerContract = await Supernets2DeployerFactory.attach(supernets2DeployerAddress);
    expect(await supernets2DeployerContract.owner()).to.be.equal(deployerAddress);
    return [supernets2DeployerContract, resultTransaction.from];
}

async function create2Deployment(supernets2DeployerContract, salt, deployTransaction, dataCall, deployer, hardcodedGasLimit) {
    // Encode deploy transaction
    const hashInitCode = ethers.utils.solidityKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    const precalculatedAddressDeployed = ethers.utils.getCreate2Address(supernets2DeployerContract.address, salt, hashInitCode);
    const amount = 0;

    if (await deployer.provider.getCode(precalculatedAddressDeployed) !== '0x') {
        return [precalculatedAddressDeployed, false];
    }

    if (dataCall) {
        // Deploy using create2 and call
        if (hardcodedGasLimit) {
            const populatedTransaction = await supernets2DeployerContract.populateTransaction.deployDeterministicAndCall(
                amount,
                salt,
                deployTransaction,
                dataCall,
            );
            populatedTransaction.gasLimit = ethers.BigNumber.from(hardcodedGasLimit);
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (await supernets2DeployerContract.deployDeterministicAndCall(amount, salt, deployTransaction, dataCall)).wait();
        }
    } else {
        // Deploy using create2
        if (hardcodedGasLimit) {
            const populatedTransaction = await supernets2DeployerContract.populateTransaction.deployDeterministic(
                amount,
                salt,
                deployTransaction,
            );
            populatedTransaction.gasLimit = ethers.BigNumber.from(hardcodedGasLimit);
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (await supernets2DeployerContract.deployDeterministic(amount, salt, deployTransaction)).wait();
        }
    }
    return [precalculatedAddressDeployed, true];
}

module.exports = {
    deploySupernets2Deployer,
    create2Deployment,
};
