/* eslint-disable no-await-in-loop */
class TmpDB {
    constructor(F, srcDb) {
        this.srcDb = srcDb;
        this.F = F;
        this.inserts = {};
    }

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

    async set(key, value) {
        const keyS = this.F.toString(key, 16).padStart(64, '0');
        this.inserts[keyS] = [];
        for (let i = 0; i < value.length; i++) this.inserts[keyS].push(this.F.toString(value[i], 16).padStart(64, '0'));
    }

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
