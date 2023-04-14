/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers } = require('hardhat');

const gasPriceKeylessDeployment = '100'; // 100 gweis

async function deployPolygonZkEVMDeployer(deployerAddress, signer) {
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory('PolygonZkEVMDeployer', signer);

    const deployTxZKEVMDeployer = (PolgonZKEVMDeployerFactory.getDeployTransaction(
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
        data: deployTxZKEVMDeployer,
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
    const zkEVMDeployerAddress = ethers.utils.getContractAddress(resultTransaction);
    if (await signer.provider.getCode(zkEVMDeployerAddress) !== '0x') {
        const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);
        expect(await zkEVMDeployerContract.owner()).to.be.equal(signer.address);
        return [zkEVMDeployerContract, ethers.constants.AddressZero];
    }

    // Fund keyless deployment
    const params = {
        to: resultTransaction.from,
        value: totalEther.toHexString(),
    };
    await (await signer.sendTransaction(params)).wait();

    // Deploy zkEVMDeployer
    await (await signer.provider.sendTransaction(serializedTransaction)).wait();

    const zkEVMDeployerContract = await PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);
    expect(await zkEVMDeployerContract.owner()).to.be.equal(deployerAddress);
    return [zkEVMDeployerContract, resultTransaction.from];
}

async function create2Deployment(polgonZKEVMDeployerContract, salt, deployTransaction, dataCall, deployer, hardcodedGasLimit) {
    // Encode deploy transaction
    const hashInitCode = ethers.utils.solidityKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    const precalculatedAddressDeployed = ethers.utils.getCreate2Address(polgonZKEVMDeployerContract.address, salt, hashInitCode);
    const amount = 0;

    if (await deployer.provider.getCode(precalculatedAddressDeployed) !== '0x') {
        return [precalculatedAddressDeployed, false];
    }

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
    return [precalculatedAddressDeployed, true];
}

module.exports = {
    deployPolygonZkEVMDeployer,
    create2Deployment,
};
