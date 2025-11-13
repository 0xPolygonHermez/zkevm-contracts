/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import deployParameters from './deploy_claimCompressor.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutput = path.resolve(__dirname, './deploy_claim_compressor_output.json');

async function main() {
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

    /*
     *Deployment pol
     */
    const { bridgeAddress } = deployParameters;
    const { networkId } = deployParameters;

    const ClaimCompressor = await ethers.getContractFactory('ClaimCompressor', deployer);
    const ClaimCompressorContract = await ClaimCompressor.deploy(bridgeAddress, networkId);
    await ClaimCompressorContract.waitForDeployment();

    const outputJson = {
        deployer: deployer.address,
        ClaimCompressorContract: ClaimCompressorContract.target,
    };

    console.log('#######################\n');
    console.log('Claim Compressor deployed to:', ClaimCompressorContract.target);
    console.log('#######################\n');

    console.log('you can verify the contract address with:');
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${ClaimCompressorContract.target} --network ${process.env.HARDHAT_NETWORK}\n`,
    );
    console.log('Copy the following constructor arguments on: upgrade/arguments.js \n', [bridgeAddress, networkId]);

    await fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
