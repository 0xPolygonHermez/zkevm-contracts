/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, no-restricted-syntax */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';

import yargs from 'yargs/yargs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const argv = yargs(process.argv.slice(2))
    .options({
        input: { type: 'string', default: '../v2/deploy_parameters.json' },
        createRollupInput: { type: 'string', default: '../v2/create_rollup_parameters.json' },
    })
    .parse() as any;

const pathDeployParameters = path.join(__dirname, argv.input);
// eslint-disable-next-line import/no-dynamic-require, @typescript-eslint/no-var-requires
const deployParameters = require(argv.input);

const pathCreateRollupParameters = path.join(__dirname, argv.createRollupInput);
// eslint-disable-next-line import/no-dynamic-require, @typescript-eslint/no-var-requires
const createRollupParameters = require(argv.createRollupInput);

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

    // Check trusted address from deploy parameters
    const mandatoryDeploymentParameters = ['trustedAggregator'];
    for (const parameterName of mandatoryDeploymentParameters) {
        if (deployParameters[parameterName] === undefined || deployParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const { trustedAggregator } = deployParameters;

    const mandatoryDeploymentParametersCreateRollup = ['trustedSequencer'];
    for (const parameterName of mandatoryDeploymentParametersCreateRollup) {
        if (createRollupParameters[parameterName] === undefined || createRollupParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const { trustedSequencer } = createRollupParameters;

    /*
     *Deployment pol
     */
    const polTokenName = 'Pol Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock', deployer);
    const polTokenContract = await polTokenFactory.deploy(
        polTokenName,
        polTokenSymbol,
        deployer.address,
        polTokenInitialBalance,
    );
    await polTokenContract.waitForDeployment();

    console.log('#######################\n');
    console.log('pol deployed to:', polTokenContract.target);

    // fund sequencer account with tokens and ether if it have less than 0.1 ether.
    const balanceEther = await ethers.provider.getBalance(trustedSequencer);
    const minEtherBalance = ethers.parseEther('0.1');
    if (balanceEther < minEtherBalance) {
        const params = {
            to: trustedSequencer,
            value: minEtherBalance,
        };
        await (await deployer.sendTransaction(params)).wait();
    }
    const tokensBalance = ethers.parseEther('100000');
    await (await polTokenContract.transfer(trustedSequencer, tokensBalance)).wait();

    // fund aggregator account with ether if it have less than 0.1 ether.
    const balanceEtherAggr = await ethers.provider.getBalance(trustedAggregator);
    if (balanceEtherAggr < minEtherBalance) {
        const params = {
            to: trustedAggregator,
            value: minEtherBalance,
        };
        await (await deployer.sendTransaction(params)).wait();
    }

    deployParameters.polTokenAddress = polTokenContract.target;

    if (createRollupParameters.gasTokenAddress === 'deploy') {
        /*
         * Deployment gasToken address
         * A erc20 is deployed in this testnet in case it's wanted to deploy a rollup that uses this token as the gas token
         */
        const gasTokenName = 'Gas Token';
        const gasTokenSymbol = 'GAS';

        const gasTokenFactory = await ethers.getContractFactory(
            '@openzeppelin/contracts4/token/ERC20/ERC20.sol:ERC20',
            deployer,
        );
        const gasTokenContract = await gasTokenFactory.deploy(gasTokenName, gasTokenSymbol);
        await gasTokenContract.waitForDeployment();
        createRollupParameters.gasTokenAddress = gasTokenContract.target;
        console.log('#######################\n');
        console.log('gas token deployed to:', gasTokenContract.target);
        fs.writeFileSync(pathCreateRollupParameters, JSON.stringify(createRollupParameters, null, 1));
    }

    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
