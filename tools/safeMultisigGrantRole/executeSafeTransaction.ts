/**
 * Safe Multisig - Execute Transaction
 *
 * Executes a previously signed Safe multisig transaction.
 * Requires sufficient signatures (>= threshold) from signSafeTransaction.ts
 *
 * Usage:
 *   npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network mainnet
 *
 * Environment:
 *   EXECUTOR_INDEX  - Index of executor account (default: 0)
 *   FORCE_EXECUTE   - Set "true" to ignore nonce mismatch
 */
/* eslint-disable import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

import parameters from './parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/* //////////////////////////////////////////////////////////////
                            CONSTANTS
////////////////////////////////////////////////////////////// */

const SIGNATURES_PATH = path.join(__dirname, './signedTransactions.json');

// Minimal Safe ABI - only functions we need
const SAFE_ABI = [
    'function nonce() view returns (uint256)',
    'function getThreshold() view returns (uint256)',
    'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) payable returns (bool)',
];

/* //////////////////////////////////////////////////////////////
                            TYPES
////////////////////////////////////////////////////////////// */

interface SafeTransaction {
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: number;
    baseGas: number;
    gasPrice: number;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
}

interface SafeSignature {
    signer: string;
    data: string;
}

interface SignedTransactionData {
    safeTx: SafeTransaction;
    signatures: SafeSignature[];
    txHash: string;
    chainId?: number;
}

/* //////////////////////////////////////////////////////////////
                            HELPERS
////////////////////////////////////////////////////////////// */

/**
 * Builds packed signature bytes from array of signatures.
 * Signatures MUST be sorted by signer address (ascending, case-insensitive).
 * This is a Gnosis Safe requirement.
 */
function buildSignatureBytes(signatures: SafeSignature[]): string {
    // Sort by signer address (required by Safe)
    const sorted = [...signatures].sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));

    // Concatenate: remove '0x' prefix and join
    return `0x${sorted.map((s) => s.data.slice(2)).join('')}`;
}

/* //////////////////////////////////////////////////////////////
                            MAIN
////////////////////////////////////////////////////////////// */

async function main() {
    // ═══════════════════════════════════════════════════════════
    // VALIDATE PARAMETERS
    // ═══════════════════════════════════════════════════════════

    checkParams(parameters, ['safeAddress'], true);
    const { safeAddress } = parameters;

    // ═══════════════════════════════════════════════════════════
    // LOAD SIGNED TRANSACTION
    // ═══════════════════════════════════════════════════════════

    if (!fs.existsSync(SIGNATURES_PATH)) {
        throw new Error(`No signatures found. Run signSafeTransaction.ts first.\nExpected: ${SIGNATURES_PATH}`);
    }

    const signedTransactions: SignedTransactionData[] = JSON.parse(fs.readFileSync(SIGNATURES_PATH, 'utf8'));

    if (signedTransactions.length === 0) {
        throw new Error('Signatures file is empty.');
    }

    // Use most recent transaction
    const tx = signedTransactions[signedTransactions.length - 1];

    // ═══════════════════════════════════════════════════════════
    // DISPLAY INFO
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║      SAFE MULTISIG - EXECUTE GRANT ROLE TRANSACTION      ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address: ${safeAddress}`);

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

    // Decode calldata
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

    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SELECT EXECUTOR
    // ═══════════════════════════════════════════════════════════

    const signers = await ethers.getSigners();
    const executorIndex = process.env.EXECUTOR_INDEX ? parseInt(process.env.EXECUTOR_INDEX, 10) : 0;

    if (executorIndex >= signers.length) {
        throw new Error(`Executor index ${executorIndex} out of range (available: ${signers.length})`);
    }

    const executor = signers[executorIndex];
    const executorAddress = await executor.getAddress();
    logger.info(`Executor: [${executorIndex}] ${executorAddress}`);
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
