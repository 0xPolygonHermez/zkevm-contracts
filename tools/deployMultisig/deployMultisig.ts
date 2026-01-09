import { ethers } from 'hardhat';
import path from 'path';
import fs from 'fs';
import { logger } from '../../src/logger';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';

const OUTPUT_INFO_PATH = path.join(__dirname, 'multisig_output.json');

async function main() {
    const outputInfo: { [key: string]: string } = {};

    // Load deployment parameters from env or hardhat config
    const filePath = path.join(__dirname, 'deploy_parameters.json');
    let deployParameters = {};
    if (fs.existsSync(filePath)) {
        deployParameters = fs.readFileSync(filePath, 'utf8');
    }

    // Setup provider and deployer
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);
    const network = await ethers.provider.getNetwork();
    outputInfo.network = network.name;
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);

    // Create mulitisig
    const EXPECTED_SAFE = '0x242daE44F5d8fb54B198D03a94dA45B5a4413e21';
    const GNOSIS_SAFE_PROXY_FACTORY_ADDRESS = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';

    // sanity: avoid redeploying if already exists
    const codeMultisig = await currentProvider.getCode(EXPECTED_SAFE);

    if (codeMultisig !== '0x') {
        logger.info(`Safe already exists at ${EXPECTED_SAFE}`);
    } else {
        logger.info('Deploying Safe (multisig)...');

        const INPUT_DATA_MULTISIG =
            '0x1688f0b9000000000000000000000000d9db270c1b5e3bd161e8c8503c55ceabee709552000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000186e99e2e0800000000000000000000000000000000000000000000000000000000000001a4b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000180000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000004c1665d6651ecefa59b9b3041951608468b18891000000000000000000000000a0b02b28920812324f1cc3255bd8840867d3f227000000000000000000000000ead77b01ea770839f7f576cd1516ff6a298d9db2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

        /* Gnosis Safe Proxy Factory
        Call: createProxyWithNonce(
           singleton: 0xD9dB270c1B5E3bd161e8c8503C55cEaBee709552,   // Safe mastercopy
           initializer: Safe.setup(
             owners: [
               0x4C1665d6651ECefa59B9B3041951608468B18891,
               0xA0b02b28920812324F1cC3255Bd8840867d3F227,
               0xEAD77b01EA770839F7F576cD1516ff6a298D9DB2
             ],
             threshold: 2,                                       // 2 of 3 signatures required
             to: address(0),                                     // No extra call
             data: "",                                           // Empty data
             fallbackHandler: 0xF48f2B2D2a534E402487b3Ee7C18C33Aec0FE5e4,
             paymentToken: address(0),
             payment: 0,
             paymentReceiver: address(0)
           ),
           saltNonce: 1678956703240                               // CREATE2 nonce
        ) */

        const txMultisig = await deployer.sendTransaction({
            to: GNOSIS_SAFE_PROXY_FACTORY_ADDRESS,
            data: INPUT_DATA_MULTISIG,
            value: 0,
        });

        await txMultisig.wait();
        outputInfo.multisigDeployTx = txMultisig.hash;
        logger.info(`Hash: ${txMultisig.hash}`);

        const codeAfterMultisig = await currentProvider.getCode(EXPECTED_SAFE);

        if (!codeAfterMultisig || codeAfterMultisig === '0x') {
            throw new Error('❌ Safe not created');
        } else {
            logger.info(`✅ Safe created: ${EXPECTED_SAFE}`);
        }
    }

    outputInfo.MULTISIG_ADDRESS = EXPECTED_SAFE;

    // Save output info
    const dateStr = new Date().toISOString();
    fs.writeFileSync(OUTPUT_INFO_PATH.replace('.json', `_${dateStr}.json`), JSON.stringify(outputInfo, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
