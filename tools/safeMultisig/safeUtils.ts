/**
 * Safe Multisig Utilities
 * Common utilities for Gnosis Safe 1.3.0+ multisig wallets.
 */
/* eslint-disable no-restricted-syntax */
import fs = require('fs');
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';

/* //////////////////////////////////////////////////////////////
                            CONSTANTS
////////////////////////////////////////////////////////////// */

// EIP-712 type definition for Safe transactions
// See: https://github.com/safe-global/safe-contracts/blob/main/contracts/GnosisSafe.sol
export const EIP712_SAFE_TX_TYPE = {
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
export const SAFE_ABI = [
    'function nonce() view returns (uint256)',
    'function getThreshold() view returns (uint256)',
    'function getOwners() view returns (address[])',
    'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) payable returns (bool)',
    'function addOwnerWithThreshold(address owner, uint256 _threshold)',
    'function removeOwner(address prevOwner, address owner, uint256 _threshold)',
    'function changeThreshold(uint256 _threshold)',
];

// Sentinel address used in Safe's linked list for owners
export const SENTINEL_ADDRESS = '0x0000000000000000000000000000000000000001';

// MultiSend contract addresses (same on all EVM networks for Safe 1.3.0)
// See: https://github.com/safe-global/safe-deployments
export const MULTI_SEND_ADDRESS = '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761';
export const MULTI_SEND_CALL_ONLY_ADDRESS = '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D';

/* //////////////////////////////////////////////////////////////
                            TYPES
////////////////////////////////////////////////////////////// */

export interface SafeTransaction {
    to: string;
    value: string; // Stored as string to preserve precision for uint256 (JSON doesn't support bigint)
    data: string;
    operation: number;
    safeTxGas: number;
    baseGas: number;
    gasPrice: number;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
}

export interface SafeSignature {
    signer: string;
    data: string;
}

export interface TransactionData {
    safeAddress: string;
    safeTx: SafeTransaction;
    signatures: SafeSignature[];
    txHash: string;
    chainId: number;
    description?: string;
    parameters?: any;
    operations?: string[];
    createdAt: string;
}

// Backwards compatibility alias
export type SignedTransactionData = TransactionData;

export interface MetaTransaction {
    to: string;
    value: number | bigint | string; // Accepts string to preserve precision for uint256 values
    data: string;
    operation?: number; // 0 = Call, 1 = DelegateCall (only for MultiSend, not MultiSendCallOnly)
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
export function normalizeSignatureV(signature: string): string {
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

/**
 * Builds packed signature bytes from array of signatures.
 * Signatures MUST be sorted by signer address (ascending, case-insensitive).
 * This is a Gnosis Safe requirement.
 */
export function buildSignatureBytes(signatures: SafeSignature[]): string {
    // Sort by signer address (required by Safe)
    const sorted = [...signatures].sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));

    // Concatenate: remove '0x' prefix and join
    return `0x${sorted.map((s) => s.data.slice(2)).join('')}`;
}

/**
 * Builds a Safe transaction struct with default values for gas-related fields
 * @param params.value - Transaction value in wei. Accepts number, bigint, or string to avoid precision loss.
 */
export function buildSafeTransaction(params: {
    to: string;
    value?: number | bigint | string;
    data?: string;
    operation?: number;
    nonce: number;
}): SafeTransaction {
    // Convert value to string to preserve precision for uint256 values
    const valueStr = params.value !== undefined ? String(params.value) : '0';

    return {
        to: params.to,
        value: valueStr,
        data: params.data || '0x',
        operation: params.operation || 0, // 0 = Call, 1 = DelegateCall
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
        nonce: params.nonce,
    };
}

/**
 * Calculates the EIP-712 transaction hash for a Safe transaction
 */
export function calculateSafeTxHash(safeAddress: string, safeTx: SafeTransaction, chainId: bigint | number): string {
    return ethers.TypedDataEncoder.hash({ verifyingContract: safeAddress, chainId }, EIP712_SAFE_TX_TYPE, safeTx);
}

/**
 * Computes the next nonce to use for a Safe transaction.
 * Uses the highest nonce among transactions in the file for this Safe on this chain.
 * Some of those may already be executed - the max nonce is the source of truth for what's "claimed".
 *
 * @param onChainNonce - Current nonce from Safe.nonce()
 * @param transactionsForSafe - Transactions for this Safe on this chain (from transactions.json)
 * @returns Next nonce to use
 */
export function getNextNonce(onChainNonce: bigint | number, transactionsForSafe: TransactionData[]): number {
    const onChain = Number(onChainNonce);
    const maxInFile =
        transactionsForSafe.length > 0 ? Math.max(...transactionsForSafe.map((tx) => Number(tx.safeTx.nonce))) : -1;
    return maxInFile >= 0 ? Math.max(onChain, maxInFile + 1) : onChain;
}

/**
 * Filters transactions for a specific Safe on a specific chain.
 */
export function getTransactionsForSafe(
    transactions: TransactionData[],
    safeAddress: string,
    chainId: number,
): TransactionData[] {
    return transactions.filter(
        (tx) => tx.safeAddress.toLowerCase() === safeAddress.toLowerCase() && tx.chainId === chainId,
    );
}

/**
 * Loads transactions from a JSON file
 */
export function loadTransactions(filePath: string): TransactionData[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Saves transactions to a JSON file
 */
export function saveTransactions(filePath: string, transactions: TransactionData[]): void {
    fs.writeFileSync(filePath, JSON.stringify(transactions, null, 2));
}

/**
 * Finds a transaction by txHash
 */
export function findTransactionByHash(transactions: TransactionData[], txHash: string): TransactionData | undefined {
    return transactions.find((tx) => tx.txHash === txHash);
}

/**
 * Adds or updates a transaction in the list
 */
export function upsertTransaction(transactions: TransactionData[], transaction: TransactionData): TransactionData[] {
    const existingIndex = transactions.findIndex((tx) => tx.txHash === transaction.txHash);
    if (existingIndex >= 0) {
        transactions[existingIndex] = transaction;
    } else {
        transactions.push(transaction);
    }
    return transactions;
}

// Backwards compatibility aliases
export const loadSignedTransactions = loadTransactions;
export const saveSignedTransactions = saveTransactions;

/* //////////////////////////////////////////////////////////////
                        OWNER MANAGEMENT
////////////////////////////////////////////////////////////// */

/**
 * Finds the previous owner in the Safe's linked list.
 * Required for removeOwner operation.
 */
export async function findPrevOwner(safeAddress: string, ownerToRemove: string): Promise<string> {
    const safeContract = await ethers.getContractAt(SAFE_ABI, safeAddress);
    const owners = (await safeContract.getOwners()) as string[];

    const ownerIndex = owners.findIndex((o) => o.toLowerCase() === ownerToRemove.toLowerCase());

    if (ownerIndex === -1) {
        throw new Error(`Address ${ownerToRemove} is not an owner of this Safe`);
    }

    // First owner points to sentinel
    if (ownerIndex === 0) {
        return SENTINEL_ADDRESS;
    }

    return owners[ownerIndex - 1];
}

/**
 * Encodes an addOwnerWithThreshold call
 */
export function encodeAddOwner(newOwner: string, threshold: number): string {
    const iface = new ethers.Interface(SAFE_ABI);
    return iface.encodeFunctionData('addOwnerWithThreshold', [newOwner, threshold]);
}

/**
 * Encodes a removeOwner call
 */
export function encodeRemoveOwner(prevOwner: string, ownerToRemove: string, threshold: number): string {
    const iface = new ethers.Interface(SAFE_ABI);
    return iface.encodeFunctionData('removeOwner', [prevOwner, ownerToRemove, threshold]);
}

/**
 * Encodes a changeThreshold call
 */
export function encodeChangeThreshold(threshold: number): string {
    const iface = new ethers.Interface(SAFE_ABI);
    return iface.encodeFunctionData('changeThreshold', [threshold]);
}

/* //////////////////////////////////////////////////////////////
                            MULTISEND
////////////////////////////////////////////////////////////// */

/**
 * Encodes transactions for MultiSend / MultiSendCallOnly (Safe 1.3.0+)
 *
 * Format per transaction (packed encoding):
 *   - operation: 1 byte (uint8) - 0 for call, 1 for delegatecall
 *   - to: 20 bytes (address)
 *   - value: 32 bytes (uint256)
 *   - dataLength: 32 bytes (uint256)
 *   - data: variable bytes
 *
 * @see https://github.com/safe-global/safe-contracts/blob/v1.3.0/contracts/libraries/MultiSendCallOnly.sol
 */
export function encodeMultiSendTransactions(transactions: MetaTransaction[]): string {
    let encoded = '0x';

    for (const tx of transactions) {
        // Operation (1 byte) - default to 0 (CALL)
        const operation = tx.operation ?? 0;
        encoded += operation.toString(16).padStart(2, '0');

        // To address (20 bytes) - remove 0x prefix
        const to = ethers.getAddress(tx.to).slice(2).toLowerCase();
        encoded += to;

        // Value (32 bytes) - left-padded big-endian
        const value = BigInt(tx.value);
        encoded += value.toString(16).padStart(64, '0');

        // Data
        const data = tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data;

        // Data length (32 bytes) - length in bytes (hex chars / 2)
        const dataLength = data.length / 2;
        encoded += dataLength.toString(16).padStart(64, '0');

        // Data bytes
        encoded += data;
    }

    return encoded;
}

/**
 * Encodes a MultiSendCallOnly call for Safe 1.3.0+
 *
 * MultiSendCallOnly only supports CALL operations (no delegatecall).
 * It's safer and recommended for most use cases.
 *
 * @param transactions - Array of transactions to batch
 * @returns Encoded calldata to call multiSend on MultiSendCallOnly contract
 */
export function encodeMultiSendCallOnly(transactions: MetaTransaction[]): {
    to: string;
    data: string;
    operation: number;
    transactionCount: number;
} {
    // Force all operations to 0 (CALL) for MultiSendCallOnly
    const callOnlyTxs = transactions.map((tx) => ({ ...tx, operation: 0 }));

    // Encode the packed transactions
    const encodedTransactions = encodeMultiSendTransactions(callOnlyTxs);

    // Encode the multiSend(bytes) call
    const multiSendInterface = new ethers.Interface(['function multiSend(bytes memory transactions) public payable']);
    const data = multiSendInterface.encodeFunctionData('multiSend', [encodedTransactions]);

    return {
        to: MULTI_SEND_CALL_ONLY_ADDRESS,
        data,
        operation: 1, // DelegateCall - required for MultiSend to work
        transactionCount: transactions.length,
    };
}

/**
 * Encodes a MultiSend call for Safe 1.3.0+
 *
 * MultiSend supports both CALL and DELEGATECALL operations.
 * Use this when you need delegatecall support within the batch.
 *
 * @param transactions - Array of transactions to batch (can include operation: 1 for delegatecall)
 * @returns Encoded calldata to call multiSend on MultiSend contract
 */
export function encodeMultiSend(transactions: MetaTransaction[]): {
    to: string;
    data: string;
    operation: number;
    transactionCount: number;
} {
    // Encode the packed transactions
    const encodedTransactions = encodeMultiSendTransactions(transactions);

    // Encode the multiSend(bytes) call
    const multiSendInterface = new ethers.Interface(['function multiSend(bytes memory transactions) public payable']);
    const data = multiSendInterface.encodeFunctionData('multiSend', [encodedTransactions]);

    return {
        to: MULTI_SEND_ADDRESS,
        data,
        operation: 1, // DelegateCall - required for MultiSend to work
        transactionCount: transactions.length,
    };
}
