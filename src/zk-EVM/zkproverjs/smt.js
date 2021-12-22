const { Scalar } = require('ffjavascript');
const { scalar2fea, fea2scalar } = require('./utils.js');

class SMT {
    constructor(db, arity, hash, F) {
        this.db = db;
        this.arity = arity;
        this.hash = hash;
        this.F = F;
        this.mask = Scalar.e((1 << this.arity) - 1);

        this.maxLevels = 160 / this.arity;
    }

    async set(oldRoot, key, value) {
        const self = this;
        const { F } = self;
        let r = oldRoot;

        const keys = self.splitKey(key);
        let level = 0;

        let accKey = Scalar.e(0);
        let lastAccKey = Scalar.e(0);
        let foundKey;
        let siblings = [];

        let insKey;
        let insValue;
        let oldValue = Scalar.e(0);
        let mode;
        let newRoot = oldRoot;
        let isOld0 = true;

        while ((!F.isZero(r)) && (!foundKey)) {
            siblings[level] = await self.db.get(r);
            if (F.eq(siblings[level][0], F.one)) {
                foundKey = F.add(
                    F.e(accKey),
                    F.mul(
                        siblings[level][1],
                        F.e(Scalar.shl(Scalar.e(1), level * self.arity)),
                    ),
                );
            } else {
                r = siblings[level][keys[level]];
                lastAccKey = accKey;
                accKey = Scalar.add(accKey, Scalar.shl(keys[level], level * self.arity));
                level++;
            }
        }

        level--;
        accKey = lastAccKey;

        if (!Scalar.isZero(value)) {
            const v = scalar2fea(F, value);
            if (foundKey) {
                if (F.eq(key, foundKey)) { // Update
                    mode = 'update';
                    const newLeaf = [];
                    newLeaf[0] = F.one;
                    newLeaf[1] = siblings[level + 1][1];
                    oldValue = fea2scalar(F, siblings[level + 1].slice(2, 6));
                    newLeaf[2] = v[0];
                    newLeaf[3] = v[1];
                    newLeaf[4] = v[2];
                    newLeaf[5] = v[3];
                    while (newLeaf.length < (1 << self.arity)) newLeaf.push(F.zero);
                    const newLeafHash = await hashSave(newLeaf);
                    if (level >= 0) {
                        siblings[level][keys[level]] = newLeafHash;
                    } else {
                        newRoot = newLeafHash;
                    }
                } else { // insert with foundKey
                    mode = 'insertFound';
                    const node = [];
                    let level2 = level + 1;
                    const foundKeys = self.splitKey(foundKey);
                    while (keys[level2] == foundKeys[level2]) level2++;

                    const oldLeaf = [];
                    oldLeaf[0] = F.one;
                    oldLeaf[1] = F.e(Scalar.shr(Scalar.e(F.toObject(foundKey)), (level2 + 1) * self.arity));
                    oldLeaf[2] = siblings[level + 1][2];
                    oldLeaf[3] = siblings[level + 1][3];
                    oldLeaf[4] = siblings[level + 1][4];
                    oldLeaf[5] = siblings[level + 1][5];

                    insKey = foundKey;
                    insValue = fea2scalar(F, siblings[level + 1].slice(2, 6));
                    isOld0 = false;
                    while (oldLeaf.length < (1 << self.arity)) oldLeaf.push(F.zero);
                    const oldLeafHash = await hashSave(oldLeaf);

                    const newLeaf = [];
                    newLeaf[0] = F.one;
                    newLeaf[1] = F.e(Scalar.shr(Scalar.e(F.toObject(key)), (level2 + 1) * self.arity));
                    newLeaf[2] = v[0];
                    newLeaf[3] = v[1];
                    newLeaf[4] = v[2];
                    newLeaf[5] = v[3];
                    while (newLeaf.length < (1 << self.arity)) newLeaf.push(F.zero);
                    const newLeafHash = await hashSave(newLeaf);

                    for (let i = 0; i < (1 << self.arity); i++) node[i] = F.zero;
                    node[keys[level2]] = newLeafHash;
                    node[foundKeys[level2]] = oldLeafHash;

                    let r2 = await hashSave(node);
                    level2--;

                    while (level2 != level) {
                        for (let i = 0; i < (1 << self.arity); i++) node[i] = F.zero;
                        node[keys[level2]] = r2;

                        r2 = await hashSave(node);
                        level2--;
                    }

                    if (level >= 0) {
                        siblings[level][keys[level]] = r2;
                    } else {
                        newRoot = r2;
                    }
                }
            } else { // insert without foundKey
                mode = 'insertNotFound';
                const newLeaf = [];
                newLeaf[0] = F.one;
                newLeaf[1] = F.e(Scalar.shr(Scalar.e(F.toObject(key)), (level + 1) * self.arity));
                newLeaf[2] = v[0];
                newLeaf[3] = v[1];
                newLeaf[4] = v[2];
                newLeaf[5] = v[3];
                while (newLeaf.length < (1 << self.arity)) newLeaf.push(F.zero);
                const newLeafHash = await hashSave(newLeaf);
                if (level >= 0) {
                    siblings[level][keys[level]] = newLeafHash;
                } else {
                    newRoot = newLeafHash;
                }
            }
        } else if ((foundKey) && (F.eq(key, foundKey))) { // Delete
            oldValue = fea2scalar(F, siblings[level + 1].slice(2, 6));
            if (level >= 0) {
                siblings[level][keys[level]] = F.zero;

                let uKey = getUniqueSibling(siblings[level]);

                if (uKey >= 0) {
                    mode = 'deleteFound';
                    siblings[level + 1] = await self.db.get(siblings[level][uKey]);

                    insKey = F.add(
                        F.e(Scalar.add(accKey, Scalar.shl(uKey, level * self.arity))),
                        F.mul(
                            siblings[level + 1][1],
                            F.e(Scalar.shl(Scalar.e(1), (level + 1) * self.arity)),
                        ),
                    );
                    const insV = siblings[level + 1].slice(2, 6);
                    insValue = fea2scalar(F, insV);
                    isOld0 = false;

                    while ((uKey >= 0) && (level >= 0)) {
                        level--;
                        if (level >= 0) {
                            uKey = getUniqueSibling(siblings[level]);
                        }
                    }

                    const oldLeaf = [];
                    oldLeaf[0] = F.one;
                    oldLeaf[1] = F.e(Scalar.shr(Scalar.e(F.toObject(insKey)), (level + 1) * self.arity));
                    oldLeaf[2] = insV[0];
                    oldLeaf[3] = insV[1];
                    oldLeaf[4] = insV[2];
                    oldLeaf[5] = insV[3];
                    while (oldLeaf.length < (1 << self.arity)) oldLeaf.push(F.zero);
                    const oldLeafHash = await hashSave(oldLeaf);

                    if (level >= 0) {
                        siblings[level][keys[level]] = oldLeafHash;
                    } else {
                        newRoot = oldLeafHash;
                    }
                } else {
                    mode = 'deleteNotFound';
                }
            } else {
                mode = 'deleteLast';
                newRoot = F.zero;
            }
        } else {
            mode = 'zeroToZero';
        }

        siblings = siblings.slice(0, level + 1);

        while (level >= 0) {
            newRoot = await hashSave(siblings[level]);
            level--;
            if (level >= 0) siblings[level][keys[level]] = newRoot;
        }

        return {
            oldRoot,
            newRoot,
            key,
            siblings,
            insKey,
            insValue,
            isOld0,
            oldValue,
            newValue: value,
            mode,
        };

        function getUniqueSibling(a) {
            let nFound = 0;
            let fnd;
            for (let i = 0; i < a.length; i++) {
                if (!F.isZero(a[i])) {
                    nFound++;
                    fnd = i;
                }
            }
            if (nFound == 1) return fnd;
            return -1;
        }

        async function hashSave(a) {
            const h = self.hash(a);
            await self.db.set(h, a);
            return h;
        }
    }

