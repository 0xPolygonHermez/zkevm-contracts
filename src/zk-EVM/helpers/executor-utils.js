const { ethers } = require('hardhat');
const { Scalar } = require('ffjavascript');
const Constants = require('../constants');

function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = (result * 256) + data[offset + i];
    }
    return result;
}

function toHexStringRlp(num) {
    let numHex;
    if (typeof num === 'number' || typeof num === 'bigint' || typeof num === 'object') {
        numHex = Scalar.toString(Scalar.e(num), 16);
        // if it's an integer and it's value is 0, the standar is set to 0x, instead of 0x00 ( because says that always is codified in the shortest way)
        if (Scalar.e(num) === Scalar.e(0)) return '0x';
    } else if (typeof num === 'string') {
        numHex = num.startsWith('0x') ? num.slice(2) : num;
    }
    numHex = (numHex.length % 2 === 1) ? (`0x0${numHex}`) : (`0x${numHex}`);
    return numHex;
}

function rawTxToCustomRawTx(rawTx) {
    const tx = ethers.utils.parseTransaction(rawTx);
    const signData = ethers.utils.RLP.encode([
        toHexStringRlp(tx.nonce),
        toHexStringRlp(tx.gasPrice),
        toHexStringRlp(tx.gasLimit),
        toHexStringRlp(tx.to),
        toHexStringRlp(tx.value),
        toHexStringRlp(tx.data),
        toHexStringRlp(tx.chainId),
        '0x',
        '0x',
    ]);
    const r = tx.r.slice(2);
    const s = tx.s.slice(2);
    const v = (tx.v - tx.chainId * 2 - 35 + 27).toString(16).padStart(2, '0'); // 1 byte

    return signData.concat(r).concat(s).concat(v);
}

function customRawTxToRawTx(customRawTx) {
    const signatureCharacters = Constants.signatureBytes * 2;
    const rlpSignData = customRawTx.slice(0, -signatureCharacters);
    const signature = `0x${customRawTx.slice(-signatureCharacters)}`;

    const txFields = ethers.utils.RLP.decode(rlpSignData);

    const signatureParams = ethers.utils.splitSignature(signature);

    const v = ethers.utils.hexlify(signatureParams.v - 27 + txFields[6] * 2 + 35);
    const r = ethers.BigNumber.from(signatureParams.r).toHexString(); // does not have necessary 32 bytes
    const s = ethers.BigNumber.from(signatureParams.s).toHexString(); // does not have necessary 32 bytes
    const rlpFields = [...txFields.slice(0, -3), v, r, s];

    return ethers.utils.RLP.encode(rlpFields);
}

function arrayToEncodedString(rawTxs) {
    return rawTxs.reduce((previousValue, currentValue) => previousValue + currentValue.slice(2), '0x');
}

function encodedStringToArray(encodedTransactions) {
    const encodedTxBytes = ethers.utils.arrayify(encodedTransactions);
    const decodedRawTx = [];

    let offset = 0;

    while (offset < encodedTxBytes.length) {
        if (encodedTxBytes[offset] >= 0xf8) {
            const lengthLength = encodedTxBytes[offset] - 0xf7;
            if (offset + 1 + lengthLength > encodedTxBytes.length) {
                throw new Error('encodedTxBytes short segment too short');
            }

            const length = unarrayifyInteger(encodedTxBytes, offset + 1, lengthLength);
            if (offset + 1 + lengthLength + length > encodedTxBytes.length) {
                throw new Error('encodedTxBytes long segment too short');
            }

            decodedRawTx.push(ethers.utils.hexlify(
                encodedTxBytes.slice(offset, offset + 1 + lengthLength + length + Constants.signatureBytes),
            ));
            offset = offset + 1 + lengthLength + length + Constants.signatureBytes;
        } else if (encodedTxBytes[offset] >= 0xc0) {
            const length = encodedTxBytes[offset] - 0xc0;
            if (offset + 1 + length > encodedTxBytes.length) {
                throw new Error('encodedTxBytes array too short');
            }

            decodedRawTx.push(ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + 1 + length + Constants.signatureBytes)));
            offset = offset + 1 + length + Constants.signatureBytes;
        } else {
            throw new Error('Error');
        }
    }
    return decodedRawTx;
}

module.exports = {
    toHexStringRlp,
    customRawTxToRawTx,
    rawTxToCustomRawTx,
    arrayToEncodedString,
    encodedStringToArray,
};
