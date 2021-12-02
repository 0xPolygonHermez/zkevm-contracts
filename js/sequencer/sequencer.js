module.exports = class Sequencer {
    constructor(signer, proofOfEfficiencyContract, sequencerURL, aggregator) {
        this.signer = signer;
        this.sequencerURL = sequencerURL;
        this.proofOfEfficiencyContract = proofOfEfficiencyContract;
        this.aggregator = aggregator;
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
        const tx = await this.proofOfEfficiencyContract.connect(this.signer).setSequencer(this.sequencerURL);
        const receipt = await tx.wait();
        return receipt;
    }

    /**
     * Send batch to proof of efficiency contract
     * @param {Number} maticAmount Max amount of MATIC tokens that the sequencer is willing to pay
     */
    async sendBatch(maticAmount) {
        let l2txsData = '0x';
        for (let i = 0; i < this.txs.length; i++) {
            const txData = this.txs[i].slice(2);
            l2txsData += txData;
        }
        const tx = await this.proofOfEfficiencyContract.connect(this.signer).sendBatch(l2txsData, maticAmount);
        const receipt = await tx.wait();
        if (this.aggregator) { this.aggregator.setTx(this.txs); }
        this.txs = [];
        return receipt;
    }
};
