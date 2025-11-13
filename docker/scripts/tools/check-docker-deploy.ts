/* eslint-disable no-console */

import * as ethers from 'ethers';
import rollupManager from '../../../compiled-contracts/PolygonRollupManager.json';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

async function main() {
    const currentProvider = ethers.getDefaultProvider('http://localhost:8545');
    const signerNode = await currentProvider.getSigner();

    const rollupManagerContract = new ethers.Contract(
        '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e',
        rollupManager.abi,
        signerNode,
    );
    const infoContract = await rollupManagerContract.rollupIDToRollupDataV2(1);
    const info = {
        rollupContract: infoContract[0],
        chainID: infoContract[1],
        verifier: infoContract[2],
        forkID: infoContract[3],
        lastLocalExitRoot: infoContract[4],
        lastBatchSequenced: infoContract[5],
        lastVerifiedBatch: infoContract[6],
        lastVerifiedBatchBeforeUpgrade: infoContract[7],
        rollupTypeID: infoContract[8],
        rollupVerifierType: infoContract[9],
        lastPessimisticRoot: infoContract[10],
        programVKey: infoContract[11],
    };
    console.log(info);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
