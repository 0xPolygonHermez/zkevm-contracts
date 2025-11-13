/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import { ethers } from 'hardhat'; // 100 gweis
// type Signer = ethers.types.Signer;
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider';
import { PolygonZkEVMDeployer } from '../../typechain-types';

const gasPriceKeylessDeployment = '100';

export async function deployPolygonZkEVMDeployer(
    deployerAddress: string,
    signer: HardhatEthersSigner,
): Promise<[PolygonZkEVMDeployer, string]> {
    const PolgonZKEVMDeployerFactory = await ethers.getContractFactory('PolygonZkEVMDeployer', signer);

    const deployTxZKEVMDeployer = (await PolgonZKEVMDeployerFactory.getDeployTransaction(deployerAddress)).data;

    const gasLimit = BigInt(1000000); // Put 1 Million, aprox 650k are necessary
    const gasPrice = BigInt(ethers.parseUnits(gasPriceKeylessDeployment, 'gwei'));

    const signature = {
        v: 27,
        r: '0x5ca1ab1e0', // Equals 0x00000000000000000000000000000000000000000000000000000005ca1ab1e0
        s: '0x5ca1ab1e', // Equals 0x000000000000000000000000000000000000000000000000000000005ca1ab1e
    };
    const tx = ethers.Transaction.from({
        to: null, // bc deployment transaction, "to" is "0x"
        nonce: 0,
        value: 0,
        gasLimit,
        gasPrice,
        data: deployTxZKEVMDeployer,
        type: 0, // legacy transaction
        signature,
    });

    const totalEther = gasLimit * gasPrice; // 0.1 ether
    const signerProvider = signer.provider as HardhatEthersProvider;
    // Check if it's already deployed
    const zkEVMDeployerAddress = ethers.getCreateAddress({ from: tx.from as string, nonce: tx.nonce });
    if ((await signerProvider.getCode(zkEVMDeployerAddress)) !== '0x') {
        const zkEVMDeployerContract = PolgonZKEVMDeployerFactory.attach(zkEVMDeployerAddress) as PolygonZkEVMDeployer;
        expect(await zkEVMDeployerContract.owner()).to.be.equal(signer.address);
        return [zkEVMDeployerContract, ethers.ZeroAddress];
    }

    // Fund keyless deployment
    const params = {
        to: tx.from,
        value: totalEther,
    };
    await (await signer.sendTransaction(params)).wait();

    // Deploy zkEVMDeployer

    await (await signerProvider.broadcastTransaction(tx.serialized)).wait();

    const zkEVMDeployerContract = (await PolgonZKEVMDeployerFactory.attach(
        zkEVMDeployerAddress,
    )) as PolygonZkEVMDeployer;
    expect(await zkEVMDeployerContract.owner()).to.be.equal(deployerAddress);
    return [zkEVMDeployerContract, tx.from as string];
}

export async function create2Deployment(
    polygonZKEVMDeployerContract: PolygonZkEVMDeployer,
    salt: string,
    deployTransaction: string,
    dataCall: string | null,
    deployer: HardhatEthersSigner,
    hardcodedGasLimit: bigint | null,
) {
    // Encode deploy transaction
    const hashInitCode = ethers.solidityPackedKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    const precalculatedAddressDeployed = ethers.getCreate2Address(
        polygonZKEVMDeployerContract.target as string,
        salt,
        hashInitCode,
    );
    const amount = 0;

    if ((await deployer.provider.getCode(precalculatedAddressDeployed)) !== '0x') {
        return [precalculatedAddressDeployed, false];
    }

    if (dataCall) {
        // Deploy using create2 and call
        if (hardcodedGasLimit) {
            const populatedTransaction =
                await polygonZKEVMDeployerContract.deployDeterministicAndCall.populateTransaction(
                    amount,
                    salt,
                    deployTransaction,
                    dataCall,
                );
            populatedTransaction.gasLimit = hardcodedGasLimit;
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (
                await polygonZKEVMDeployerContract.deployDeterministicAndCall(amount, salt, deployTransaction, dataCall)
            ).wait();
        }
    } else {
        // Deploy using create2
        if (hardcodedGasLimit) {
            const populatedTransaction = await polygonZKEVMDeployerContract.deployDeterministic.populateTransaction(
                amount,
                salt,
                deployTransaction,
            );
            populatedTransaction.gasLimit = hardcodedGasLimit;
            await (await deployer.sendTransaction(populatedTransaction)).wait();
        } else {
            await (await polygonZKEVMDeployerContract.deployDeterministic(amount, salt, deployTransaction)).wait();
        }
    }
    return [precalculatedAddressDeployed, true];
}

export function getCreate2Address(
    polgonZKEVMDeployerContract: PolygonZkEVMDeployer,
    salt: string,
    deployTransaction: string,
) {
    // Encode deploy transaction
    const hashInitCode = ethers.solidityPackedKeccak256(['bytes'], [deployTransaction]);

    // Precalculate create2 address
    return ethers.getCreate2Address(polgonZKEVMDeployerContract.target as string, salt, hashInitCode);
}

export async function getAddressInfo(address: string | Addressable) {
    /*
     * bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
     * bytes32 internal constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
     */
    const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as any;
    const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as any;

    const nonce = await ethers.provider.getTransactionCount(address);
    const bytecode = await ethers.provider.getCode(address);

    const storage = {} as {
        [key: string]: number | string;
    };

    for (let i = 0; i < 200; i++) {
        const storageValue = await ethers.provider.getStorage(address, i);
        if (storageValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            storage[ethers.toBeHex(i, 32)] = storageValue;
        }
    }

    const valueAdminSlot = await ethers.provider.getStorage(address, ADMIN_SLOT);
    if (valueAdminSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        storage[ADMIN_SLOT] = valueAdminSlot;
    }
    const valueImplementationSlot = await ethers.provider.getStorage(address, IMPLEMENTATION_SLOT);
    if (valueImplementationSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        storage[IMPLEMENTATION_SLOT] = valueImplementationSlot;
    }

    return { nonce, bytecode, storage };
}
