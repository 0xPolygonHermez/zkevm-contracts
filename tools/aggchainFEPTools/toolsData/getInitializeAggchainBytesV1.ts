import params from './parameters.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';
import * as utilsFEP from '../../../src/utils-aggchain-FEP';

async function main() {
    logger.info('Starting tool to create inititizeAggchainBytesV1');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = [
        'initParams',
        'useDefaultGateway',
        'initOwnedAggchainVKey',
        'initAggchainVKeyVersion',
        'vKeyManager',
    ];

    checkParams(params, mandatoryParameters);

    const { initParams, useDefaultGateway, initOwnedAggchainVKey, initAggchainVKeyVersion, vKeyManager } = params;

    const result = utilsFEP.encodeInitializeBytesAggchainFEPv1(
        initParams,
        useDefaultGateway,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
    );
    logger.info('InitializeBytesAggchainFEPv1:');
    logger.info(result);
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        logger.error(err.message);
        logger.error(err.stack);
        process.exit(1);
    },
);
