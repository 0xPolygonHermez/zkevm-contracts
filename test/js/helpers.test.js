const { expect } = require("chai");
const helpers = require("../../js/helpers");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

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
        };
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
        };
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
        };
        const wallet = new ethers.Wallet("0x4646464646464646464646464646464646464646464646464646464646464646");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        const encodedTxEIP155 = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(encodedTxEIP155.toLocaleLowerCase());
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());
    });

    let testVector;

    it("load test vectors", async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(__dirname, "../test-vectors/helpers.json")))
    });

    it("encodeSignedTx and test-vector[0] check", async () => {
        const tx = {
            to: "0x1111111111111111111111111111111111111111",
            nonce: 8,
            data: '',
            value: "0x2C68AF0BB140000",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        };
        const wallet = new ethers.Wallet("0x2323232323232323232323232323232323232323232323232323232323232323");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[0].chainId).to.be.equal(tx.chainId);
        expect(testVector[0].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[0].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });

    it("encodeSignedTx and test-vector[1] check", async () => {
        const tx = {
            to: "0x1212121212121212121212121212121212121212",
            nonce: 2,
            data: '',
            value: "0x6FC23AC00",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 257,
        };
        const wallet = new ethers.Wallet("0x1111111111111111111111111111111222222222222222222222222222222222");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[1].chainId).to.be.equal(tx.chainId);
        expect(testVector[1].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[1].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });

    it("encodeSignedTx and test-vector[2] check", async () => {
        const tx = {
            to: "0x1234123412341234123412341234123412341234",
            nonce: 90,
            data: '0x1234',
            value: "0x214E8348C4F0000",
            gasLimit: 23000,
            gasPrice: 10000000000,
            chainId: 15,
        };
        const wallet = new ethers.Wallet("0x1234123412341234123412341234123412341234123412341234123412341234");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[2].chainId).to.be.equal(tx.chainId);
        expect(testVector[2].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[2].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });

    it("encodeSignedTx and test-vector[3] check", async () => {
        const tx = {
            to: "0x9876987698769876987698769876987698769876",
            nonce: 28,
            data: '0x5678',
            value: "0x11C37937E080000",
            gasLimit: 15000,
            gasPrice: 10000000000,
            chainId: 350,
        };
        const wallet = new ethers.Wallet("0x9876987698769876987698769876987698769876987698769876987698769876");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[3].chainId).to.be.equal(tx.chainId);
        expect(testVector[3].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[3].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });

    it("encodeSignedTx and test-vector[4] check", async () => {
        const tx = {
            to: "0x8080808080808080808080808080808080808080",
            nonce: 82,
            data: '0x1234567890',
            value: "0x2C68AF0BB140000",
            gasLimit: 19000,
            gasPrice: 20000000000,
            chainId: 1400,
        };
        const wallet = new ethers.Wallet("0x1234567890123456789012345678901234567890123456789012345678901234");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[4].chainId).to.be.equal(tx.chainId);
        expect(testVector[4].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[4].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });

    it("encodeSignedTx and test-vector[5] check", async () => {
        const tx = {
            to: "0x1111111111222222222233333333334444444444",
            nonce: 47,
            data: '0x11223344',
            value: "0xCC47F20295C0000",
            gasLimit: 25000,
            gasPrice: 23000000000,
            chainId: 2,
        };
        const wallet = new ethers.Wallet("0x8888888888777777777766666666666555555555544444444443333333333322");
        const txSigned = await wallet.signTransaction(tx);
        const txSignedStruct = ethers.utils.parseTransaction(txSigned);
        const encodedTx = helpers.encodeSignedTx(txSignedStruct);
        expect(encodedTx.toLocaleLowerCase()).to.be.equal(txSigned.toLocaleLowerCase());

        expect(testVector[5].chainId).to.be.equal(tx.chainId);
        expect(testVector[5].calldata).to.be.equal(encodedTx);
        const hash = ethers.utils.keccak256(helpers.encodeTx(tx));
        const from = helpers.returnFrom(hash, {
            r: txSignedStruct.r,
            s: txSignedStruct.s,
            v: txSignedStruct.v,
        });
        expect(testVector[5].expectedAddr.toLocaleLowerCase()).to.be.equal(from.toLocaleLowerCase());
    });
});