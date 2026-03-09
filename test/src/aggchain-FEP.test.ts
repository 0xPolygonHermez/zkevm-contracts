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
        // Direct parameter initialization replaces encoded bytes
        let aggchainParams: string;
        let aggchainVKeySelector: string;
        let aggchainData: string;
        let aggchainHash: string;

        const data = dataFEP[i].input;

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        it(`generate id: ${i}`, async function () {
            // load signers
            [admin, aggchainManager] = await ethers.getSigners();

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

            // initialize using rollup manager with direct parameters
            await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainFEPContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

            // Initialize with direct parameters instead of encoded bytes
            await aggchainFEPContract.connect(aggchainManager).initialize(
                data.initParams,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                data.useDefaultVkeys,
                data.useDefaultSigners,
                data.initOwnedAggchainVKey,
                data.initAggchainVKeySelector,
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName,
                { gasPrice: 0 },
            );

            // check initializeBytesAggchain
            expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
            expect(await aggchainFEPContract.aggchainManager()).to.be.equal(aggchainManager.address);
            expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainFEPContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
                data.initOwnedAggchainVKey,
            );

            // Get config from opSuccinctConfigs
            const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');
            const genesisConfig = await aggchainFEPContract.opSuccinctConfigs(GENESIS_CONFIG_NAME);

            // encode aggchainParams
            aggchainParams = utilsFEP.computeHashAggchainParamsFEP(
                data.initParams.startingOutputRoot,
                data.newStateRoot,
                data.newl2BlockNumber,
                genesisConfig.rollupConfigHash,
                data.optimisticMode,
                data.trustedSequencer,
                genesisConfig.rangeVkeyCommitment,
                genesisConfig.aggregationVkey,
            );

            // Test vectors now use useDefaultVkeys: false for simplicity

            // encode aggchainData
            // Use separate aggchainVKeySelector if available, otherwise use initAggchainVKeySelector
            const selectorForAggchainData = data.aggchainVKeySelector || data.initAggchainVKeySelector;
            aggchainData = utilsFEP.encodeAggchainDataFEP(
                selectorForAggchainData,
                data.newStateRoot,
                data.newl2BlockNumber,
            );

            // get aggchainHash using new base composition with empty signers
            const emptySignersHash = utilsCommon.computeSignersHash(0, []);

            // Use the owned VKey (test vectors use useDefaultVkeys: false)
            aggchainHash = utilsCommon.computeAggchainHash(
                utilsCommon.CONSENSUS_TYPE.GENERIC,
                data.initOwnedAggchainVKey,
                aggchainParams,
                emptySignersHash,
            );

            // Ensure signers hash initialized (empty)
            await aggchainFEPContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

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

            // Initialize FEP from PessimisticConsensus with direct parameters
            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

            // Cast to AggchainFEP type for the initialization
            const ppConsensusAsFEP = ppConsensusContract as unknown as AggchainFEP;
            await ppConsensusAsFEP.connect(aggchainManager).initializeFromLegacyConsensus(
                data.initParams,
                data.useDefaultVkeys,
                data.useDefaultSigners,
                data.initOwnedAggchainVKey,
                data.initAggchainVKeySelector,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                { gasPrice: 0 },
            );

            // check initializeBytesAggchain
            expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
            expect(await aggchainFEPContract.aggchainManager()).to.be.equal(aggchainManager.address);
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
                dataFEP[i].output.aggchainManager = aggchainManager.address;
                dataFEP[i].output.admin = admin.address;
                // Direct initialization is now used, no encoded bytes
                dataFEP[i].output.aggchainData = aggchainData;
                dataFEP[i].output.aggchainVKeySelector = aggchainVKeySelector;
                dataFEP[i].output.aggchainHash = aggchainHash;
                dataFEP[i].output.aggchainParams = aggchainParams;

                // eslint-disable-next-line no-console
                console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
                await fs.writeFileSync(pathTestVector, JSON.stringify(dataFEP, null, 2));
            } else {
                // Skip checking the old test vector values since the initialization format has changed
                // The test vectors would need to be regenerated with UPDATE=true
                expect(dataFEP[i].output.aggchainData).to.be.deep.equal(aggchainData);
                expect(dataFEP[i].output.aggchainVKeySelector).to.be.deep.equal(aggchainVKeySelector);
                expect(dataFEP[i].output.aggchainHash).to.be.deep.equal(aggchainHash);
                expect(dataFEP[i].output.aggchainParams).to.be.equal(aggchainParams);
            }
        });
    }
});
