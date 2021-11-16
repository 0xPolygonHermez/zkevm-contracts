const { expect } = require("chai");
const helpers = require("../../js/helpers");
const { ethers } = require("hardhat");

describe("toHexString", function () {
    it("Number to hexString", async () => {
        const number = 20000;
        const hexNumber = "0x4E20";
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it("String without 0x", async () => {
        const number = "30D40";
        const hexNumber = "0x030D40";
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it("String with 0x", async () => {
        const number = "0x30D40";
        const hexNumber = "0x030D40";
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it("String 0x", async () => {
        const number = "0x";
        const hexNumber = "0x";
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
    it("String ''", async () => {
        const number = "";
        const hexNumber = "0x";
        const res = helpers.toHexString(number);
        expect(res.toLocaleLowerCase()).to.be.equal(hexNumber.toLocaleLowerCase());
    });
});

describe("encondeTx", function () {
    it("encodeTx", async () => {
        const tx = {
            to: "0x3535353535353535353535353535353535353535",
            nonce: 9,
            data: '',
            value: "0xDE0B6B3A7640000",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }
        const signingData = helpers.encodeTx(tx);
        const signingDataEIP155 = "0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080";
        expect(signingData.toLocaleLowerCase()).to.be.equal(signingDataEIP155.toLocaleLowerCase());
    });

    it("encodeSignedTx A", async () => {
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
            type: null
        }
        const encodedTx = helpers.encodeSignedTx(tx);
        const encodedTxEIP155 = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(encodedTxEIP155.toLocaleLowerCase());
    });

    it("encodeSignedTx B", async () => {
        const tx = {
            to: "0x3535353535353535353535353535353535353535",
            nonce: 9,
            data: '',
            value: "0xDE0B6B3A7640000",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }

        const wallet = new ethers.Wallet("0x4646464646464646464646464646464646464646464646464646464646464646")
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        const encodedTxEIP155 = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(encodedTxEIP155.toLocaleLowerCase());
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
    });

    it("encodeSignedTx C", async () => {
        const tx = {
            to: "0x1111111111111111111111111111111111111111",
            nonce: 8,
            data: '',
            value: "0x2C68AF0BB140000",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }

        const wallet = new ethers.Wallet("0x2323232323232323232323232323232323232323232323232323232323232323")
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
    });

    it("encodeSignedTx D", async () => {
        const tx = {
            to: "0x1212121212121212121212121212121212121212",
            nonce: 2,
            data: '',
            value: "0x6FC23AC00",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }
        const wallet = new ethers.Wallet("0x1111111111111111111111111111111222222222222222222222222222222222")
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
    });
});