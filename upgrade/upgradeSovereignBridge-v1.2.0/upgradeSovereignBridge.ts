import assert from 'assert';
import path = require('path');
import fs = require('fs');
import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';
import { logger } from '../../src/logger';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';
import { addInfoOutput } from '../../tools/utils';
import {
    BridgeUpgradeParameters,
    buildBridgeUpgradeOperation,
    checkDeployedBridgeImplementation,
    preflightBridgeUpgrade,
} from './bridgeUpgrade';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

async function main() {
    const parameters = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'upgrade_parameters.json'), 'utf8'),
    ) as BridgeUpgradeParameters & { deployImplementation?: boolean; unsafeMode?: boolean; forceImport?: boolean };
    const preflight = await preflightBridgeUpgrade(parameters);
    logger.info(JSON.stringify(preflight, null, 2));
    // Keep preflight signer-free; an explicit opt-in is required before any deployment transaction.
    if (parameters.deployImplementation !== true) {
        logger.info(
            'Read-only preflight passed. Set deployImplementation to true only after approving the deployment.',
        );
        return;
    }
    assert(
        !fs.existsSync(pathOutputJson),
        'upgrade_output.json already exists; archive it before preparing another upgrade',
    );
    if (parameters.unsafeMode)
        logger.warn('Git release checks disabled; bytecode, ABI, and storage checks remain enabled');
    if (parameters.forceImport)
        logger.warn('forceImport is unnecessary: the archived bytecode and layout are validated directly');
    const provenance = addInfoOutput({}, !parameters.unsafeMode);
    const provider = getProviderAdjustingMultiplierGas(parameters, ethers);
    assert(
        (await provider.getNetwork()).chainId.toString() === preflight.chainId,
        'Deployment provider chain mismatch',
    );
    const deployer = await getDeployerFromParameters(provider, parameters, ethers);
    logger.info(`Deploying AgglayerBridgeL2 implementation with ${deployer.address}`);
    const factory = await ethers.getContractFactory('AgglayerBridgeL2', deployer);
    // Deploys only the implementation and its module; governance still schedules and executes the upgrade.
    const implementationAddress = await upgrades.deployImplementation(factory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    });
    assert(typeof implementationAddress === 'string', 'Expected an implementation address');
    const deployed = await checkDeployedBridgeImplementation(implementationAddress);
    // Deployment may span blocks; do not emit calldata based on stale proxy or governance state.
    const currentPreflight = await preflightBridgeUpgrade(parameters);
    assert.deepStrictEqual(
        currentPreflight,
        preflight,
        'Proxy or governance changed during deployment; do not schedule',
    );
    const operation = buildBridgeUpgradeOperation(preflight, implementationAddress);
    const outputJson = {
        ...provenance,
        ...preflight,
        ...operation,
        ...deployed,
        implementationDeployBlockNumber: await ethers.provider.getBlockNumber(),
        bridgeImplementationAddress: implementationAddress,
        inputs: {
            bridgeL2Address: preflight.bridgeL2Address,
            timelockDelay: preflight.timelockDelay,
            salt: preflight.salt,
        },
    };
    fs.writeFileSync(pathOutputJson, `${JSON.stringify(outputJson, null, 2)}\n`, { flag: 'wx' });
    logger.info(`Implementation: ${implementationAddress}; immutable module: ${deployed.moduleAddress}`);
    logger.info(`Timelock calldata saved to ${pathOutputJson}. No schedule or execute transaction was sent.`);
}

main().catch((error) => {
    logger.error(error);
    process.exitCode = 1;
});
