/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, no-console */
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as utilsCommon from '../../src/utils-common-aggchain';

const pathTestvectors = path.join(__dirname, '../test-vectors/aggchain');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const aggchainHashTestVectors = require(path.join(pathTestvectors, 'aggchain-hash.json'));
const aggchainVKeySelectorTestVectors = require(path.join(pathTestvectors, 'aggchain-vkey-selector.json'));

describe('Test vectors aggchain common utils', () => {
    const update = process.env.UPDATE === 'true';

    for (let i = 0; i < aggchainHashTestVectors.length; i++) {
        it(`Check test-vectors compute aggchain hash ID=${i}`, async () => {
            const testVector = aggchainHashTestVectors[i].input;
            const aggchainHash = utilsCommon.computeAggchainHash(
                testVector.consensusType,
                testVector.aggchainVKey,
                testVector.hashAggchainParams,
            );
            if (update) {
                aggchainHashTestVectors[i].output = {};
                aggchainHashTestVectors[i].output.aggchainHash = aggchainHash;
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-hash.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-hash.json'),
                    JSON.stringify(aggchainHashTestVectors, null, 2),
                );
            } else {
                expect(aggchainHash).to.equal(aggchainHashTestVectors[i].output.aggchainHash);
            }
        });
    }

    for (let i = 0; i < aggchainVKeySelectorTestVectors.length; i++) {
        it(`Check test-vectors getAggchainVKeySelector hash ID=${i}`, async () => {
            const testVector = aggchainVKeySelectorTestVectors[i].input;
            const aggchainVKeySelector = utilsCommon.getAggchainVKeySelector(
                testVector.aggchainVKeyVersion,
                testVector.aggchainType,
            );
            if (update) {
                const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
                const aggchainContract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
                    initializer: false,
                    constructorArgs: [
                        '0xA00000000000000000000000000000000000000A',
                        '0xB00000000000000000000000000000000000000B',
                        '0xC00000000000000000000000000000000000000C',
                        '0xD00000000000000000000000000000000000000D',
                        '0xE00000000000000000000000000000000000000E',
                    ],
                    unsafeAllow: ['constructor', 'state-variable-immutable'],
                });
                await aggchainContract.waitForDeployment();

                aggchainVKeySelectorTestVectors[i].output = {};
                aggchainVKeySelectorTestVectors[i].output.aggchainVKeySelector =
                    await aggchainContract.getAggchainVKeySelector(
                        testVector.aggchainVKeySelector,
                        testVector.aggchainType,
                    );
                console.log(`WRITE: ${path.join(pathTestvectors, 'aggchain-vkey-selector.json')}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, 'aggchain-vkey-selector.json'),
                    JSON.stringify(aggchainVKeySelectorTestVectors, null, 2),
                );
            } else {
                expect(aggchainVKeySelector.toLowerCase()).to.equal(
                    aggchainVKeySelectorTestVectors[i].output.aggchainVKeySelector.toLowerCase(),
                );
            }
        });
    }
});
