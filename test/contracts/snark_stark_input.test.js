const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateStarkInput } = contractUtils;

describe('Proof of efficiency snark stark input test', () => {
    let proofOfEfficiencyContract;
    const genesisRoot = ethers.constants.HashZero;

    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';

    beforeEach('Deploy contract', async () => {
        // load signers
        const [randomSigner] = await ethers.getSigners();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await upgrades.deployProxy(
            ProofOfEfficiencyFactory,
            [
                randomSigner.address,
                randomSigner.address,
                randomSigner.address,
                genesisRoot,
                randomSigner.address,
                allowForcebatches,
                urlSequencer,
                chainID,
                networkName,
            ],
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

        const expectedSnarkInput = '10255818422543031151914919891467894274520264482506602925880735498991910195507';
        const expectedStarkInput = '0x55f4c373d62dd577ef6160a1980130db83f0686dab8afe5e32e641ca6abeab4c';
        // Compute Js input
        const inputStarkSC = await proofOfEfficiencyContract.calculateStarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            sequencedTimestmap,
            chainID,
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
            chainID,
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
            chainID,
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
            chainID,
            aggregatorAddress,
        );

        expect(inputSnarkSC).to.be.equal(inputSnarkJS);
        expect(inputSnarkSC).to.be.equal(expectedSnarkInput);
    });
});
