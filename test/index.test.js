/* eslint-disable no-restricted-syntax */
const {expect} = require("chai");
const axios = require("axios");
const {readFileSync: rfs} = require("fs");
const {join} = require("path");
const index = require("../index");

describe("should export index", () => {
    it("should validate all abi exports", async () => {
        for (const file of Object.keys(index)) {
            expect(index[file]).to.be.an("object");
            expect(index[file]).to.have.property("abi");
        }
    });
    it("should check kzg trusted_setup", async () => {
        const officialTrustedSetupSrc =
            "https://raw.githubusercontent.com/ethereum/c-kzg-4844/main/src/trusted_setup.txt";
        const officialTrustedSetup = rfs(join(__dirname, "utils", "trusted_setup.txt"), "utf-8");
        const response = await axios.get(officialTrustedSetupSrc);
        expect(response.data).to.equal(officialTrustedSetup);
    });
});
