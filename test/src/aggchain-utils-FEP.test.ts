/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, no-console */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as utilsFEP from '../../src/utils-aggchain-FEP';

const pathTestvectors = path.join(__dirname, '../test-vectors/aggchainFEP');
const aggchainDataTestvectors = require(path.join(pathTestvectors, 'aggchain-data.json'));
const aggchainHashParams = require(path.join(pathTestvectors, 'hash-aggchain-params.json'));

describe('Test vectors aggchain FEP utils', () => {
    const update = process.env.UPDATE === 'true';

    for (let i = 0; i < aggchainDataTestvectors.length; i++) {
        it(`Check test-vectors compute aggchain data ID=${i}`, async () => {
            const testVector = aggchainDataTestvectors[i].input;
            const aggchainData = utilsFEP.encodeAggchainDataFEP(
                testVector.aggchainVKeySelector,
                testVector.outputRoot,
                testVector.l2BlockNumber,
            );

            if (update) {
                aggchainDataTestvectors[i].output = {};
                aggchainDataTestvectors[i].output.aggchainData = aggchainData;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-data.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-data.json'),
                    JSON.stringify(aggchainDataTestvectors, null, 2),
                );
            } else {
                expect(aggchainData).to.equal(aggchainDataTestvectors[i].output.aggchainData);
            }
        });
    }

    for (let i = 0; i < aggchainHashParams.length; i++) {
        it(`Check test-vectors hash aggchain parameters ID=${i}`, async () => {
            const testVector = aggchainHashParams[i].input;
            const hashAggchainParams = utilsFEP.computeHashAggchainParamsFEP(
                testVector.oldOutputRoot,
                testVector.newOutputRoot,
                testVector.l2BlockNumber,
                testVector.rollupConfigHash,
                testVector.optimisticMode,
                testVector.trustedSequencer,
                testVector.rangeVkeyCommitment,
                testVector.aggregationVkey,
            );

            if (update) {
                aggchainHashParams[i].output = {};
                aggchainHashParams[i].output.hashAggchainParams = hashAggchainParams;
                console.log(`WRITE: ${path.join(pathTestvectors, 'hash-aggchain-params.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'hash-aggchain-params.json'),
                    JSON.stringify(aggchainHashParams, null, 2),
                );
            } else {
                expect(hashAggchainParams).to.equal(aggchainHashParams[i].output.hashAggchainParams);
            }
        });
    }
});
