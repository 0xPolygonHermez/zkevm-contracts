import fs from 'fs';
import path from 'path';
import baseline from '../previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';
import { BridgeForkParameters, forkAndUpgradeBridge } from '../bridgeFork';
import { logger } from '../../src/logger';
import { checkBridgeArtifacts, checkDeployedBridgeImplementation, TARGET_BRIDGE_VERSION } from './bridgeUpgrade';

export function forkAndUpgrade(parameters: Omit<BridgeForkParameters, 'bridgeAddress'> & { bridgeL2Address: string }) {
    return forkAndUpgradeBridge(
        { ...parameters, bridgeAddress: parameters.bridgeL2Address },
        {
            contractName: 'AgglayerBridgeL2',
            targetVersion: TARGET_BRIDGE_VERSION,
            baseline,
            checkArtifacts: checkBridgeArtifacts,
            checkImplementation: checkDeployedBridgeImplementation,
        },
    );
}

async function main() {
    const parameters = JSON.parse(fs.readFileSync(path.join(__dirname, 'upgrade_parameters.json'), 'utf8'));
    const report = await forkAndUpgrade(parameters);
    // Simulation addresses are kept separate from live upgrade_output.json and cannot be used on-chain.
    fs.writeFileSync(path.join(__dirname, 'fork_upgrade_output.json'), `${JSON.stringify(report, null, 2)}\n`);
    logger.info(JSON.stringify(report, null, 2));
    logger.info('Fork rehearsal passed. All deployed addresses and transactions exist only on the local fork.');
}

if (require.main === module) {
    main().catch((error) => {
        logger.error(error);
        process.exitCode = 1;
    });
}
