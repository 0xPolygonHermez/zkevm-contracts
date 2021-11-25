const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const helpers = require('../../js/helpers');

describe('toHexString', () => {
    it('Number to hexString', async () => {
        const number = 20000;
        const hexNumber = '0x4E20';
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it('String without 0x', async () => {
        const number = '30D40';
        const hexNumber = '0x030D40';
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it('String with 0x', async () => {
        const number = '0x30D40';
        const hexNumber = '0x030D40';
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it('String 0x', async () => {
        const number = '0x';
        const hexNumber = '0x';
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it("String ''", async () => {
        const number = '';
        const hexNumber = '0x';
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
});

describe('encodeTx', () => {
    it('encodeTx', async () => {
        const tx = {
            to: '0x3535353535353535353535353535353535353535',
            nonce: 9,
            data: '',
            value: '0xDE0B6B3A7640000',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        const signingData = helpers.encodeTx(tx);
        const signingDataEIP155 = '0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080';
        expect(signingData.toLocaleLowerCase()).to.be.equal(signingDataEIP155.toLocaleLowerCase());
    });

    it('encodeSignedTx A', async () => {
        const tx = {
            nonce: 9,
            gasPrice: '0x04a817c800',
            gasLimit: '0x5208',
            to: '0x3535353535353535353535353535353535353535',
            value: '0x0de0b6b3a7640000',
            data: '0x',
            chainId: 1,
            v: 37,
            r: '0x28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276',
            s: '0x67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',
            from: '0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F',
            hash: '0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788',
            type: null,
        };
        const encodedTx = helpers.encodeSignedTx(tx);
        const encodedTxEIP155 = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(encodedTxEIP155.toLocaleLowerCase());
    });

    it('encodeSignedTx B', async () => {
        const tx = {
            to: '0x3535353535353535353535353535353535353535',
            nonce: 9,
            data: '',
            value: '0xDE0B6B3A7640000',
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        const wallet = new ethers.Wallet('0x4646464646464646464646464646464646464646464646464646464646464646');
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        const encodedTxEIP155 = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(encodedTxEIP155.toLocaleLowerCase());
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
    });

    let testVector;

    it('load test vectors', async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/helpers.json')));
    });

    it('encodeSignedTx and test-vectors check', async () => {
        for (let i = 0; i < testVector.length; i++) {
            const wallet = new ethers.Wallet(testVector[i].privateKey);
            // eslint-disable-next-line no-await-in-loop
            const txSigned = await wallet.signTransaction(testVector[i].tx);
            const txSignedStruct = ethers.utils.parseTransaction(txSigned);
            const encodedTx = helpers.encodeSignedTx(txSignedStruct);
            expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
            expect(testVector[i].calldata).to.be.equal(encodedTx);

            const decodedTx = ethers.utils.RLP.decode(testVector[i].calldata);
            expect(testVector[i].tx.nonce.toString()).to.be.equal(Scalar.fromString(decodedTx[0], 16).toString());
            expect(testVector[i].tx.gasPrice.toString()).to.be.equal(Scalar.fromString(decodedTx[1], 16).toString());
            expect(testVector[i].tx.gasLimit.toString()).to.be.equal(Scalar.fromString(decodedTx[2], 16).toString());
            expect(testVector[i].tx.to).to.be.equal(decodedTx[3]);
            expect(Scalar.fromString(testVector[i].tx.value)).to.be.equal(Scalar.fromString(decodedTx[4]));
            if (testVector[i].tx.data === '') {
                expect('0x').to.be.equal(decodedTx[5]);
            } else {
                expect(Scalar.fromString(testVector[i].tx.data)).to.be.equal(Scalar.fromString(decodedTx[5]));
            }
            const hash = ethers.utils.keccak256(helpers.encodeTx(testVector[i].tx));
            const from = helpers.returnFrom(hash, {
                r: txSignedStruct.r,
                s: txSignedStruct.s,
                v: txSignedStruct.v,
            });
            expect(testVector[i].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
        }
    });
});
