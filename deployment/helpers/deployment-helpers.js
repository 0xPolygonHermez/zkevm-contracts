/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers } = require('hardhat');

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
    if (await deployer.provider.getCode(zkEVMDeployerAddress) !== '0x') {
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
    await (await deployer.provider.sendTransaction(serializedTransaction)).wait();

    const zkEVMDeployerContract = await PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress);
    expect(await zkEVMDeployerContract.owner()).to.be.equal(deployer.address);
    return [zkEVMDeployerContract, resultTransaction.from];
}

async function create2Deployment(polgonZKEVMDeployerContract, salt, deployTransaction, dataCall, deployer, hardcodedGasLimit) {
    // Encode deploy transaction
    const hashInitCode = ethers.utils.solidityKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    const precalculatedAddressDeployed = ethers.utils.getCreate2Address(polgonZKEVMDeployerContract.address, salt, hashInitCode);
    const amount = 0;

    if (await deployer.provider.getCode(precalculatedAddressDeployed) !== '0x') {
        return precalculatedAddressDeployed;
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
    return precalculatedAddressDeployed;
}

module.exports = {
    deployPolygonZkEVMDeployer,
    create2Deployment,
};
