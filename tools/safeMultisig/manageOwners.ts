/**
 * Safe Multisig - Manage Owners
 *
 * Prepares Safe multisig transactions to manage owners and threshold.
 * Operations are executed in order: remove owners → add owners → update threshold
 *
 * Usage:
 *   npx hardhat run tools/safeMultisig/manageOwners.ts --network mainnet
 *
 * After running this script, use:
 *   1. signSafeTransaction.ts - to collect signatures
 *   2. executeSafeTransaction.ts - to execute the transaction
 *
 * Note: If multiple operations are needed, they are batched using MultiSend.
 */
/* eslint-disable import/no-unresolved, no-restricted-syntax, no-plusplus */
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';
import {
    SAFE_ABI,
    MULTI_SEND_CALL_ONLY_ADDRESS,
    SENTINEL_ADDRESS,
    MetaTransaction,
    TransactionData,
    buildSafeTransaction,
    calculateSafeTxHash,
    encodeAddOwner,
    encodeRemoveOwner,
    encodeChangeThreshold,
    encodeMultiSendCallOnly,
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

    const mandatoryParams = ['safeAddress'];
    checkParams(parameters, mandatoryParams, true);

    const {
        safeAddress,
        ownersToAdd = [],
        ownersToRemove = [],
        newThreshold,
    } = parameters as {
        safeAddress: string;
        ownersToAdd?: string[];
        ownersToRemove?: string[];
        newThreshold?: number;
    };

    // Validate at least one operation is specified
    if (ownersToAdd.length === 0 && ownersToRemove.length === 0 && newThreshold === undefined) {
        throw new Error('No operations specified. Set ownersToAdd, ownersToRemove, or newThreshold.');
    }

    // ═══════════════════════════════════════════════════════════
    // DISPLAY CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║           SAFE MULTISIG - MANAGE OWNERS                  ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address: ${safeAddress}`);
    if (ownersToRemove.length > 0) {
        logger.info(`  Owners to Remove: ${ownersToRemove.length}`);
        ownersToRemove.forEach((o, i) => logger.info(`    [${i}] ${o}`));
    }
    if (ownersToAdd.length > 0) {
        logger.info(`  Owners to Add: ${ownersToAdd.length}`);
        ownersToAdd.forEach((o, i) => logger.info(`    [${i}] ${o}`));
    }
    if (newThreshold !== undefined) {
        logger.info(`  New Threshold: ${newThreshold}`);
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

    const currentOwners = owners as string[];
    const currentThreshold = Number(threshold);

    // Check transactions.json for this Safe - use highest nonce (some may already be executed)
    const allTransactions = loadTransactions(TRANSACTIONS_PATH);
    const txsForThisSafe = getTransactionsForSafe(allTransactions, safeAddress, Number(chainId));
    const nonce = getNextNonce(onChainNonce, txsForThisSafe);

    logger.info('Safe Info:');
    logger.info(`  On-chain Nonce:  ${onChainNonce}`);
    logger.info(`  Txs in file:    ${txsForThisSafe.length}`);
    logger.info(`  Next Nonce:     ${nonce}`);
    logger.info(`  Threshold: ${currentThreshold}`);
    logger.info(`  Owners:    ${currentOwners.length}`);
    currentOwners.forEach((owner, i) => logger.info(`    [${i}] ${owner}`));
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // VALIDATE & CALCULATE FINAL STATE
    // ═══════════════════════════════════════════════════════════

    // Calculate final owner count
    const finalOwnerCount = currentOwners.length - ownersToRemove.length + ownersToAdd.length;

    if (finalOwnerCount === 0) {
        throw new Error('Cannot remove all owners');
    }

    // Determine final threshold
    const finalThreshold = newThreshold ?? Math.min(currentThreshold, finalOwnerCount);

    if (finalThreshold < 1) {
        throw new Error('Threshold must be at least 1');
    }

    if (finalThreshold > finalOwnerCount) {
        throw new Error(`Threshold (${finalThreshold}) cannot exceed final owner count (${finalOwnerCount})`);
    }

    // Validate owners to remove exist
    for (const owner of ownersToRemove) {
        const exists = currentOwners.some((o) => o.toLowerCase() === owner.toLowerCase());
        if (!exists) {
            throw new Error(`Cannot remove ${owner}: not an owner`);
        }
    }

    // Validate owners to add don't already exist
    for (const owner of ownersToAdd) {
        const exists = currentOwners.some((o) => o.toLowerCase() === owner.toLowerCase());
        if (exists) {
            throw new Error(`Cannot add ${owner}: already an owner`);
        }
    }

    logger.info('Planned Changes:');
    logger.info(`  Current: ${currentOwners.length} owners, threshold ${currentThreshold}`);
    logger.info(`  Final:   ${finalOwnerCount} owners, threshold ${finalThreshold}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // BUILD OPERATIONS
    // Order: 1) Remove owners, 2) Add owners, 3) Update threshold
    // ═══════════════════════════════════════════════════════════

    const operations: { description: string; tx: MetaTransaction }[] = [];
    let runningOwnerCount = currentOwners.length;
    let runningThreshold = currentThreshold;

    // Build a local linked list to track state changes during batch
    // Safe's linked list: SENTINEL → owner[0] → owner[1] → ... → owner[n-1] → SENTINEL
    // We simulate it as an array and track removals to compute correct prevOwner
    let simulatedOwners = [...currentOwners];

    // Helper to find prevOwner in our simulated state
    const findPrevOwnerLocal = (ownerToRemove: string): string => {
        const index = simulatedOwners.findIndex((o) => o.toLowerCase() === ownerToRemove.toLowerCase());
        if (index === -1) {
            throw new Error(`Cannot find ${ownerToRemove} in simulated owner list`);
        }
        // First owner points to sentinel
        if (index === 0) {
            return SENTINEL_ADDRESS;
        }
        return simulatedOwners[index - 1];
    };

    // Step 1: Remove owners
    for (const owner of ownersToRemove) {
        // Find prevOwner using our LOCAL simulated state (not on-chain)
        const prevOwner = findPrevOwnerLocal(owner);

        // Threshold must be <= remaining owners after removal
        const newCount = runningOwnerCount - 1;
        const tempThreshold = Math.min(runningThreshold, newCount);

        const data = encodeRemoveOwner(prevOwner, owner, tempThreshold);
        operations.push({
            description: `Remove owner ${owner}`,
            tx: { to: safeAddress, value: 0, data },
        });

        // Update our simulated state: remove this owner from the list
        simulatedOwners = simulatedOwners.filter((o) => o.toLowerCase() !== owner.toLowerCase());

        runningOwnerCount = newCount;
        runningThreshold = tempThreshold;
    }

    // Step 2: Add owners
    for (const owner of ownersToAdd) {
        // Keep current threshold when adding (owner count increases)
        const data = encodeAddOwner(owner, runningThreshold);
        operations.push({
            description: `Add owner ${owner}`,
            tx: { to: safeAddress, value: 0, data },
        });

        runningOwnerCount++;
    }

    // Step 3: Update threshold if needed
    if (finalThreshold !== runningThreshold) {
        const data = encodeChangeThreshold(finalThreshold);
        operations.push({
            description: `Change threshold to ${finalThreshold}`,
            tx: { to: safeAddress, value: 0, data },
        });
    }

    if (operations.length === 0) {
        logger.info('No changes needed - Safe is already in desired state.');
        return;
    }

    logger.info(`Operations (${operations.length}):`);
    operations.forEach((op, i) => logger.info(`  [${i + 1}] ${op.description}`));
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // BUILD TRANSACTION
    // ═══════════════════════════════════════════════════════════

    let safeTx;
    let description: string;

    if (operations.length === 1) {
        // Single operation - direct call
        const op = operations[0];
        safeTx = buildSafeTransaction({
            to: op.tx.to,
            data: op.tx.data,
            nonce,
        });
        description = op.description;
    } else {
        // Multiple operations - use MultiSend
        logger.info('Batching operations using MultiSendCallOnly...');
        logger.info(`  MultiSend Address: ${MULTI_SEND_CALL_ONLY_ADDRESS}`);
        logger.info('');

        const multiSendData = encodeMultiSendCallOnly(operations.map((op) => op.tx));

        safeTx = buildSafeTransaction({
            to: multiSendData.to,
            data: multiSendData.data,
            operation: multiSendData.operation,
            nonce,
        });
        description = `Batch: ${operations.map((op) => op.description).join(', ')}`;
    }

    // Calculate EIP-712 hash
    const txHash = calculateSafeTxHash(safeAddress, safeTx, chainId);

    logger.info('Transaction:');
    logger.info(`  To:        ${safeTx.to}`);
    logger.info(`  Value:     ${safeTx.value}`);
    logger.info(`  Operation: ${safeTx.operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Nonce:     ${safeTx.nonce}`);
    logger.info('');
    logger.info(`Transaction Hash: ${txHash}`);
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
        description,
        parameters: {
            safeAddress,
            ownersToRemove,
            ownersToAdd,
            newThreshold: finalThreshold,
            currentOwners,
            currentThreshold,
            finalOwnerCount,
            finalThreshold,
        },
        operations: operations.map((op) => op.description),
        createdAt: new Date().toISOString(),
    };

    // Load existing transactions and add/update this one
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
    logger.info('Summary:');
    logger.info(`  Operations: ${operations.length}`);
    logger.info(`  Current:    ${currentOwners.length} owners, threshold ${currentThreshold}`);
    logger.info(`  After:      ${finalOwnerCount} owners, threshold ${finalThreshold}`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Have owners sign: npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network <network>');
    logger.info(`     (Need ${currentThreshold} signature(s))`);
    logger.info('  2. Execute: npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network <network>');
    logger.info('');
    logger.info(`Output: ${TRANSACTIONS_PATH}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
