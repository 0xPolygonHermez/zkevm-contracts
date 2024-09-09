const { ethers } = require('hardhat');

const input = require('./test-inputs/input.json');

describe('Real prover inputs test', () => {
    let verifierContract;

    beforeEach('Deploy contract', async () => {
        // deploy mock verifier
        const VerifierFactory = await ethers.getContractFactory(
            'SP1Verifier',
        );
        verifierContract = await VerifierFactory.deploy();
    });

    it('Test real prover', async () => {
        // If the verification fails, it reverts and throws error, else it returns nothing
        await verifierContract.verifyProof(
            input.vkey,
            input['public-values'],
            input.proof,
        );
    });
});