    async get(root, key) {
        const self = this;
        const { F } = this;

        let r = root;

        const keys = self.splitKey(key);
        let level = 0;

        let accKey = Scalar.e(0);
        let lastAccKey = Scalar.e(0);
        let foundKey;
        let siblings = [];

        let insKey = F.zero;
        let insValue = Scalar.e(0);

        let value = Scalar.e(0);
        let isOld0 = true;

        while ((!F.isZero(r)) && (!foundKey)) {
            siblings[level] = await self.db.get(r);
            if (F.eq(siblings[level][0], F.one)) {
                foundKey = F.add(
                    F.e(accKey),
                    F.mul(
                        siblings[level][1],
                        F.e(Scalar.shl(Scalar.e(1), level * self.arity)),
                    ),
                );
            } else {
                r = siblings[level][keys[level]];
                lastAccKey = accKey;
                accKey = Scalar.add(accKey, Scalar.shl(keys[level], level * self.arity));
                level++;
            }
        }

        level--;
        accKey = lastAccKey;

        if (foundKey) {
            if (F.eq(key, foundKey)) {
                value = fea2scalar(F, siblings[level + 1].slice(2, 6));
            } else {
                insKey = foundKey;
                insValue = fea2scalar(F, siblings[level + 1].slice(2, 6));
                isOld0 = false;
            }
        }

        siblings = siblings.slice(0, level + 1);

        return {
            root,
            key,
            value,
            siblings,
            isOld0,
            insKey,
            insValue,
        };
    }

    splitKey(k) {
        const self = this;
        const res = [];
        let auxk = Scalar.e(self.F.toObject(k));
        for (let i = 0; i < self.maxLevels; i++) {
            res.push(Scalar.toNumber(Scalar.band(auxk, self.mask)));
            auxk = Scalar.shr(auxk, self.arity);
        }
        return res;
    }
}

module.exports = SMT;
