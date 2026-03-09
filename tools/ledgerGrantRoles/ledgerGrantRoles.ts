/**
 * Ledger Grant Roles - Grant PROPOSER_ROLE and EXECUTOR_ROLE on Timelock
 *
 * This script allows an account with the admin role on a Timelock contract
 * to grant itself the PROPOSER_ROLE and EXECUTOR_ROLE.
 *
 * Usage:
 *   LEDGER_ACCOUNT=0xYourAddress npx hardhat run tools/ledgerGrantRoles/ledgerGrantRoles.ts --network custom
 *
 * Environment:
 *   LEDGER_ACCOUNT    - Ledger address (enables hardware wallet signing)
 *   SIGNER_INDEX      - Index of signer to use (default: 0)
 *   CUSTOM_PROVIDER   - RPC URL for the target network
 */
/* eslint-disable import/no-unresolved */
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

import parameters from './parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/* //////////////////////////////////////////////////////////////
                            CONSTANTS
////////////////////////////////////////////////////////////// */

// Timelock role hashes
const TIMELOCK_ADMIN_ROLE = ethers.id('TIMELOCK_ADMIN_ROLE');
const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');

// Minimal TimelockController ABI - only functions we need
const TIMELOCK_ABI = [
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function getRoleAdmin(bytes32 role) view returns (bytes32)',
    'function grantRole(bytes32 role, address account)',
    'function PROPOSER_ROLE() view returns (bytes32)',
    'function EXECUTOR_ROLE() view returns (bytes32)',
    'function TIMELOCK_ADMIN_ROLE() view returns (bytes32)',
];

/* //////////////////////////////////////////////////////////////
                            MAIN
////////////////////////////////////////////////////////////// */

async function main() {
    // ═══════════════════════════════════════════════════════════
    // VALIDATE PARAMETERS
    // ═══════════════════════════════════════════════════════════

    const mandatoryParams = ['timelockAddress'];
    checkParams(parameters, mandatoryParams, true);

    const { timelockAddress } = parameters;

    // ═══════════════════════════════════════════════════════════
    // DISPLAY CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║       LEDGER - GRANT PROPOSER & EXECUTOR ROLES           ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Timelock Address: ${timelockAddress}`);

    // ═══════════════════════════════════════════════════════════
    // CONNECT TO NETWORK
    // ═══════════════════════════════════════════════════════════

    const { chainId } = await ethers.provider.getNetwork();
    logger.info(`  Chain ID:         ${chainId}`);
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
    if (process.env.LEDGER_ACCOUNT) {
        logger.info('  (Using Ledger hardware wallet)');
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // LOAD TIMELOCK CONTRACT
    // ═══════════════════════════════════════════════════════════

    const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, signer);

    // Get role hashes from contract (for verification)
    const contractProposerRole = await timelockContract.PROPOSER_ROLE();
    const contractExecutorRole = await timelockContract.EXECUTOR_ROLE();

    logger.info('Timelock Roles:');
    logger.info(`  PROPOSER_ROLE:        ${contractProposerRole}`);
    logger.info(`  EXECUTOR_ROLE:        ${contractExecutorRole}`);
    logger.info(`  TIMELOCK_ADMIN_ROLE:  ${TIMELOCK_ADMIN_ROLE}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // CHECK ADMIN ROLE
    // ═══════════════════════════════════════════════════════════

    logger.info('Checking signer roles...');

    const hasTimelockAdminRole = await timelockContract.hasRole(TIMELOCK_ADMIN_ROLE, signerAddress);

    logger.info(`  Has TIMELOCK_ADMIN_ROLE: ${hasTimelockAdminRole ? '✅ Yes' : '❌ No'}`);

    if (!hasTimelockAdminRole) {
        logger.error('');
        logger.error('❌ ERROR: Signer does not have TIMELOCK_ADMIN_ROLE on Timelock!');
        logger.error('   The signer must have TIMELOCK_ADMIN_ROLE to grant roles.');
        process.exit(1);
    }

    // Check current proposer/executor status
    const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, signerAddress);
    const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, signerAddress);

    logger.info(`  Has PROPOSER_ROLE:       ${hasProposerRole ? '✅ Yes' : '❌ No'}`);
    logger.info(`  Has EXECUTOR_ROLE:       ${hasExecutorRole ? '✅ Yes' : '❌ No'}`);
    logger.info('');

    // Check if both roles already granted
    if (hasProposerRole && hasExecutorRole) {
        logger.info('╔══════════════════════════════════════════════════════════╗');
        logger.info('║                 ALREADY HAS BOTH ROLES                   ║');
        logger.info('╚══════════════════════════════════════════════════════════╝');
        logger.info('');
        logger.info('✅ Signer already has both PROPOSER_ROLE and EXECUTOR_ROLE.');
        logger.info('   No transactions needed.');
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // GRANT PROPOSER ROLE
    // ═══════════════════════════════════════════════════════════

    if (!hasProposerRole) {
        logger.info('Granting PROPOSER_ROLE...');
        logger.info('  (Confirm on Ledger device if using hardware wallet)');

        const tx1 = await timelockContract.grantRole(PROPOSER_ROLE, signerAddress);
        logger.info(`  Transaction sent: ${tx1.hash}`);

        const receipt1 = await tx1.wait();
        logger.info(`  ✅ PROPOSER_ROLE granted! Block: ${receipt1?.blockNumber}`);
        logger.info('');
    } else {
        logger.info('⏭️  Skipping PROPOSER_ROLE (already granted)');
        logger.info('');
    }

    // ═══════════════════════════════════════════════════════════
    // GRANT EXECUTOR ROLE
    // ═══════════════════════════════════════════════════════════

    if (!hasExecutorRole) {
        logger.info('Granting EXECUTOR_ROLE...');
        logger.info('  (Confirm on Ledger device if using hardware wallet)');

        const tx2 = await timelockContract.grantRole(EXECUTOR_ROLE, signerAddress);
        logger.info(`  Transaction sent: ${tx2.hash}`);

        const receipt2 = await tx2.wait();
        logger.info(`  ✅ EXECUTOR_ROLE granted! Block: ${receipt2?.blockNumber}`);
        logger.info('');
    } else {
        logger.info('⏭️  Skipping EXECUTOR_ROLE (already granted)');
        logger.info('');
    }

    // ═══════════════════════════════════════════════════════════
    // VERIFY ROLES
    // ═══════════════════════════════════════════════════════════

    logger.info('Verifying roles...');

    const finalProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, signerAddress);
    const finalExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, signerAddress);

    logger.info(`  PROPOSER_ROLE: ${finalProposerRole ? '✅ Granted' : '❌ Not granted'}`);
    logger.info(`  EXECUTOR_ROLE: ${finalExecutorRole ? '✅ Granted' : '❌ Not granted'}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    if (finalProposerRole && finalExecutorRole) {
        logger.info('╔══════════════════════════════════════════════════════════╗');
        logger.info('║                     SUCCESS                              ║');
        logger.info('╚══════════════════════════════════════════════════════════╝');
        logger.info('');
        logger.info(`✅ Account ${signerAddress} now has:`);
        logger.info('   - PROPOSER_ROLE (can schedule transactions)');
        logger.info('   - EXECUTOR_ROLE (can execute ready transactions)');
        logger.info('');
        logger.info(`   on Timelock: ${timelockAddress}`);
    } else {
        logger.error('');
        logger.error('❌ Something went wrong. Not all roles were granted.');
        process.exit(1);
    }
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
