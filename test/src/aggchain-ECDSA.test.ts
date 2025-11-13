import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import fs = require('fs');
import path = require('path');
import { Address, AggchainECDSA } from '../../typechain-types';

import dataECDSA from '../test-vectors/aggchainECDSA/aggchainECDSA.json';
import * as utilsECDSA from '../../src/utils-aggchain-ECDSA';
import * as utilsCommon from '../../src/utils-common-aggchain';

const pathTestVector = path.join(__dirname, '../test-vectors/aggchainECDSA/aggchainECDSA.json');

// SIGNERS
let admin: any;
let aggchainManager: any;
let vKeyManager: any;
let aggchainECDSAContract: AggchainECDSA;

const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
const aggLayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

describe('Test vectors aggchain ECDSA', () => {
    upgrades.silenceWarnings();
    const update = process.env.UPDATE === 'true';

    for (let i = 0; i < dataECDSA.length; i++) {
        let initializeBytesAggchainV0: string;
        let initializeBytesAggchainV1: string;
        let aggchainParams: string;
        let aggchainVKeySelector: string;
        let aggchainData: string;
        let aggchainHash: string;

        const data = dataECDSA[i].input;

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin, aggchainManager] = await ethers.getSigners();

            aggchainVKeySelector = data.initAggchainVKeySelector;

            // check final aggchainSelector
            expect(aggchainVKeySelector).to.be.equal(data.initAggchainVKeySelector);

            // deploy aggchain
            // create aggchainECDSA implementation
            const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
            aggchainECDSAContract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
                initializer: false,
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
            });
            await aggchainECDSAContract.waitForDeployment();

            // encode initializeBytesAggchain
            initializeBytesAggchainV0 = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
                data.useDefaultGateway,
                data.initOwnedAggchainVKey,
                data.initAggchainVKeySelector,
                vKeyManager.address,
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName,
            );

            // initialize using rollup manager & initializeBytesAggchain
            await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainECDSAContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

            await aggchainECDSAContract.connect(aggchainManager).initialize(initializeBytesAggchainV0, { gasPrice: 0 });

            // check initializeBytesAggchain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
                data.initOwnedAggchainVKey,
            );

            // encode aggchainParams
            aggchainParams = utilsECDSA.computeHashAggchainParamsECDSA(data.trustedSequencer);

            // if useDefaultGateway is true, disable it
            if (data.useDefaultGateway) {
                await expect(aggchainECDSAContract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
                    aggchainECDSAContract,
                    'DisableUseDefaultGatewayFlag',
                );
            }

            // encode aggchainData
            aggchainData = utilsECDSA.encodeAggchainDataECDSA(data.initAggchainVKeySelector, data.newStateRoot);
            // get aggchainHash
            aggchainHash = utilsCommon.computeAggchainHash(
                utilsCommon.CONSENSUS_TYPE.GENERIC,
                data.initOwnedAggchainVKey,
                aggchainParams,
            );
            // get aggchainHash from contract
            // Check InvalidAggchainDataLength
            await expect(aggchainECDSAContract.getAggchainHash('0x', { gasPrice: 0 })).to.be.revertedWithCustomError(
                aggchainECDSAContract,
                'InvalidAggchainDataLength',
            );

            const aggchainHashContract = await aggchainECDSAContract.getAggchainHash(aggchainData, {
                gasPrice: 0,
            });
            // check aggchainHash === aggchainHash from contract
            // with this check we can be sure that the aggchainParams & aggchainHash works correctly
            expect(aggchainHash).to.be.equal(aggchainHashContract);

            // reinitialize using rollup manager & initializeBytesAggchainECDSAv1

            // deploy polygonPessimisticConsensus
            // create polygonPessimisticConsensus implementation
            const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
            let ppConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
                initializer: false,
                constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });
            await ppConsensusContract.waitForDeployment();

            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initialize(
                    admin.address,
                    data.trustedSequencer,
                    0,
                    data.gasTokenAddress,
                    data.trustedSequencerURL,
                    data.networkName,
                    {
                        gasPrice: 0,
                    },
                );

            // upgrade to aggchainECDSA (reinitialize)
            ppConsensusContract = await upgrades.upgradeProxy(ppConsensusContract.target, aggchainECDSAFactory, {
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: [
                    'constructor',
                    'state-variable-immutable',
                    'enum-definition',
                    'struct-definition',
                    'missing-initializer',
                    'missing-initializer-call',
                ],
            });

            // encode initializeBytesAggchain version 1
            initializeBytesAggchainV1 = utilsECDSA.encodeInitializeBytesAggchainECDSAv1(
                data.useDefaultGateway,
                data.initOwnedAggchainVKey,
                data.initAggchainVKeySelector,
                vKeyManager.address,
            );

            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
            await ppConsensusContract.connect(aggchainManager).initialize(initializeBytesAggchainV1, { gasPrice: 0 });

            // check initializeBytesAggchain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
                data.initOwnedAggchainVKey,
            );

            // add data to test-vector
            if (update) {
                dataECDSA[i].id = i;
                dataECDSA[i].output = {};
                dataECDSA[i].output.vKeyManager = vKeyManager.address;
                dataECDSA[i].output.admin = admin.address;
                dataECDSA[i].output.initializeBytesAggchainV0 = initializeBytesAggchainV0;
                dataECDSA[i].output.initializeBytesAggchainV1 = initializeBytesAggchainV1;
                dataECDSA[i].output.aggchainData = aggchainData;
                dataECDSA[i].output.aggchainVKeySelector = aggchainVKeySelector;
                dataECDSA[i].output.aggchainHash = aggchainHash;
                dataECDSA[i].output.aggchainParams = aggchainParams;

                // eslint-disable-next-line no-console
                console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
                await fs.writeFileSync(pathTestVector, JSON.stringify(dataECDSA, null, 2));
            } else {
                expect(dataECDSA[i].output.vKeyManager).to.be.equal(vKeyManager.address);
                expect(dataECDSA[i].output.admin).to.be.equal(admin.address);
                expect(dataECDSA[i].output.initializeBytesAggchainV0).to.be.equal(initializeBytesAggchainV0);
                expect(dataECDSA[i].output.initializeBytesAggchainV1).to.be.equal(initializeBytesAggchainV1);
                expect(dataECDSA[i].output.aggchainData).to.be.deep.equal(aggchainData);
                expect(dataECDSA[i].output.aggchainVKeySelector).to.be.deep.equal(aggchainVKeySelector);
                expect(dataECDSA[i].output.aggchainHash).to.be.deep.equal(aggchainHash);
                expect(dataECDSA[i].output.aggchainParams).to.be.equal(aggchainParams);
            }
        });
    }
});
