import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ethers, run } from 'hardhat';
import { BRIDGE_CONTRACT, MODULE_CONTRACT, checkDeployedBridgeImplementation } from './bridgeUpgrade';
import { logger } from '../../src/logger';

async function main() {
    const output = JSON.parse(fs.readFileSync(path.join(__dirname, 'upgrade_output.json'), 'utf8'));
    assert((await ethers.provider.getNetwork()).chainId.toString() === output.chainId, 'Wrong verification network');
    // Verify the recorded deployment before publishing source for either component.
    const deployed = await checkDeployedBridgeImplementation(output.bridgeImplementationAddress);
    assert.deepStrictEqual(
        deployed,
        {
            moduleAddress: output.moduleAddress,
            implementationCodeHash: output.implementationCodeHash,
            moduleCodeHash: output.moduleCodeHash,
        },
        'Deployed contracts differ from upgrade output',
    );
    // The implementation exposes the full bridge ABI; users never need the module ABI for proxy calls.
    await run('verify:verify', {
        address: output.bridgeImplementationAddress,
        constructorArguments: [],
        contract: BRIDGE_CONTRACT,
    });
    await run('verify:verify', {
        address: deployed.moduleAddress,
        constructorArguments: [],
        contract: MODULE_CONTRACT,
    });
    logger.info('Implementation and module verified. The implementation ABI exposes all existing proxy entrypoints.');
}

main().catch((error) => {
    logger.error(error);
    process.exitCode = 1;
});
