// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

/**
 * @dev Define interface verifier
 */
interface VerifierRollupInterface {
    function verifyProof(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[1] calldata input
    ) external view returns (bool);
}
