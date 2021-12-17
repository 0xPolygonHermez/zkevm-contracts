const { Scalar } = require('ffjavascript');

const Constants = require('./constants');
const Executor = require('./executor');
const { getValue, setValue } = require('./helpers/db-key-value-utils');

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, arity, seqChainID, poseidon, sequencerAddress) {
        this.db = db;
        this.lastBatch = lastBatch || Scalar.e(0);
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.stateRoot = stateRoot || this.F.e(0);

        this.arity = arity;
        this.seqChainID = seqChainID;
        this.sequencerAddress = sequencerAddress;
    }

    /**
     * Return a new Executor with the current RollupDb state
     * @param {Scalar} maxNTx - Maximum number of transactions
     */
    async buildBatch(localExitRoot, globalExitRoot, maxNTx = Constants.defaultMaxTx) {
        return new Executor(
            this.db,
            Scalar.add(this.lastBatch, 1),
            this.arity,
            this.poseidon,
            maxNTx,
            this.seqChainID,
            this.stateRoot,
            this.sequencerAddress,
            localExitRoot,
            globalExitRoot,
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} executor - Executor object
     */
    async consolidate(executor) {
        if (executor.batchNumber !== Scalar.add(this.lastBatch, 1)) {
            throw new Error('Updating the wrong batch');
        }

        if (!executor.builded) {
            await executor.executeTxs();
        }

        // Populate actual DB with the keys and values inserted in the batch
        await executor.tmpDB.populateSrcDb();

        await setValue(Scalar.add(Constants.DB_Batch, executor.batchNumber), this.F.toString(executor.currentRoot), this.db, this.F);
        await setValue(Constants.DB_LastBatch, executor.batchNumber, this.db, this.F);

        this.lastBatch = executor.batchNumber;
        this.stateRoot = executor.currentRoot;
    }

    static async newZkEVM(db, seqChainID, arity, poseidon, sequencerAddress, root) {
        const { F } = poseidon;
        try {
            const lastBatch = await getValue(Constants.DB_LastBatch, db, F);
            const stateRoot = await getValue(Scalar.add(Constants.DB_Batch, lastBatch), db, F);
            const dBSeqChainID = Scalar.toNumber(await getValue(Constants.DB_SeqChainID, db, F));
            const dBArity = Scalar.toNumber(await getValue(Constants.DB_Arity, db, F));

            return new ZkEVMDB(db, lastBatch, stateRoot, dBArity, dBSeqChainID, poseidon, sequencerAddress);
        } catch (error) {
            const setseqChainID = seqChainID || Constants.defaultSeqChainID;
            const setArity = arity || Constants.defaultArity;

            await setValue(Constants.DB_SeqChainID, setseqChainID, db, F);
            await setValue(Constants.DB_Arity, setArity, db, F);

            return new ZkEVMDB(db, Scalar.e(0), root, setArity, setseqChainID, poseidon, sequencerAddress);
        }
    }
}

module.exports = ZkEVMDB;
