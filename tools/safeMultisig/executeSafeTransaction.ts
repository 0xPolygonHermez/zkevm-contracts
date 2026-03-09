/**
 * Safe Multisig - Execute Transaction
 *
 * Executes a previously signed Safe multisig transaction.
 * Requires sufficient signatures (>= threshold) from signSafeTransaction.ts
 *
 * Usage:
 *   npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network mainnet
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY - Private key for signing (alternative to mnemonic)
 *   EXECUTOR_INDEX       - Index of executor account (default: 0, ignored if DEPLOYER_PRIVATE_KEY is set)
 *   FORCE_EXECUTE        - Set "true" to ignore nonce mismatch
 *   TX_INDEX             - Index of transaction to execute (default: latest)
 */
/* eslint-disable import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { SAFE_ABI, TransactionData, buildSignatureBytes, loadTransactions } from './safeUtils';

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
    // LOAD TRANSACTION
    // ═══════════════════════════════════════════════════════════

    if (!fs.existsSync(TRANSACTIONS_PATH)) {
        throw new Error(
            `No transactions found.\nExpected: ${TRANSACTIONS_PATH}\n\n` +
                `First prepare and sign a transaction using:\n` +
                `  1. prepareTransaction.ts or manageOwners.ts\n` +
                `  2. signSafeTransaction.ts`,
        );
    }

    const transactions: TransactionData[] = loadTransactions(TRANSACTIONS_PATH);

    if (transactions.length === 0) {
        throw new Error('Transactions file is empty.');
    }

    // Select transaction to execute
    const txIndex = process.env.TX_INDEX ? parseInt(process.env.TX_INDEX, 10) : transactions.length - 1;

    if (txIndex >= transactions.length || txIndex < 0) {
        throw new Error(`Invalid TX_INDEX: ${txIndex}. Available: 0-${transactions.length - 1}`);
    }

    const tx = transactions[txIndex];
    const { safeAddress } = tx;

    if (!safeAddress) {
        throw new Error('Transaction is missing safeAddress.');
    }

    // ═══════════════════════════════════════════════════════════
    // DISPLAY INFO
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║          SAFE MULTISIG - EXECUTE TRANSACTION             ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address: ${safeAddress}`);
    if (tx.description) {
        logger.info(`  Description:  ${tx.description}`);
    }

    const { chainId } = await ethers.provider.getNetwork();
    logger.info(`  Chain ID:     ${chainId}`);
    logger.info('');

    logger.info('Transaction:');
    logger.info(`  Hash:       ${tx.txHash}`);
    logger.info(`  To:         ${tx.safeTx.to}`);
    logger.info(`  Value:      ${tx.safeTx.value}`);
    logger.info(`  Operation:  ${tx.safeTx.operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Nonce:      ${tx.safeTx.nonce}`);
    logger.info('');

    // Try to decode calldata
    try {
        const timelockFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const decoded = timelockFactory.interface.parseTransaction({ data: tx.safeTx.data });
        if (decoded) {
            logger.info('Decoded Call:');
            logger.info(`  Function: ${decoded.name}`);
            decoded.fragment.inputs.forEach((input, i) => {
                logger.info(`  ${input.name}: ${decoded.args[i]}`);
            });
            logger.info('');
        }
    } catch {
        logger.info(`  Data: ${tx.safeTx.data}`);
        logger.info('');
    }

    logger.info(`Signatures: ${tx.signatures.length}`);
    tx.signatures.forEach((s, i) => logger.info(`  [${i + 1}] ${s.signer}`));
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // VALIDATE
    // ═══════════════════════════════════════════════════════════

    const safeContract = await ethers.getContractAt(SAFE_ABI, safeAddress);

    // Check nonce
    const currentNonce = await safeContract.nonce();
    logger.info(`Safe Nonce:  ${currentNonce} (tx requires: ${tx.safeTx.nonce})`);

    if (Number(currentNonce) !== tx.safeTx.nonce) {
        logger.warn('⚠️  NONCE MISMATCH!');
        logger.warn('   Transaction may have been executed or another tx was processed.');

        if (process.env.FORCE_EXECUTE !== 'true') {
            throw new Error('Nonce mismatch. Set FORCE_EXECUTE=true to override.');
        }
        logger.warn('   FORCE_EXECUTE=true → Proceeding anyway...');
    }

    // Check threshold
    const threshold = await safeContract.getThreshold();
    logger.info(`Threshold:   ${threshold} (have: ${tx.signatures.length})`);

    if (tx.signatures.length < Number(threshold)) {
        throw new Error(`Insufficient signatures. Need ${threshold}, have ${tx.signatures.length}`);
    }

    // Check chain ID if available
    if (tx.chainId && tx.chainId !== Number(chainId)) {
        throw new Error(`Chain ID mismatch. Transaction signed for chain ${tx.chainId}, but connected to ${chainId}`);
    }

    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SELECT EXECUTOR
    // ═══════════════════════════════════════════════════════════

    let executor;
    let executorAddress: string;
    let executorType: string;

    if (process.env.DEPLOYER_PRIVATE_KEY) {
        // Use private key
        const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, ethers.provider);
        executor = wallet;
        executorAddress = await wallet.getAddress();
        executorType = 'private key';
    } else {
        // Use mnemonic via hardhat signers
        const signers = await ethers.getSigners();
        const executorIndex = process.env.EXECUTOR_INDEX ? parseInt(process.env.EXECUTOR_INDEX, 10) : 0;

        if (executorIndex >= signers.length) {
            throw new Error(`Executor index ${executorIndex} out of range (available: ${signers.length})`);
        }

        executor = signers[executorIndex];
        executorAddress = await executor.getAddress();
        executorType = `mnemonic [${executorIndex}]`;
    }

    logger.info(`Executor: ${executorAddress} (${executorType})`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // BUILD SIGNATURES
    // ═══════════════════════════════════════════════════════════

    const signatureBytes = buildSignatureBytes(tx.signatures);

    // ═══════════════════════════════════════════════════════════
    // ESTIMATE GAS
    // ═══════════════════════════════════════════════════════════

    logger.info('Estimating gas...');
    const safeWithExecutor = safeContract.connect(executor);

    try {
        const gasEstimate = await safeWithExecutor.execTransaction.estimateGas(
            tx.safeTx.to,
            tx.safeTx.value,
            tx.safeTx.data,
            tx.safeTx.operation,
            tx.safeTx.safeTxGas,
            tx.safeTx.baseGas,
            tx.safeTx.gasPrice,
            tx.safeTx.gasToken,
            tx.safeTx.refundReceiver,
            signatureBytes,
        );
        logger.info(`Estimated gas: ${gasEstimate}`);
    } catch (error: any) {
        logger.warn(`Gas estimation failed: ${error.reason || error.message}`);
        logger.warn('Proceeding anyway (transaction may still succeed)...');
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // EXECUTE
    // ═══════════════════════════════════════════════════════════

    logger.info('Executing transaction...');
    logger.info('');

    const txResponse = await safeWithExecutor.execTransaction(
        tx.safeTx.to,
        tx.safeTx.value,
        tx.safeTx.data,
        tx.safeTx.operation,
        tx.safeTx.safeTxGas,
        tx.safeTx.baseGas,
        tx.safeTx.gasPrice,
        tx.safeTx.gasToken,
        tx.safeTx.refundReceiver,
        signatureBytes,
    );

    logger.info(`Transaction sent: ${txResponse.hash}`);
    logger.info('Waiting for confirmation...');

    const receipt = await txResponse.wait();

    // ═══════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║                  ✅ TRANSACTION SUCCESS                  ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info(`Block:     ${receipt?.blockNumber}`);
    logger.info(`Gas Used:  ${receipt?.gasUsed}`);
    logger.info(`Tx Hash:   ${txResponse.hash}`);
    logger.info('');
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
