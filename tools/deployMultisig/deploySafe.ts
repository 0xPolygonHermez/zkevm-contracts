import { ethers } from 'hardhat';
import path from 'path';
import fs from 'fs';
import { logger } from '../../src/logger';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';
import {
    DDP_ADDRESS,
    ONE_TIME_DEPLOYER_ADDRESS,
    DDP_FUND_AMOUNT,
    DDP_DEPLOY_RAW_TX,
    SAFE_SINGLETON_ADDRESS,
    SAFE_SINGLETON_DEPLOYMENT_DATA,
    GNOSIS_SAFE_PROXY_FACTORY_ADDRESS,
    SAFE_PROXY_FACTORY_DEPLOYMENT_DATA,
} from './constants';

async function deployViaDDP(provider: any, deployer: any, address: string, data: string, name: string): Promise<string | null> {
    if ((await provider.getCode(address)) !== '0x') {
        logger.info(`${name} exists`);
        return null;
    }

    const tx = await deployer.sendTransaction({ to: DDP_ADDRESS, data, value: 0 });
    await tx.wait();

    if ((await provider.getCode(address)) === '0x') {
        throw new Error(`${name} deployment failed`);
    }

    logger.info(`✅ ${name} deployed`);
    return tx.hash;
}

async function main() {
    const output: { [key: string]: string } = {};

    // Setup
    const parametersPath = path.join(__dirname, 'deploy_parameters.json');
    const deployParameters = fs.existsSync(parametersPath) ? fs.readFileSync(parametersPath, 'utf8') : {};
    const provider = getProviderAdjustingMultiplierGas(deployParameters, ethers);
    const network = await ethers.provider.getNetwork();
    output.network = network.name;
    const deployer = await getDeployerFromParameters(provider, deployParameters, ethers);

    // Deploy DDP
    if ((await provider.getCode(DDP_ADDRESS)) !== '0x') {
        logger.info('DDP exists');
    } else {
        const balance = await provider.getBalance(ONE_TIME_DEPLOYER_ADDRESS);
        if (balance < DDP_FUND_AMOUNT) {
            await (await deployer.sendTransaction({ to: ONE_TIME_DEPLOYER_ADDRESS, value: DDP_FUND_AMOUNT - balance })).wait();
        }

        const tx = await provider.broadcastTransaction(DDP_DEPLOY_RAW_TX);
        await tx.wait();
        output.ddpDeployTx = tx.hash;

        if ((await provider.getCode(DDP_ADDRESS)) === '0x') {
            throw new Error('DDP deployment failed');
        }

        logger.info('✅ DDP deployed');
    }

    // Deploy Safe Singleton and Proxy Factory
    const singletonTx = await deployViaDDP(provider, deployer, SAFE_SINGLETON_ADDRESS, SAFE_SINGLETON_DEPLOYMENT_DATA, 'Safe Singleton');
    const factoryTx = await deployViaDDP(provider, deployer, GNOSIS_SAFE_PROXY_FACTORY_ADDRESS, SAFE_PROXY_FACTORY_DEPLOYMENT_DATA, 'Safe Proxy Factory');

    // Save output
    const result = {
        network: network.name,
        DDP_ADDRESS,
        SAFE_SINGLETON_ADDRESS,
        SAFE_PROXY_FACTORY_ADDRESS: GNOSIS_SAFE_PROXY_FACTORY_ADDRESS,
        ...(output.ddpDeployTx && { ddpDeployTx: output.ddpDeployTx }),
        ...(singletonTx && { safeSingletonDeployTx: singletonTx }),
        ...(factoryTx && { safeProxyFactoryDeployTx: factoryTx }),
    };

    const outputPath = path.join(__dirname, `deploy_output_${new Date().toISOString()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    logger.info('✅ Infrastructure ready');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
