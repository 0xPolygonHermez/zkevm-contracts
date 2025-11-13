/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, no-console */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as utilsECDSA from '../../src/utils-aggchain-ECDSA';

const pathTestvectors = path.join(__dirname, '../test-vectors/aggchainECDSA');
const aggchainDataTestvectors = require(path.join(pathTestvectors, 'aggchain-data.json'));
const aggchainInitBytesV0 = require(path.join(pathTestvectors, 'aggchain-initBytesv0.json'));
const aggchainInitBytesV1 = require(path.join(pathTestvectors, 'aggchain-initBytesv1.json'));
const aggchainHashParams = require(path.join(pathTestvectors, 'hash-aggchain-params.json'));

describe('Test vectors aggchain ECDSA utils', () => {
    const update = process.env.UPDATE === 'true';

    for (let i = 0; i < aggchainDataTestvectors.length; i++) {
        it(`Check test-vectors compute aggchain data ID=${i}`, async () => {
            const testVector = aggchainDataTestvectors[i].input;
            const aggchainData = utilsECDSA.encodeAggchainDataECDSA(
                testVector.aggchainVKeySelector,
                testVector.newStateRoot,
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
            const initBytesAggchainECDSAv0 = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
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
                aggchainInitBytesV0[i].output.initBytesAggchainECDSAv0 = initBytesAggchainECDSAv0;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-initBytesv0.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-initBytesv0.json'),
                    JSON.stringify(aggchainInitBytesV0, null, 2),
                );
            } else {
                expect(initBytesAggchainECDSAv0).to.equal(aggchainInitBytesV0[i].output.initBytesAggchainECDSAv0);
            }
        });
    }

    for (let i = 0; i < aggchainInitBytesV1.length; i++) {
        it(`Check test-vectors encode initialize bytes aggchain version 1 ID=${i}`, async () => {
            const testVector = aggchainInitBytesV1[i].input;
            const initBytesAggchainECDSAv1 = utilsECDSA.encodeInitializeBytesAggchainECDSAv1(
                testVector.useDefaultGateway,
                testVector.initOwnedAggchainVKey,
                testVector.initAggchainVKeySelector,
                testVector.vKeyManager,
            );
            if (update) {
                aggchainInitBytesV1[i].output = {};
                aggchainInitBytesV1[i].output.initBytesAggchainECDSAv1 = initBytesAggchainECDSAv1;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-initBytesv1.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-initBytesv1.json'),
                    JSON.stringify(aggchainInitBytesV1, null, 2),
                );
            } else {
                expect(initBytesAggchainECDSAv1).to.equal(aggchainInitBytesV1[i].output.initBytesAggchainECDSAv1);
            }
        });
    }

    for (let i = 0; i < aggchainHashParams.length; i++) {
        it(`Check test-vectors hash aggchain parameters ID=${i}`, async () => {
            const testVector = aggchainHashParams[i].input;
            const hashAggchainParams = utilsECDSA.computeHashAggchainParamsECDSA(testVector.trustedSequencer);
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
