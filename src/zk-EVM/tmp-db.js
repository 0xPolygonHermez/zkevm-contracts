/* eslint-disable no-await-in-loop */

/**
 * This is a DB which intends to get all the state from the srcDB and
 * Store all the inserts insetead of modifying the DB
 * In case the inserts are accepted, can be populated to the srcDB
 */
class TmpDB {
    constructor(srcDb) {
        this.srcDb = srcDb;
        this.F = srcDb.F;
        this.inserts = {};
    }

    /**
     * Get function of the DB, return and array of values
     * Use the srcDb in case there's no inserts stored with this key
     * @param {Uint8Array} key - Key
     * @returns {Uint8Array Array} Array of hex values
     */
    async get(key) {
        const keyS = this.F.toString(key, 16).padStart(64, '0');
        let res = [];

        if (this.inserts[keyS]) {
            for (let i = 0; i < this.inserts[keyS].length; i++) {
                res.push(this.F.e(`0x${this.inserts[keyS][i]}`));
            }
        } else {
            res = await this.srcDb.get(key);
        }
        return res;
    }

    /**
     * Set function of the DB, all the inserts will be stored
     * In the inserts Object
     * @param {Uint8Array} key - Key
     * @param {Uint8Array} value - Value
     */
    async set(key, value) {
        const keyS = this.F.toString(key, 16).padStart(64, '0');
        this.inserts[keyS] = [];
        for (let i = 0; i < value.length; i++) this.inserts[keyS].push(this.F.toString(value[i], 16).padStart(64, '0'));
    }

    /**
     * Populate all the inserts made to the tmpDB to the srcDB
     */
    async populateSrcDb() {
        const insertKeys = Object.keys(this.inserts);
        for (let i = 0; i < insertKeys.length; i++) {
            const key = this.F.e(`0x${insertKeys[i]}`);
            const value = this.inserts[insertKeys[i]].map((element) => this.F.e(`0x${element}`));
            await this.srcDb.set(key, value);
        }
    }
}

module.exports = TmpDB;
