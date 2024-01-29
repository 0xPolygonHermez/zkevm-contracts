/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import {ethers, upgrades} from "hardhat";
const input = require("./input.json");

async function main() {
    // load input file

    // Load implementation contract
    const PolygonZkEVMFactory = (await ethers.getContractFactory(input.implementationName)) as any;

    // Import OZ upgrades
    await upgrades.forceImport(input.proxyAddress, PolygonZkEVMFactory, {
        kind: "transparent",
        constructorArgs: input.constructorArgs,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
