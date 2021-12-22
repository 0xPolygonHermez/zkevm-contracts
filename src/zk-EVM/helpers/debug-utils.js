/* eslint-disable no-await-in-loop, no-console */

/**
 * Print the parts of the SMT that are required to store the keys
 * @param {Uint8Array} root merkle root
 * @param {Object} keys merkle tree keys
 * @param {Object} db Mem DB
 * @param {Object} smt merkle tree structure
 */
async function printSMT(root, keys, db, smt) {
    db.startCapture();

    for (let m = 0; m < keys.length; m++) {
        await smt.get(root, db.F.e(keys[m]));
    }

    const fullDb = db.endCapture();
    console.log(fullDb);
}

module.exports = {
    printSMT,
};
