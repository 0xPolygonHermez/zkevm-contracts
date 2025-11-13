import params from './parameters.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';
import * as utilsFEP from '../../../src/utils-aggchain-FEP';

async function main() {
    logger.info('Starting tool to create inititizeAggchainBytesV0');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['aggchainVKeyVersion', 'outputRoot', 'l2BlockNumber'];

    checkParams(params, mandatoryParameters);

    const { aggchainVKeyVersion, outputRoot, l2BlockNumber } = params;

    const result = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, outputRoot, l2BlockNumber);
    logger.info('aggchainData:');
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
