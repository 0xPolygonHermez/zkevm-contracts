/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
const {create2Deployment} = require("../helpers/deployment-helpers");

const pathGenesis = path.join(__dirname, "./genesis.json");

const createRollupParameters = require("./create_rollup_parameters.json");
const genesis = require("./genesis.json");
const deployOutput = require("./deploy_output.json");
const aggLayerProofJson = require("./aggLayerProof.json");

import "../helpers/utils";

const pathOutputJson = path.join(__dirname, "./create_rollup_output.json");

import {PolygonRollupManager} from "../../typechain-types";

async function main() {
    const attemptsDeployProxy = 20;

    const outputJson = {} as any;

    // Load provider
    let currentProvider = ethers.provider;
    if (createRollupParameters.multiplierGas || createRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (createRollupParameters.maxPriorityFeePerGas && createRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${createRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${createRollupParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(createRollupParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(createRollupParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", createRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) /
                            1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (createRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(createRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolgonRollupManagerFactory.attach(
        deployOutput.polygonRollupManagerAddress
    ) as PolygonRollupManager;

    if ((await rollupManagerContract.VMKeyAggregation()) != aggLayerProofJson.vkey) {
        await rollupManagerContract.setVMKeyAggregation(aggLayerProofJson.vkey);
        console.log("VM key setted");
    }

    const chainProofs = {
        chainProofs: aggLayerProofJson.chain_proofs.map((chainProof: any) => {
            return {
                prevL2BlockHash: chainProof.prev_l2_block_hash,
                newL2BlockHash: chainProof.new_l2_block_hash,
                l1BlockHash: chainProof.l1_block_hash,
                newLER: chainProof.new_ler,
                l1GERAddress: chainProof.l1_ger_addr,
                l2GERAddress: chainProof.l2_ger_addr,
                consensusHash: chainProof.consensus_hash,
            };
        }),
    };

    const rollupIDs = Array.from({length: chainProofs.chainProofs.length}, (_, i) => i + 1);

    // console.log(
    //     await rollupManagerContract.verifyAggregation_cheat.estimateGas(rollupIDs, chainProofs, aggLayerProofJson.proof)
    // );
    await rollupManagerContract.verifyAggregation_cheat(rollupIDs, chainProofs, aggLayerProofJson.proof, {
        gasLimit: 2000000,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
