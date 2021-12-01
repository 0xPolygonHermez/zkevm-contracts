/* eslint-disable no-await-in-loop, no-console */
const { Scalar } = require('ffjavascript');

/**
 * Print the parts of the SMT that are required to store the keys
 * @param {Uint8Array} root merkle root
 * @param {Object} keys merkle tree keys
 * @param {Object} db Mem DB
 * @param {Object} smt merkle tree structure
 * @param {Object} F - poseidon F
 */
async function printSMT(root, keys, db, smt, F) {
    db.startCapture();

    for (let m = 0; m < keys.length; m++) {
        await smt.get(root, F.e(keys[m]));
    }

    const fullDb = db.endCapture();
    console.log(fullDb);
}

/**
 * Fill the dbObject with all the childs recursively
 * @param {Uint8Array} node merkle node
 * @param {Object} db Mem DB
 * @param {Object} dbObject Object that will be fullfilled
 * @param {Object} F - poseidon F
 * @returns {Array} merkle tree
 */
async function fillDBArray(node, db, dbObject, F) {
    const childArray = await db.get(node);
    const childArrayHex = childArray.map((value) => F.toString(value, 16).padStart(64, '0'));
    const nodeHex = F.toString(node, 16).padStart(64, '0');
    dbObject[nodeHex] = childArrayHex;

    if (Scalar.fromString(childArrayHex[0], 16) !== Scalar.e(1)) {
        for (let i = 0; i < childArrayHex.length; i++) {
            if (Scalar.fromString(childArrayHex[i], 16) !== Scalar.e(0)) {
                await fillDBArray(F.e(`0x${childArrayHex[i]}`), db, dbObject, F);
            }
        }
    }
}

/**
 * Return all merkle tree nodes and leafs in an Object
 * @param {Uint8Array} root merkle root
 * @param {Object} db Mem DB
 * @param {Object} F - poseidon F
 * @returns {Object} merkle tree
 */
async function getCurrentDB(root, db, F) {
    const dbObject = {};
    if (Scalar.eq(Scalar.e(F.toString(root)), Scalar.e(0))) {
        return null;
    }
    await fillDBArray(root, db, dbObject, F);

    return dbObject;
}

module.exports = {
    printSMT,
    fillDBArray,
    getCurrentDB,
};
