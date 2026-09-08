import { checkBridgeArtifacts } from '../../upgrade/upgradeSovereignBridge-v1.2.0/bridgeUpgrade';
import { logger } from '../../src/logger';

async function main() {
    const { sizes } = await checkBridgeArtifacts();
    logger.info('L1/L2 Hardhat ABIs, original storage layouts, shared module layout, and bytecode budgets passed');
    logger.info(JSON.stringify(sizes, null, 2));
}

main().catch((error) => {
    logger.error(error);
    process.exitCode = 1;
});
