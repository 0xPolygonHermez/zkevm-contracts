import params from './parameters.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to create inititizeAggchainBytesV0');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = [
        'initParams',
        'useDefaultVkeys',
        'useDefaultSigners',
        'initOwnedAggchainVKey',
        'initAggchainVKeyVersion',
        'vKeyManager',
        'admin',
        'trustedSequencer',
        'gasTokenAddress',
        'trustedSequencerURL',
        'networkName',
    ];

    checkParams(params, mandatoryParameters);

    const {
        initParams,
        useDefaultVkeys,
        useDefaultSigners,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
        admin,
        trustedSequencer,
        gasTokenAddress,
        trustedSequencerURL,
        networkName,
    } = params;

    // Generate initialization parameters for FEP v0
    const initializationParams = {
        initParams,
        signers: [], // No signers initially
        threshold: 0, // No threshold initially
        useDefaultVkeys,
        useDefaultSigners,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
        admin,
        trustedSequencer,
        gasTokenAddress,
        trustedSequencerURL,
        networkName,
    };

    logger.info('FEP v0 Initialization Parameters:');
    logger.info(JSON.stringify(initializationParams, null, 2));

    logger.info('\nTo initialize the FEP contract, call:');
    logger.info('aggchainContract.initialize(');
    logger.info('  initParams,');
    logger.info('  [], // signers');
    logger.info('  0, // threshold');
    logger.info('  useDefaultVkeys,');
    logger.info('  useDefaultSigners,');
    logger.info('  initOwnedAggchainVKey,');
    logger.info('  initAggchainVKeyVersion,');
    logger.info('  admin,');
    logger.info('  trustedSequencer,');
    logger.info('  gasTokenAddress,');
    logger.info('  trustedSequencerURL,');
    logger.info('  networkName');
    logger.info(');');
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
