const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateStarkInput } = contractUtils;

describe('Proof of efficiency', () => {
    let proofOfEfficiencyContract;
    const genesisRoot = ethers.constants.HashZero;

    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';

    beforeEach('Deploy contract', async () => {
        // load signers
        const [randomSigner] = await ethers.getSigners();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            randomSigner.address,
            randomSigner.address,
            randomSigner.address,
            genesisRoot,
            randomSigner.address,
            allowForcebatches,
            urlSequencer,
        );
        await proofOfEfficiencyContract.deployed();
    });

    it('Check commonjs unit test', async () => {
        // Unit test taken from https://github.com/0xPolygonHermez/zkevm-commonjs/blob/main/test/contract-utils.test.js#L16
        const currentStateRoot = '0x2dc4db4293af236cb329700be43f08ace740a05088f8c7654736871709687e90';
        const currentLocalExitRoot = '0x17c04c3760510b48c6012742c540a81aba4bca2f78b9d14bfd2f123e2e53ea3e';
        const newStateRoot = '0xbff23fc2c168c033aaac77503ce18f958e9689d5cdaebb88c5524ce5c0319de3';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const batchHashData = '0x9370689d3c20a5a4739f902a31e2ea20c7d7be121a0fc19468a2e1b5d87f4111';
        const numBatch = 1;
        const sequencedTimestmap = 1944498031;
        const aggregatorAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        const expectedSnarkInput = '14918438705377636817563619860509474434188349281706594260803853913155748736842';
        const expectedStarkInput = '0xd072c5e95f2a1aa8dee6f1e0667f72f9e66ed47f7ff5f5e3ad6f504379c73c26';
        // Compute Js input
        const inputStarkSC = await proofOfEfficiencyContract.calculateStarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
        );

        // Compute Js input
        const inputStarkJS = calculateStarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
        );

        expect(inputStarkSC).to.be.equal(inputStarkJS);
        expect(inputStarkSC).to.be.equal(expectedStarkInput);

        // Check snark input
        const inputSnarkSC = await proofOfEfficiencyContract.calculateSnarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
            aggregatorAddress,
        );

        const inputSnarkJS = await calculateSnarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
            aggregatorAddress,
        );

        expect(inputSnarkSC).to.be.equal(inputSnarkJS);
        expect(inputSnarkSC).to.be.equal(expectedSnarkInput);
    });
});
