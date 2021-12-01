const { Scalar } = require('ffjavascript');

/**
 * Set value using the memDB as a key value DB
 * @param {String | Scalar} key - key in scalar or hex representation
 * @param {String | Scalar} value - value in scalar or hex representation
 * @param {Object} db - mem DB
 * @param {Object} F - poseidon F
 */
async function setValue(key, value, db, F) {
    await db.set(F.e(Scalar.e(key)), [F.e(Scalar.e(value))]);
}

/**
 * Get value using the memDB as a key value DB
 * @param {String | Scalar} key - key in scalar or hex representationç
 * @param {Object} db - mem DB
 * @param {Object} F - poseidon F
 * @returns {Scalar} - value
 */
async function getValue(key, db, F) {
    const arrayValues = await db.get(F.e(Scalar.e(key)));
    return Scalar.e(F.toString(arrayValues[0]));
}

module.exports = {
    setValue,
    getValue,
};
