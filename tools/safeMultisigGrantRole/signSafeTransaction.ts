/**
 * Safe Multisig - Sign Transaction
 *
 * Creates and signs a Safe multisig transaction to grant a role on a Timelock contract.
 * Uses EIP-712 typed data signing for security and Ledger compatibility.
 *
 * Usage:
 *   npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network mainnet
 *
 * Environment:
 *   SIGNER_INDEX    - Index of signer to use (default: 0)
 *   LEDGER_ACCOUNT  - Ledger address (enables hardware wallet signing)
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

const OUTPUT_PATH = path.join(__dirname, './signedTransactions.json');

// EIP-712 type definition for Safe transactions
// See: https://github.com/safe-global/safe-contracts/blob/main/contracts/GnosisSafe.sol
const EIP712_SAFE_TX_TYPE = {
    SafeTx: [
        { type: 'address', name: 'to' },
        { type: 'uint256', name: 'value' },
        { type: 'bytes', name: 'data' },
        { type: 'uint8', name: 'operation' },
        { type: 'uint256', name: 'safeTxGas' },
        { type: 'uint256', name: 'baseGas' },
        { type: 'uint256', name: 'gasPrice' },
        { type: 'address', name: 'gasToken' },
        { type: 'address', name: 'refundReceiver' },
        { type: 'uint256', name: 'nonce' },
    ],
};

// Minimal Safe ABI - only functions we need
const SAFE_ABI = [
    'function nonce() view returns (uint256)',
    'function getThreshold() view returns (uint256)',
    'function getOwners() view returns (address[])',
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
    chainId: number;
    parameters: typeof parameters;
}

/* //////////////////////////////////////////////////////////////
                            HELPERS
////////////////////////////////////////////////////////////// */

/**
 * Normalizes signature `v` value for Gnosis Safe compatibility.
 *
 * Gnosis Safe interprets `v` values specially:
 *   - v = 0  → Contract signature (EIP-1271)
 *   - v = 1  → Pre-approved hash
 *   - v > 30 → eth_sign style
 *   - v = 27 or 28 → Standard ECDSA (what we want)
 *
 * Some signers return v=0/1 instead of 27/28, so we normalize here.
 */
function normalizeSignatureV(signature: string): string {
    const sig = signature.startsWith('0x') ? signature.slice(2) : signature;

    if (sig.length !== 130) {
        logger.warn(`Unexpected signature length: ${sig.length} (expected 130)`);
        return signature;
    }

    // Signature format: r (32 bytes/64 hex) + s (32 bytes/64 hex) + v (1 byte/2 hex)
    const r = sig.slice(0, 64);
    const s = sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);

    // Normalize: convert 0/1 to 27/28
    if (v < 27) {
        v += 27;
        logger.info(`Normalized signature v: ${v - 27} → ${v}`);
    }

    // Validate
    if (v !== 27 && v !== 28) {
        logger.warn(`Unexpected v value: ${v} (expected 27 or 28)`);
    }

    return `0x${r}${s}${v.toString(16).padStart(2, '0')}`;
}

/* //////////////////////////////////////////////////////////////
                            MAIN
////////////////////////////////////////////////////////////// */

