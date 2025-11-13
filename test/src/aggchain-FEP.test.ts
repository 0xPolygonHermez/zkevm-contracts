import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import fs = require('fs');
import path = require('path');
import { Address, AggchainFEP } from '../../typechain-types';

import dataFEP from '../test-vectors/aggchainFEP/aggchainFEP.json';
import * as utilsFEP from '../../src/utils-aggchain-FEP';
import * as utilsCommon from '../../src/utils-common-aggchain';

const pathTestVector = path.join(__dirname, '../test-vectors/aggchainFEP/aggchainFEP.json');

// SIGNERS
let admin: any;
let aggchainManager: any;
let vKeyManager: any;
let aggchainFEPContract: AggchainFEP;

const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
const aggLayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

describe('Test vectors aggchain FEP', () => {
    upgrades.silenceWarnings();
    const update = process.env.UPDATE === 'true';

    for (let i = 0; i < dataFEP.length; i++) {
        let initializeBytesAggchainV0: string;
        let initializeBytesAggchainV1: string;
        let aggchainParams: string;
        let aggchainVKeySelector: string;
        let aggchainData: string;
        let aggchainHash: string;

        const data = dataFEP[i].input;

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin, aggchainManager] = await ethers.getSigners();

            aggchainVKeySelector = data.initAggchainVKeySelector;

            // check final aggchainSelector
            expect(aggchainVKeySelector).to.be.equal(data.initAggchainVKeySelector);

            // deploy aggchain
            // create aggchainFEP implementation
            const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
            aggchainFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
            await aggchainFEPContract.waitForDeployment();

            // encode initializeBytesAggchain
            initializeBytesAggchainV0 = utilsFEP.encodeInitializeBytesAggchainFEPv0(
                data.initParams,
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
            await aggchainFEPContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

            await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchainV0, { gasPrice: 0 });

            // check initializeBytesAggchain
            expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
            expect(await aggchainFEPContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainFEPContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
                data.initOwnedAggchainVKey,
            );

            // encode aggchainParams
            aggchainParams = utilsFEP.computeHashAggchainParamsFEP(
                data.initParams.startingOutputRoot,
                data.newStateRoot,
                data.newl2BlockNumber,
                data.initParams.rollupConfigHash,
                data.optimisticMode,
                data.trustedSequencer,
                data.initParams.rangeVkeyCommitment,
                data.initParams.aggregationVkey,
            );

            // if useDefaultGateway is true, disable it
            if (data.useDefaultGateway) {
                await expect(aggchainFEPContract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
                    aggchainFEPContract,
                    'DisableUseDefaultGatewayFlag',
                );
            }

            // encode aggchainData
            aggchainData = utilsFEP.encodeAggchainDataFEP(
                data.initAggchainVKeySelector,
                data.newStateRoot,
                data.newl2BlockNumber,
            );

            // get aggchainHash
            aggchainHash = utilsCommon.computeAggchainHash(
                utilsCommon.CONSENSUS_TYPE.GENERIC,
                data.initOwnedAggchainVKey,
                aggchainParams,
            );

            // get aggchainHash from contract
            // Check InvalidAggchainDataLength
            await expect(aggchainFEPContract.getAggchainHash('0x', { gasPrice: 0 })).to.be.revertedWithCustomError(
                aggchainFEPContract,
                'InvalidAggchainDataLength',
            );

            const aggchainHashContract = await aggchainFEPContract.getAggchainHash(aggchainData, {
                gasPrice: 0,
            });
            // check aggchainHash === aggchainHash from contract
            // with this check we can be sure that the aggchainParams & aggchainHash works correctly
            expect(aggchainHash).to.be.equal(aggchainHashContract);

            // reinitialize using rollup manager & initializeBytesAggchainFEPv1

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

            // upgrade to aggchainFEP (reinitialize)
            ppConsensusContract = await upgrades.upgradeProxy(ppConsensusContract.target, aggchainFEPFactory, {
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
            initializeBytesAggchainV1 = utilsFEP.encodeInitializeBytesAggchainFEPv1(
                data.initParams,
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
            expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
            expect(await aggchainFEPContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainFEPContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
                data.initOwnedAggchainVKey,
            );

            // add data to test-vector
            if (update) {
                dataFEP[i].id = i;
                dataFEP[i].output = {};
                dataFEP[i].output.vKeyManager = vKeyManager.address;
                dataFEP[i].output.admin = admin.address;
                dataFEP[i].output.initializeBytesAggchainV0 = initializeBytesAggchainV0;
                dataFEP[i].output.initializeBytesAggchainV1 = initializeBytesAggchainV1;
                dataFEP[i].output.aggchainData = aggchainData;
                dataFEP[i].output.aggchainVKeySelector = aggchainVKeySelector;
                dataFEP[i].output.aggchainHash = aggchainHash;
                dataFEP[i].output.aggchainParams = aggchainParams;

                // eslint-disable-next-line no-console
                console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
                await fs.writeFileSync(pathTestVector, JSON.stringify(dataFEP, null, 2));
            } else {
                expect(dataFEP[i].output.vKeyManager).to.be.equal(vKeyManager.address);
                expect(dataFEP[i].output.admin).to.be.equal(admin.address);
                expect(dataFEP[i].output.initializeBytesAggchainV0).to.be.equal(initializeBytesAggchainV0);
                expect(dataFEP[i].output.initializeBytesAggchainV1).to.be.equal(initializeBytesAggchainV1);
                expect(dataFEP[i].output.aggchainData).to.be.deep.equal(aggchainData);
                expect(dataFEP[i].output.aggchainVKeySelector).to.be.deep.equal(aggchainVKeySelector);
                expect(dataFEP[i].output.aggchainHash).to.be.deep.equal(aggchainHash);
                expect(dataFEP[i].output.aggchainParams).to.be.equal(aggchainParams);
            }
        });
    }
});
