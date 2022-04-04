const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Scalar } = require('ffjavascript');
const output = require('./deploy_output.json');
const genesis = require("./genesis.json")

async function checkDeployment() {
    // get proof of efficiency
    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiency');
    const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.attach(output.proofOfEfficiencyAddress);

    const genesisRoot = genesis.root;

    // Check public constants
    expect(await proofOfEfficiencyContract.matic()).to.equal(output.maticTokenAddress);
    expect(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID()).to.equal(ethers.BigNumber.from(1000));
    expect(await proofOfEfficiencyContract.numSequencers()).to.equal(ethers.BigNumber.from(0));
    expect(await proofOfEfficiencyContract.lastBatchSent()).to.equal(ethers.BigNumber.from(0));
    expect(await proofOfEfficiencyContract.lastVerifiedBatch()).to.equal(ethers.BigNumber.from(0));
    expect(await proofOfEfficiencyContract.globalExitRootManager()).to.equal(output.globalExitRootManagerAddress);
    expect(await proofOfEfficiencyContract.currentStateRoot()).to.equal(genesisRoot);
    expect(await proofOfEfficiencyContract.currentLocalExitRoot()).to.equal(ethers.BigNumber.from(ethers.constants.HashZero));
    expect(await proofOfEfficiencyContract.rollupVerifier()).to.equal(output.verifierMockAddress);

    // Check struct - Sequencer
    const seqStruct = await proofOfEfficiencyContract.sequencers('0x29e5f310317B68bf949926E987Fa0Df05Ef26501');
    expect(seqStruct.sequencerURL).to.equal('');
    expect(seqStruct.chainID).to.equal(ethers.BigNumber.from(0));
    expect(seqStruct.length).to.equal(2);

    // Check struct - BatchData
    const batchStruct = await proofOfEfficiencyContract.sentBatches(1);
    expect(batchStruct.batchHashData).to.equal(ethers.constants.HashZero);
    expect(batchStruct.maticCollateral).to.equal(ethers.BigNumber.from(0));
    console.log('PoE Deployment checks succeed');
}

checkDeployment().catch((e) => {
    console.error(e);
    process.exit(1);
});
