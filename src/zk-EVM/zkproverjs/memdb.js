const { Scalar } = require('ffjavascript');

class MemDB {
    constructor(F, db) {
        if (db) {
            this.db = db;
        } else {
            this.db = {};
        }
        this.F = F;
    }

    async get(key) {
        const keyS = this.F.toString(key, 16).padStart(64, '0');
        const res = [];
        for (let i = 0; i < this.db[keyS].length; i++) {
            res.push(this.F.e(`0x${this.db[keyS][i]}`));
        }
        if (this.capturing) {
            this.capturing[keyS] = this.db[keyS];
        }
        return res;
    }

    async set(key, value) {
        const keyS = this.F.toString(key, 16).padStart(64, '0');
        this.db[keyS] = [];
        for (let i = 0; i < value.length; i++) this.db[keyS].push(this.F.toString(value[i], 16).padStart(64, '0'));
    }

    startCapture() {
        this.capturing = {};
    }

    endCapture() {
        const res = this.capturing;
        delete this.capturing;
        return res;
    }
}

module.exports = MemDB;
