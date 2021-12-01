const { Scalar } = require('ffjavascript');
const { buildPoseidon } = require('circomlibjs');
const utils = require('../zkproverjs/utils');
const constants = require('../constants');

let poseidon;
let F;
let isBuild = false;

async function build() {
    poseidon = await buildPoseidon();
    F = poseidon.F;
    isBuild = true;
}

/**
 * Mask and shift a Scalar
 * @param {Scalar} num - Input number
 * @param {Number} origin - Initial bit
 * @param {Number} len - Bit lenght of the mask
 * @returns {Scalar} Extracted Scalar
 */
function extract(num, origin, len) {
    const mask = Scalar.sub(Scalar.shl(1, len), 1);
    return Scalar.band(Scalar.shr(num, origin), mask);
}

/**
 * Convert to hexadecimal string padding until 256 characters
 * @param {Number | Scalar} n - Input number
 * @returns {String} String encoded as hexadecimal with 256 characters
 */
function padding256(n) {
    let nstr = Scalar.e(n).toString(16);
    while (nstr.length < 64) nstr = `0${nstr}`;
    nstr = `0x${nstr}`;
    return nstr;
}

/**
 * Leaf type 0: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 0, 0, ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyEthAddrBalance(_ethAddr, arity = 4) {
    if (!isBuild) await build();

    const constant = F.e(constants.constantBalance);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = utils.scalar2fea(F, ethAddr);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

/**
 * Leaf type 1: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 1, 0, ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyEthAddrNonce(_ethAddr, arity = 4) {
    if (!isBuild) await build();

    const constant = F.e(constants.constantNonce);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = utils.scalar2fea(F, ethAddr);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

module.exports = {
    extract,
    padding256,
    keyEthAddrBalance,
    keyEthAddrNonce,
};
