const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { generateSolidityInputs } = contractUtils;

const proofJson = require('./test-inputs/proof.json');
const input = require('./test-inputs/public.json');

describe('Real prover inputs test', () => {
    let verifierContract;

    beforeEach('Deploy contract', async () => {
        // deploy mock verifier
        const VerifierFactory = await ethers.getContractFactory(
            'FflonkVerifier',
        );
        verifierContract = await VerifierFactory.deploy();
    });

    it('Test real prover', async () => {
        const proof = generateSolidityInputs(proofJson);

        expect(await verifierContract.verifyProof(
            proof,
            input,
        )).to.be.equal(true);
    });
});
