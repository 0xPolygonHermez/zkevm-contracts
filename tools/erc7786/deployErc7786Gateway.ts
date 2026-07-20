/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import deployParameters from './deploy_erc7786_gateway.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutput = path.resolve(__dirname, './deploy_erc7786_gateway_output.json');

async function main() {
    // Check mandatory parameters
    const mandatoryDeploymentParameters = ['bridgeAddress'];
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of mandatoryDeploymentParameters) {
        if ((deployParameters as any)[parameterName] === undefined || (deployParameters as any)[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n,
                    );
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
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log('deploying with: ', deployer.address);

    const { bridgeAddress } = deployParameters;
    // Owner of the gateway (can register remote networks). Defaults to the deployer
    const owner = deployParameters.owner || deployer.address;

    // Sanity check: the bridge must expose networkID() on this network
    const bridgeContract = await ethers.getContractAt('AgglayerBridge', bridgeAddress, deployer);
    const localNetworkID = await bridgeContract.networkID();
    console.log(`bridge ${bridgeAddress} has networkID: ${localNetworkID}`);

    // Deploy the gateway (same contract on L1 and L2, only the bridge/owner differ)
    const gatewayFactory = await ethers.getContractFactory('AgglayerERC7786Gateway', deployer);
    const gatewayContract = await gatewayFactory.deploy(bridgeAddress, owner);
    await gatewayContract.waitForDeployment();

    console.log('#######################\n');
    console.log('AgglayerERC7786Gateway deployed to:', gatewayContract.target);
    console.log('local networkID:', localNetworkID.toString());
    console.log('owner:', owner);
    console.log('#######################\n');

    // Register remote networks (only possible if the deployer is the owner)
    const remoteNetworks = deployParameters.remoteNetworks || [];
    const registeredNetworks = [];
    if (remoteNetworks.length > 0) {
        if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log('Skipping remote network registration: deployer is not the owner');
        } else {
            // eslint-disable-next-line no-restricted-syntax
            for (const remoteNetwork of remoteNetworks) {
                const { chainId, networkID, gateway } = remoteNetwork;
                const tx = await gatewayContract.registerRemoteNetwork(chainId, networkID, gateway);
                await tx.wait();
                console.log(
                    `registered remote network: chainId ${chainId}, networkID ${networkID}, gateway ${gateway}`,
                );
                registeredNetworks.push({ chainId, networkID, gateway });
            }
        }
    }

    const outputJson = {
        deployer: deployer.address,
        owner,
        bridgeAddress,
        localNetworkID: localNetworkID.toString(),
        erc7786GatewayContract: gatewayContract.target,
        registeredRemoteNetworks: registeredNetworks,
    };

    console.log('you can verify the contract address with:');
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${gatewayContract.target} --network ${process.env.HARDHAT_NETWORK}\n`,
    );
    console.log('Copy the following constructor arguments on: upgrade/arguments.js \n', [bridgeAddress, owner]);

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
