/**
 * Safe Multisig - Prepare Transaction
 *
 * Prepares an arbitrary Safe multisig transaction with custom `to` and `data` parameters.
 * This is a generic script for preparing any transaction to be signed by the multisig.
 *
 * Usage:
 *   npx hardhat run tools/safeMultisig/prepareTransaction.ts --network mainnet
 *
 * After running this script, use:
 *   1. signSafeTransaction.ts - to collect signatures
 *   2. executeSafeTransaction.ts - to execute the transaction
 */
/* eslint-disable import/no-unresolved */
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';
import {
    SAFE_ABI,
    TransactionData,
    buildSafeTransaction,
    calculateSafeTxHash,
    getNextNonce,
    getTransactionsForSafe,
    loadTransactions,
    saveTransactions,
    upsertTransaction,
} from './safeUtils';

import parameters from './parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/* //////////////////////////////////////////////////////////////
                            CONSTANTS
////////////////////////////////////////////////////////////// */

const TRANSACTIONS_PATH = path.join(__dirname, './transactions.json');

/* //////////////////////////////////////////////////////////////
                            MAIN
////////////////////////////////////////////////////////////// */

async function main() {
    // ═══════════════════════════════════════════════════════════
    // VALIDATE PARAMETERS
    // ═══════════════════════════════════════════════════════════

    const mandatoryParams = ['safeAddress', 'to', 'data'];
    checkParams(parameters, mandatoryParams, true);

    const {
        safeAddress,
        to,
        data,
        value = 0,
        operation = 0,
        description,
    } = parameters as {
        safeAddress: string;
        to: string;
        data: string;
        value?: number | string;
        operation?: number;
        description?: string;
    };

    // Validate addresses
    if (!ethers.isAddress(to)) {
        throw new Error(`Invalid 'to' address: ${to}`);
    }

    // Validate data is hex
    if (!data.startsWith('0x')) {
        throw new Error(`Invalid 'data': must be hex string starting with 0x`);
    }

    // Validate operation
    if (operation !== 0 && operation !== 1) {
        throw new Error(`Invalid 'operation': must be 0 (Call) or 1 (DelegateCall)`);
    }

    // ═══════════════════════════════════════════════════════════
    // DISPLAY CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║         SAFE MULTISIG - PREPARE TRANSACTION              ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address: ${safeAddress}`);
    logger.info(`  To:           ${to}`);
    logger.info(`  Value:        ${value}`);
    logger.info(`  Operation:    ${operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Data Length:  ${(data.length - 2) / 2} bytes`);
    if (description) {
        logger.info(`  Description:  ${description}`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONNECT TO NETWORK
    // ═══════════════════════════════════════════════════════════

    const { chainId } = await ethers.provider.getNetwork();
    logger.info(`  Chain ID:     ${chainId}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // LOAD SAFE CONTRACT
    // ═══════════════════════════════════════════════════════════

    const safeContract = await ethers.getContractAt(SAFE_ABI, safeAddress);

    const [onChainNonce, threshold, owners] = await Promise.all([
        safeContract.nonce(),
        safeContract.getThreshold(),
        safeContract.getOwners(),
    ]);

    // Check transactions.json for this Safe - use highest nonce (some may already be executed)
    const allTransactions = loadTransactions(TRANSACTIONS_PATH);
    const txsForThisSafe = getTransactionsForSafe(allTransactions, safeAddress, Number(chainId));
    const nonce = getNextNonce(onChainNonce, txsForThisSafe);

    logger.info('Safe Info:');
    logger.info(`  On-chain Nonce:  ${onChainNonce}`);
    logger.info(`  Txs in file:    ${txsForThisSafe.length}`);
    logger.info(`  Next Nonce:     ${nonce}`);
    logger.info(`  Threshold: ${threshold}`);
    logger.info(`  Owners:    ${(owners as string[]).length}`);
    (owners as string[]).forEach((owner, i) => logger.info(`    [${i}] ${owner}`));
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // ANALYZE CALLDATA
    // ═══════════════════════════════════════════════════════════

    logger.info('Calldata Analysis:');
    if (!data || data === '0x') {
        logger.info('  Type: ETH Transfer (no data)');
    } else {
        const selector = data.slice(0, 10);
        logger.info(`  Selector: ${selector}`);
        if (data.length > 10) {
            logger.info(`  Data Preview: ${data.slice(0, 74)}${data.length > 74 ? '...' : ''}`);
        }
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // BUILD TRANSACTION
    // ═══════════════════════════════════════════════════════════

    // Parse value - keep as bigint to avoid precision loss for uint256 values
    let parsedValue: bigint;
    if (typeof value === 'string') {
        if (value.includes('ether')) {
            parsedValue = ethers.parseEther(value.replace('ether', '').trim());
        } else if (value.includes('gwei')) {
            parsedValue = ethers.parseUnits(value.replace('gwei', '').trim(), 'gwei');
        } else {
            parsedValue = BigInt(value);
        }
    } else {
        parsedValue = BigInt(value);
    }

    // Build Safe transaction struct
    const safeTx = buildSafeTransaction({
        to,
        data,
        value: parsedValue,
        operation,
        nonce,
    });

    logger.info('Transaction:');
    logger.info(`  To:        ${safeTx.to}`);
    logger.info(`  Value:     ${safeTx.value}`);
    logger.info(`  Operation: ${safeTx.operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Nonce:     ${safeTx.nonce}`);
    logger.info('');

    // Calculate EIP-712 hash
    const txHash = calculateSafeTxHash(safeAddress, safeTx, chainId);
    logger.info(`Transaction Hash: ${txHash}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SIMULATE (OPTIONAL)
    // ═══════════════════════════════════════════════════════════

    try {
        logger.info('Simulating transaction...');
        const result = await ethers.provider.call({
            from: safeAddress,
            to,
            data,
            value: parsedValue,
        });
        logger.info(`Simulation succeeded. Return data: ${result.slice(0, 66)}${result.length > 66 ? '...' : ''}`);
    } catch (error: any) {
        logger.warn(`Simulation failed: ${error.reason || error.message}`);
        logger.warn('Transaction may still succeed when executed from Safe.');
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SAVE TRANSACTION
    // ═══════════════════════════════════════════════════════════

    const transactionData: TransactionData = {
        safeAddress,
        safeTx,
        signatures: [],
        txHash,
        chainId: Number(chainId),
        description: description || `Custom transaction to ${to}`,
        parameters: {
            safeAddress,
            to,
            data,
            value: parsedValue.toString(), // Store as string for JSON serialization
            operation,
        },
        createdAt: new Date().toISOString(),
    };

    // Load existing transactions and add/update this one (reload to get latest)
    let transactions = loadTransactions(TRANSACTIONS_PATH);
    transactions = upsertTransaction(transactions, transactionData);
    saveTransactions(TRANSACTIONS_PATH, transactions);

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║                  TRANSACTION PREPARED                    ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Transaction Details:');
    logger.info(`  To:        ${to}`);
    logger.info(`  Value:     ${parsedValue} wei`);
    logger.info(`  Operation: ${operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Data:      ${data.length > 74 ? `${data.slice(0, 74)}...` : data}`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Have owners sign: npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network <network>');
    logger.info(`     (Need ${threshold} signature(s))`);
    logger.info('  2. Execute: npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network <network>');
    logger.info('');
    logger.info(`Output: ${TRANSACTIONS_PATH}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
