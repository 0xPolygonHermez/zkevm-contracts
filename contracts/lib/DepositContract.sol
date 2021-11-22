// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

/**
 * This contract will be used as a helper for all the sparse merkle tree related functions
 * Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol
 */
contract DepositContract {
    // Merkle tree levels
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // This ensures `depositCount` will fit into 32-bits
    uint256 internal constant _MAX_DEPOSIT_COUNT =
        2**_DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    // Branch array which contains the necessary sibilings to compute the next root when a new
    // leaf is inserted
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _branch;

    // Result of hashing zeroes for every level of the tree
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _zeroHashes;

    // Counter of current deposits
    uint256 public depositCount;

    constructor() {
        // Compute hashes in empty sparse Merkle tree
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH - 1;
            height++
        )
            _zeroHashes[height + 1] = keccak256(
                abi.encodePacked(_zeroHashes[height], _zeroHashes[height])
            );
    }

    /**
     * @notice Computes and returns the merkle root
     */
    function getDepositRoot() public view returns (bytes32) {
        bytes32 node;
        uint256 size = depositCount;
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if ((size & 1) == 1)
                node = keccak256(abi.encodePacked(_branch[height], node));
            else node = keccak256(abi.encodePacked(node, _zeroHashes[height]));
            size /= 2;
        }
        return node;
    }

    /**
     * @notice Add a new leaf to the merkle tree
     * @param token Token address, 0 address is reserved for ether
     * @param amount Amount of tokens
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     */
    function _deposit(
        address token,
        uint256 amount,
        uint32 destinationNetwork,
        address destinationAddress
    ) internal {
        // Compute new leaf
        bytes32 node = keccak256(
            abi.encodePacked(
                uint32(0), // Original network mainnet
                token,
                amount,
                destinationNetwork,
                destinationAddress
            )
        );

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `_branch`)
        require(
            depositCount < _MAX_DEPOSIT_COUNT,
            "DepositContract:_deposit: MERKLE_TREE_FULL"
        );

        // Add deposit data root to Merkle tree (update a single `_branch` node)
        depositCount += 1;
        uint256 size = depositCount;
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if ((size & 1) == 1) {
                _branch[height] = node;
                return;
            }
            node = keccak256(abi.encodePacked(_branch[height], node));
            size /= 2;
        }
        // As the loop should always end prematurely with the `return` statement,
        // this code should be unreachable. We assert `false` just to be safe.
        assert(false);
    }

    /**
     * @notice Verify merkle proof
     * @param token  Token address, 0 address is reserved for ehter
     * @param amount Amount of tokens
     * @param originalNetwork Origin Network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param root Merkle root
     */
    function verifyMerkleProof(
        address token,
        uint256 amount,
        uint32 originalNetwork,
        uint32 destinationNetwork,
        address destinationAddress,
        bytes32[] memory smtProof,
        uint64 index,
        bytes32 root
    ) public pure returns (bool) {
        // Calculate node
        bytes32 node = keccak256(
            abi.encodePacked(
                originalNetwork,
                token,
                amount,
                destinationNetwork,
                destinationAddress
            )
        );

        // Check merkle proof
        uint256 currrentIndex = index;
        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if ((currrentIndex & 1) == 1)
                node = keccak256(abi.encodePacked(smtProof[height], node));
            else node = keccak256(abi.encodePacked(node, smtProof[height]));
            currrentIndex /= 2;
        }

        return node == root;
    }
}
