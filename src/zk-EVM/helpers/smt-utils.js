/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');

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
    fillDBArray,
    getCurrentDB,
};
