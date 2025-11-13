/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, no-console */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as utilsFEP from '../../src/utils-aggchain-FEP';

const pathTestvectors = path.join(__dirname, '../test-vectors/aggchainFEP');
const aggchainDataTestvectors = require(path.join(pathTestvectors, 'aggchain-data.json'));
const aggchainInitBytesV0 = require(path.join(pathTestvectors, 'aggchain-initBytesv0.json'));
const aggchainInitBytesV1 = require(path.join(pathTestvectors, 'aggchain-initBytesv1.json'));
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

    for (let i = 0; i < aggchainInitBytesV0.length; i++) {
        it(`Check test-vectors encode initialize bytes aggchain version 0 ID=${i}`, async () => {
            const testVector = aggchainInitBytesV0[i].input;
            const initBytesAggchainFEPv0 = utilsFEP.encodeInitializeBytesAggchainFEPv0(
                testVector.initParams,
                testVector.useDefaultGateway,
                testVector.initOwnedAggchainVKey,
                testVector.initAggchainVKeySelector,
                testVector.vKeyManager,
                testVector.admin,
                testVector.trustedSequencer,
                testVector.gasTokenAddress,
                testVector.trustedSequencerURL,
                testVector.networkName,
            );
            if (update) {
                aggchainInitBytesV0[i].output = {};
                aggchainInitBytesV0[i].output.initBytesAggchainFEPv0 = initBytesAggchainFEPv0;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-initBytesv0.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-initBytesv0.json'),
                    JSON.stringify(aggchainInitBytesV0, null, 2),
                );
            } else {
                expect(initBytesAggchainFEPv0).to.equal(aggchainInitBytesV0[i].output.initBytesAggchainFEPv0);
            }
        });
    }

    for (let i = 0; i < aggchainInitBytesV1.length; i++) {
        it(`Check test-vectors encode initialize bytes aggchain version 1 ID=${i}`, async () => {
            const testVector = aggchainInitBytesV1[i].input;
            const initBytesAggchainFEPv1 = utilsFEP.encodeInitializeBytesAggchainFEPv1(
                testVector.initParams,
                testVector.useDefaultGateway,
                testVector.initOwnedAggchainVKey,
                testVector.initAggchainVKeySelector,
                testVector.vKeyManager,
            );
            if (update) {
                aggchainInitBytesV1[i].output = {};
                aggchainInitBytesV1[i].output.initBytesAggchainFEPv1 = initBytesAggchainFEPv1;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-initBytesv1.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-initBytesv1.json'),
                    JSON.stringify(aggchainInitBytesV1, null, 2),
                );
            } else {
                expect(initBytesAggchainFEPv1).to.equal(aggchainInitBytesV1[i].output.initBytesAggchainFEPv1);
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
