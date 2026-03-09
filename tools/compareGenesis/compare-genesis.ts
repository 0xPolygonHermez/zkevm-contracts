/* eslint-disable no-console, no-await-in-loop, prettier/prettier, no-restricted-syntax */

import fs from 'fs';
import { ethers } from 'ethers';
import chalk from 'chalk';

// ======= CONFIGURATION ======= //
const RPC_URL = process.argv[2]; // e.g., http://localhost:8545
const GENESIS_FILE = process.argv[3]; // e.g., ./genesis.json
const BLOCK_TAG = 'earliest'; // Genesis block
// ============================= //

if (!RPC_URL || !GENESIS_FILE) {
    console.error('Usage: ts-node compare-genesis.ts <RPC_URL> <GENESIS_FILE>');
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

interface GenesisAccount {
    balance?: string;
    nonce?: string;
    code?: string; // expected bytecode (alias: bytecode)
    bytecode?: string; // allow reading files that use 'bytecode'
    storage?: Record<string, string>;
}

interface CompareResult {
    address: string;
    nonce_match: boolean;
    balance_match: boolean;
    code_match: boolean;
    storage_mismatches: { slot: string; expected: string; actual: string }[];
}

function logComparison(field: string, match: boolean, expected?: string, actual?: string): void {
    if (match) {
        console.log(chalk.green(`✓ ${field} OK`));
    } else {
        console.log(chalk.red(`✗ ${field} mismatch`));
        if (expected && actual) {
            console.log(`    Expected: ${chalk.yellow(expected)}`);
            console.log(`    Got:      ${chalk.cyan(actual)}`);
        }
    }
}

async function compareAddressState(address: string, expected: GenesisAccount): Promise<CompareResult> {
    const result: CompareResult = {
        address,
        nonce_match: true,
        balance_match: true,
        code_match: true,
        storage_mismatches: [],
    };

    const [nonce, balance, code] = await Promise.all([
        provider.getTransactionCount(address, BLOCK_TAG),
        provider.getBalance(address, BLOCK_TAG),
        provider.getCode(address, BLOCK_TAG),
    ]);

    const expectedNonce = BigInt(expected.nonce || '0x0');
    const expectedBalance = BigInt(expected.balance || '0x0');
    const expectedCode = (expected.code || expected.bytecode || '0x').toLowerCase();

    // Compare nonce
    result.nonce_match = BigInt(nonce) === expectedNonce;
    logComparison('Nonce', result.nonce_match, expectedNonce.toString(), nonce.toString());

    // Compare balance
    result.balance_match = balance.toString() === expectedBalance.toString();
    logComparison('Balance', result.balance_match, expectedBalance.toString(), balance.toString());

    // Compare code
    result.code_match = code.toLowerCase() === expectedCode;
    logComparison(
        'Code',
        result.code_match,
        result.code_match ? undefined : `${expectedCode.slice(0, 60)}...`,
        result.code_match ? undefined : `${code.slice(0, 60)}...`,
    );

    // Compare storage
    const storage = expected.storage || {};
    for (const [slot, expectedValue] of Object.entries(storage)) {
        const normalizedSlot = slot.startsWith('0x') ? slot : `0x${slot}`;
        const actual = (await (provider as any).getStorage(address, normalizedSlot, BLOCK_TAG)) as string;

        if (actual.toLowerCase() !== expectedValue.toLowerCase()) {
            result.storage_mismatches.push({ slot, expected: expectedValue, actual });
            console.log(chalk.red(`✗ Storage mismatch at slot ${slot}`));
            console.log(`    Expected: ${chalk.yellow(expectedValue)}`);
            console.log(`    Got:      ${chalk.cyan(actual)}`);
        } else {
            console.log(chalk.green(`✓ Storage slot ${slot} OK`));
        }
    }

    return result;
}

(async () => {
    // 1) Read and parse the input genesis
    let raw: any;
    try {
        raw = JSON.parse(fs.readFileSync(GENESIS_FILE, 'utf8'));
    } catch (e: any) {
        console.error(chalk.bgRed.white(`Failed to parse genesis file: ${GENESIS_FILE}\n${e.message}`));
        process.exit(1);
    }

    // 2) Normalize to { [address]: GenesisAccount }
    let accountsMap: Record<string, GenesisAccount> = {};

    if (raw?.alloc && typeof raw.alloc === 'object') {
        // Geth-style: { alloc: { [address]: { balance, nonce, code, storage } } }
        accountsMap = raw.alloc;
    } else if (Array.isArray(raw?.genesis)) {
        // Repo-style: { root: ..., genesis: [ { address, balance, nonce, bytecode|code, storage } ] }
        for (const entry of raw.genesis) {
            if (entry?.address) {
                accountsMap[entry.address] = {
                    balance: entry.balance ?? '0x0',
                    nonce: entry.nonce ?? '0x0',
                    code: entry.code ?? entry.bytecode ?? '0x',
                    storage: entry.storage ?? {},
                };
            }
        }
    } else if (raw && typeof raw === 'object') {
        // Assume already a mapping: { [address]: { balance, nonce, code, storage } }
        accountsMap = raw;
    }

    const addresses = Object.keys(accountsMap);
    if (addresses.length === 0) {
        console.error(chalk.bgRed.white(`No accounts found in provided genesis file: ${GENESIS_FILE}`));
        process.exit(1);
    }

    // 3) Compare
    const results: CompareResult[] = [];
    for (const address of addresses) {
        console.log(chalk.blue.bold(`\n=== Checking ${address} ===`));
        try {
            const res = await compareAddressState(address, accountsMap[address]);
            results.push(res);
        } catch (e: any) {
            console.error(chalk.bgRed.white(`Error checking ${address}: ${e.message}`));
        }
    }

    // 4) Summary
    console.log(chalk.bold('\n=== Summary ==='));
    for (const r of results) {
        console.log(`${chalk.bold(r.address)}:`);
        console.log(` - Nonce:   ${r.nonce_match ? chalk.green('OK') : chalk.red('Mismatch')}`);
        console.log(` - Balance: ${r.balance_match ? chalk.green('OK') : chalk.red('Mismatch')}`);
        console.log(` - Code:    ${r.code_match ? chalk.green('OK') : chalk.red('Mismatch')}`);
        console.log(
            ` - Storage: ${r.storage_mismatches.length === 0 ? chalk.green('OK') : chalk.red(`${r.storage_mismatches.length} mismatches`)}`,
        );
    }

    const hasMismatch = results.some(
        (r) => !r.nonce_match || !r.balance_match || !r.code_match || r.storage_mismatches.length > 0,
    );

    process.exit(hasMismatch ? 1 : 0);
})();
