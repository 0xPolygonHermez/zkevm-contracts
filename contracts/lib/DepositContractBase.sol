// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "./Hashes.sol";

/**
 * This contract will be used as a helper for all the sparse merkle tree related functions
 * Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol
 */
contract DepositContractBase {
    /**
     * @dev Thrown when the merkle tree is full
     */
    error MerkleTreeFull();

    /**
     * @dev Thrown when the new deposit count exceeds the maximum allowed
     */
    error NewDepositCountExceedsMax();

    /**
     * @dev Thrown when subtree frontier element doesn't match the expected proof sibling
     */
    error SubtreeFrontierMismatch();

    /**
     * @dev Thrown when non-matched frontier positions contain non-zero values
     */
    error NonZeroValueForUnusedFrontier();

    // Merkle tree levels
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // This ensures `depositCount` will fit into 32-bits
    uint256 internal constant _MAX_DEPOSIT_COUNT =
        2 ** _DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    // Branch array which contains the necessary siblings to compute the next root when a new
    // leaf is inserted
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _branch;

    // Counter of current deposits
    uint256 public depositCount;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[10] private __gap;

    /**
     * @notice Computes and returns the merkle root
     */
    function getRoot() public view virtual returns (bytes32) {
        bytes32 node;
        uint256 size = depositCount;
        bytes32 currentZeroHashHeight = 0;

        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if (((size >> height) & 1) == 1)
                node = Hashes.efficientKeccak256(_branch[height], node);
            else node = Hashes.efficientKeccak256(node, currentZeroHashHeight);

            currentZeroHashHeight = Hashes.efficientKeccak256(
                currentZeroHashHeight,
                currentZeroHashHeight
            );
        }
        return node;
    }

    /**
     * @notice Add a new leaf to the merkle tree
     * @param leaf Leaf
     */
    function _addLeaf(bytes32 leaf) internal {
        bytes32 node = leaf;

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `_branch`)
        if (depositCount >= _MAX_DEPOSIT_COUNT) {
            revert MerkleTreeFull();
        }

        // Add deposit data root to Merkle tree (update a single `_branch` node)
        uint256 size = ++depositCount;
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if (((size >> height) & 1) == 1) {
                _branch[height] = node;
                return;
            }
            node = Hashes.efficientKeccak256(_branch[height], node);
        }
        // As the loop should always end prematurely with the `return` statement,
        // this code should be unreachable. We assert `false` just to be safe.
        assert(false);
    }

    /**
     * @notice Verify merkle proof
     * @param leafHash Leaf hash
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param root Merkle root
     */
    function verifyMerkleProof(
        bytes32 leafHash,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint32 index,
        bytes32 root
    ) internal pure virtual returns (bool) {
        return calculateRoot(leafHash, smtProof, index) == root;
    }

    /**
     * @notice Calculate root from merkle proof
     * @param leafHash Leaf hash
     * @param smtProof Smt proof
     * @param index Index of the leaf
     */
    function calculateRoot(
        bytes32 leafHash,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint32 index
    ) internal pure virtual returns (bytes32) {
        bytes32 node = leafHash;

        // Compute root
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if (((index >> height) & 1) == 1)
                node = Hashes.efficientKeccak256(smtProof[height], node);
            else node = Hashes.efficientKeccak256(node, smtProof[height]);
        }

        return node;
    }

    /**
     * @notice Validates that a frontier represents a valid subtree
     * @dev Checks that frontier elements match Merkle proof siblings at appropriate heights
     * @dev Also enforces that non-matched frontier positions are set to zero for clean data
     * @param subTreeLeafCount The number of leaves in the subtree
     * @param subTreeFrontier The proposed frontier of the subtree (unused positions must be zero)
     * @param currentTreeProof The Merkle proof siblings from the current tree
     */
    function _checkValidSubtreeFrontier(
        uint256 subTreeLeafCount,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata subTreeFrontier,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata currentTreeProof
    ) internal pure {
        // Verify subtree frontier consistency with the proof
        uint256 index = subTreeLeafCount;
        uint256 height = 0;

        // Check each height where subtree frontier should have elements
        while (index != 0 && height < _DEPOSIT_CONTRACT_TREE_DEPTH) {
            if ((index & 1) == 1) {
                // At this height, subtree has an element that must match proof sibling
                if (subTreeFrontier[height] != currentTreeProof[height]) {
                    revert SubtreeFrontierMismatch();
                }
            } else {
                // If bit is 0, subtree doesn't have element at this height
                // Enforce that non-matched frontier positions are set to zero
                // to prevent random values and ensure clean frontier data.
                // This way, a zero frontier would match depositCount=0 as in the SC
                if (subTreeFrontier[height] != bytes32(0)) {
                    revert NonZeroValueForUnusedFrontier();
                }
            }

            height++;
            index >>= 1;
        }

        // Ensure all remaining frontier positions beyond the subtree size are zero
        while (height < _DEPOSIT_CONTRACT_TREE_DEPTH) {
            if (subTreeFrontier[height] != bytes32(0)) {
                revert NonZeroValueForUnusedFrontier();
            }
            height++;
        }
    }
}
