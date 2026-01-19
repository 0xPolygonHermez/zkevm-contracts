import { ethers } from 'hardhat';
import path from 'path';
import fs from 'fs';
import { logger } from '../../src/logger';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';
import {
    SAFE_SINGLETON_ADDRESS,
    GNOSIS_SAFE_PROXY_FACTORY_ADDRESS,
    FALLBACK_HANDLER_ADDRESS,
    SAFE_SETUP_ABI,
    SAFE_PROXY_FACTORY_ABI,
} from './constants';

async function main() {
    // Parse and validate inputs
    const ownersInput = process.env.SAFE_OWNERS;
    const thresholdInput = process.env.SAFE_THRESHOLD;
    const saltNonceInput = process.env.SALT_NONCE;

    if (!ownersInput || !thresholdInput) {
        logger.error('Usage: SAFE_OWNERS=0xAddr1,0xAddr2 SAFE_THRESHOLD=2 [SALT_NONCE=123] npx hardhat run tools/deployMultisig/deployMultisig.ts --network <network>');
        process.exit(1);
    }

    const owners = ownersInput.split(',').map((addr) => addr.trim());
    const threshold = parseInt(thresholdInput);
    const saltNonce = saltNonceInput ? parseInt(saltNonceInput) : Date.now();

    if (owners.length === 0 || !owners.every(ethers.isAddress)) {
        logger.error('❌ Invalid owner addresses');
        process.exit(1);
    }

    if (threshold < 1 || threshold > owners.length) {
        logger.error(`❌ Invalid threshold. Must be between 1 and ${owners.length}`);
        process.exit(1);
    }

    logger.info(`Owners: ${owners.length}, Threshold: ${threshold}, Salt: ${saltNonce}`);

    // Setup
    const parametersPath = path.join(__dirname, 'deploy_parameters.json');
    const deployParameters = fs.existsSync(parametersPath) ? fs.readFileSync(parametersPath, 'utf8') : {};
    const provider = getProviderAdjustingMultiplierGas(deployParameters, ethers);
    const network = await ethers.provider.getNetwork();
    const deployer = await getDeployerFromParameters(provider, deployParameters, ethers);

    // Encode Safe setup
    const setupData = new ethers.Interface(SAFE_SETUP_ABI).encodeFunctionData('setup', [
        owners,
        threshold,
        ethers.ZeroAddress,
        '0x',
        FALLBACK_HANDLER_ADDRESS,
        ethers.ZeroAddress,
        0,
        ethers.ZeroAddress,
    ]);

    const factory = new ethers.Contract(GNOSIS_SAFE_PROXY_FACTORY_ADDRESS, SAFE_PROXY_FACTORY_ABI, deployer);

    // Get expected Safe address
    const safeAddress = await factory.createProxyWithNonce.staticCall(SAFE_SINGLETON_ADDRESS, setupData, saltNonce);
    
    // Check if Safe already exists
    const existingCode = await provider.getCode(safeAddress);
    if (existingCode && existingCode !== '0x') {
        throw new Error(`❌ Safe already exists at ${safeAddress}. Use a different SALT_NONCE.`);
    }

    // Deploy Safe
    const tx = await factory.createProxyWithNonce(SAFE_SINGLETON_ADDRESS, setupData, saltNonce);
    await tx.wait();
    logger.info(`✅ Safe deployed: ${safeAddress}`);

    // Save output
    const output = {
        network: network.name,
        MULTISIG_ADDRESS: safeAddress,
        owners: owners.join(','),
        threshold: threshold.toString(),
        saltNonce: saltNonce.toString(),
        txHash: tx.hash,
    };

    const outputPath = path.join(__dirname, `multisig_output_${new Date().toISOString()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    logger.info(`📄 ${outputPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
