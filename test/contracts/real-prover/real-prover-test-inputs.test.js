const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { generateSolidityInputs } = contractUtils;

const proofJson = require('./test-inputs/proof.json');
const publicJson = require('./test-inputs/public.json');

describe('Real prover test', () => {
    let verifierContract;

    beforeEach('Deploy contract', async () => {
        // deploy mock verifier
        const VerifierFactory = await ethers.getContractFactory(
            'Verifier',
        );
        verifierContract = await VerifierFactory.deploy();
    });

    it('Test real prover', async () => {
        const {
            proofA, proofB, proofC, input,
        } = generateSolidityInputs(proofJson, publicJson);

        expect(await verifierContract.verifyProof(
            proofA,
            proofB,
            proofC,
            input,
        )).to.be.equal(true);
    });
});
