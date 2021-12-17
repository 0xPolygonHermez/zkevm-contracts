const { Scalar } = require('ffjavascript');

/**
 * Set value using the memDB as a key value DB
 * @param {String | Scalar} key - key in scalar or hex representation
 * @param {String | Scalar} value - value in scalar or hex representation
 * @param {Object} db - mem DB
 */
async function setValue(key, value, db) {
    await db.set(db.F.e(Scalar.e(key)), [db.F.e(Scalar.e(value))]);
}

/**
 * Get value using the memDB as a key value DB
 * @param {String | Scalar} key - key in scalar or hex representationç
 * @param {Object} db - mem DB
+ * @returns {Scalar} - value
 */
async function getValue(key, db) {
    const arrayValues = await db.get(db.F.e(Scalar.e(key)));
    return Scalar.e(db.F.toString(arrayValues[0]));
}

module.exports = {
    setValue,
    getValue,
};
