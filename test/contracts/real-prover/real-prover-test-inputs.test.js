const { expect } = require('chai');
const { ethers } = require('hardhat');

const { contractUtils } = require('@polygon-hermez/zkevm-commonjs');

const { generateSolidityInputs } = contractUtils;

const proofJson = require('./test-inputs/proof.json');
const publicJson = require('./test-inputs/public.json');

describe('Real prover test', () => {
    let deployer;
    let sequencer;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, sequencer] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierFactory = await ethers.getContractFactory(
            'Verifier',
        );
        verifierContract = await VerifierFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance,
        );
        await maticTokenContract.deployed();

        // deploy bridge
        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );
        const BridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            bridgeContract.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencer.address, ethers.utils.parseEther('100'));
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