async function main() {
    // ═══════════════════════════════════════════════════════════
    // VALIDATE PARAMETERS
    // ═══════════════════════════════════════════════════════════

    const mandatoryParams = ['safeAddress', 'timelockAddress', 'roleReceiver', 'roleName'];
    checkParams(parameters, mandatoryParams, true);

    const { safeAddress, timelockAddress, roleReceiver, roleName } = parameters;

    // ═══════════════════════════════════════════════════════════
    // DISPLAY CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║       SAFE MULTISIG - SIGN GRANT ROLE TRANSACTION        ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address:     ${safeAddress}`);
    logger.info(`  Timelock Address: ${timelockAddress}`);
    logger.info(`  Role Receiver:    ${roleReceiver}`);
    logger.info(`  Role Name:        ${roleName}`);

    // ═══════════════════════════════════════════════════════════
    // CONNECT TO NETWORK
    // ═══════════════════════════════════════════════════════════

    const { chainId } = await ethers.provider.getNetwork();
    logger.info(`  Chain ID:         ${chainId}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // LOAD SAFE CONTRACT
    // ═══════════════════════════════════════════════════════════

    const safeContract = await ethers.getContractAt(SAFE_ABI, safeAddress);

    const [nonce, threshold, owners] = await Promise.all([
        safeContract.nonce(),
        safeContract.getThreshold(),
        safeContract.getOwners(),
    ]);

    logger.info('Safe Info:');
    logger.info(`  Nonce:     ${nonce}`);
    logger.info(`  Threshold: ${threshold}`);
    logger.info(`  Owners:    ${(owners as string[]).length}`);
    (owners as string[]).forEach((owner, i) => logger.info(`    [${i}] ${owner}`));
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // BUILD TRANSACTION
    // ═══════════════════════════════════════════════════════════

    // Encode grantRole(bytes32 role, address account) call
    const timelockFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const roleHash = ethers.id(roleName);
    const calldata = timelockFactory.interface.encodeFunctionData('grantRole', [roleHash, roleReceiver]);

    logger.info('Transaction:');
    logger.info(`  Function: grantRole(bytes32,address)`);
    logger.info(`  Role:     ${roleName}`);
    logger.info(`  Hash:     ${roleHash}`);
    logger.info(`  Receiver: ${roleReceiver}`);
    logger.info('');

    // Build Safe transaction struct (string for uint256 fields to handle large values safely)
    const safeTx: SafeTransaction = {
        to: timelockAddress,
        value: '0',
        data: calldata,
        operation: 0, // 0 = Call, 1 = DelegateCall
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
        nonce: Number(nonce),
    };

    // Calculate EIP-712 hash
    const txHash = ethers.TypedDataEncoder.hash(
        { verifyingContract: safeAddress, chainId },
        EIP712_SAFE_TX_TYPE,
        safeTx,
    );

    logger.info(`Transaction Hash: ${txHash}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SELECT SIGNER
    // ═══════════════════════════════════════════════════════════

    const signers = await ethers.getSigners();
    const signerIndex = process.env.SIGNER_INDEX ? parseInt(process.env.SIGNER_INDEX, 10) : 0;

    if (signerIndex >= signers.length) {
        throw new Error(`Signer index ${signerIndex} out of range (available: ${signers.length})`);
    }

    const signer = signers[signerIndex];
    const signerAddress = await signer.getAddress();

    logger.info(`Signer: [${signerIndex}] ${signerAddress}`);

    // Verify signer is a Safe owner
    const isOwner = (owners as string[]).map((o) => o.toLowerCase()).includes(signerAddress.toLowerCase());

    if (!isOwner) {
        logger.error('⚠️  WARNING: This address is not a Safe owner!');
        process.exit(1);
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SIGN TRANSACTION
    // ═══════════════════════════════════════════════════════════

    logger.info('Signing transaction (confirm on device if using Ledger)...');

    const rawSignature = await signer.signTypedData(
        { verifyingContract: safeAddress, chainId },
        EIP712_SAFE_TX_TYPE,
        safeTx,
    );

    const signature = normalizeSignatureV(rawSignature);
    logger.info(`Signature: ${signature.slice(0, 20)}...${signature.slice(-10)}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SAVE SIGNATURE
    // ═══════════════════════════════════════════════════════════

    // Load existing signatures
    let signedTransactions: SignedTransactionData[] = [];
    if (fs.existsSync(OUTPUT_PATH)) {
        signedTransactions = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    }

    // Find or create transaction entry
    const existingIndex = signedTransactions.findIndex((tx) => tx.txHash === txHash);
    const safeSignature: SafeSignature = { signer: signerAddress, data: signature };

    if (existingIndex >= 0) {
        // Check for duplicate
        const alreadySigned = signedTransactions[existingIndex].signatures.some(
            (s) => s.signer.toLowerCase() === signerAddress.toLowerCase(),
        );

        if (alreadySigned) {
            logger.warn('⚠️  You have already signed this transaction!');
            logger.info('');
            return;
        }

        signedTransactions[existingIndex].signatures.push(safeSignature);
    } else {
        signedTransactions.push({
            safeTx,
            signatures: [safeSignature],
            txHash,
            chainId: Number(chainId),
            parameters,
        });
    }

    // Save
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(signedTransactions, null, 2));

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    const currentTx =
        existingIndex >= 0 ? signedTransactions[existingIndex] : signedTransactions[signedTransactions.length - 1];

    const sigCount = currentTx.signatures.length;
    const thresholdNum = Number(threshold);

    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║                     SIGNATURE SAVED                      ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info(`Progress: ${sigCount}/${thresholdNum} signatures`);
    logger.info('');
    logger.info('Signers:');
    currentTx.signatures.forEach((s, i) => logger.info(`  [${i + 1}] ${s.signer}`));
    logger.info('');

    if (sigCount >= thresholdNum) {
        logger.info('✅ THRESHOLD REACHED - Ready to execute!');
        logger.info(
            '   Run: npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network <network>',
        );
    } else {
        logger.info(`⏳ Need ${thresholdNum - sigCount} more signature(s)`);
    }
    logger.info('');
    logger.info(`Output: ${OUTPUT_PATH}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
