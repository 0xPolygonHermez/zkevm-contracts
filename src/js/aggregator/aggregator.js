const { ethers } = require('hardhat');
const { Scalar } = require('ffjavascript');

module.exports = class Aggregator {
    constructor(signer, proofOfEfficiencyContract, rollupDB) {
        this.signer = signer;
        this.proofOfEfficiencyContract = proofOfEfficiencyContract;
        this.txs = [];
        this.state = {
            newLocalExitRoot: '0x',
            newStateRoot: '0x',
        };
        this.rollupDB = rollupDB;
    }

    /**
     * Function to set the necessary transactions to calculate the new state
     * @param Array{Object} txs - transactions in the batch to verify
     */
    setTx(txs) {
        this.txs = txs;
    }

    /**
     * Function to calculate the proof
     * @returns proof (As it is an aggregator mock, it will always be 0)
     */
    async calculateProof() {
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];
        const proof = { proofA, proofB, proofC };
        return proof;
    }

    /**
     * Function to calculate and update the new state: as it is an aggregator mock, just update the balance and nonce in rollupDB
     */
    async calculateNewState() {
        const newLocalExitRoot = ethers.utils.keccak256('0x');
        this.state.newLocalExitRoot = newLocalExitRoot;
        // Only transfers
        for (let i = 0; i < this.txs.length; i++) {
            const tx = ethers.utils.parseTransaction(this.txs[i]);
            const stateFrom = this.rollupDB[`${tx.from}`];
            if (stateFrom.nonce === tx.nonce) {
                // Mock aggregator --> fees 0
                const fee = Scalar.e(0);
                const stateFromBalance = Scalar.fromString(stateFrom.balance);
                if (stateFromBalance > Scalar.add(tx.value, fee)) {
                    this.rollupDB[`${tx.from}`].nonce = this.rollupDB[`${tx.from}`].nonce + 1;
                    this.rollupDB[`${tx.from}`].balance = `0x${Scalar.sub(stateFromBalance, Scalar.add(tx.value, fee)).toString(16)}`;
                    const stateTo = this.rollupDB[`${tx.to}`];
                    this.rollupDB[`${tx.to}`].balance = `0x${Scalar.add(stateTo.balance, tx.value).toString(16)}`;
                }
            }
        }
        const newStateRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(this.rollupDB)));
        this.state.newStateRoot = newStateRoot;
    }

    /**
     * Function to verify batch: calculate new state and send transaction with new state and proof
     */
    async verifyBatch() {
        await this.calculateNewState();
        const batchNum = Scalar.e(await this.proofOfEfficiencyContract.lastBatchSent());
        const proof = await this.calculateProof();
        const tx = await this.proofOfEfficiencyContract.connect(this.signer).verifyBatch(
            this.state.newLocalExitRoot,
            this.state.newStateRoot,
            batchNum,
            proof.proofA,
            proof.proofB,
            proof.proofC,
        );
        const receipt = await tx.wait();
        this.txs = [];
        return receipt;
    }
};
