const { expect } = require("chai");
const { ethers } = require("hardhat");
const poeABI = require("../../artifacts/contracts/ProofOfEfficiency.sol/ProofOfEfficiency.json").abi;
const helpers = require("../helpers")

module.exports = class SequencerInterface {
    constructor(sequencer, proofOfEfficiencyContract, sequencerURL) {
        this.sequencer = sequencer;
        this.sequencerURL = sequencerURL;
        this.proofOfEfficiencyContract = proofOfEfficiencyContract;
        this.txs = [];
    }

    /**
     * Add transaction to send
     * @param {Object} tx = {nonce, gasprice, gasLimit, to, value, data, chainId, v, r, s}
     */
    async addTx(tx) {
        this.txs.push(tx);
    }

    /**
     * Register sequencer to proof of efficiency contract
     */
    async registerSequencer() {
        const tx = await this.proofOfEfficiencyContract.connect(this.sequencer).registerSequencer(this.sequencerURL);
        await tx.wait();
    }

    /**
     * Send batch to proof of efficiency contract
     * @param {Number} maticAmount Max amount of MATIC tokens that the sequencer is willing to pay
     */
    async sendBatch(maticAmount) {
        let l2txsData = "0x";
        for (let i = 0; i < this.txs.length; i++) {
            const txData = helpers.encodeSignedTx(this.txs[i]).slice(2);
            l2txsData = l2txsData + txData;
        }
        const tx = await this.proofOfEfficiencyContract.connect(this.sequencer).sendBatch(l2txsData, maticAmount);
        await tx.wait();
        this.txs = [];
    }
}