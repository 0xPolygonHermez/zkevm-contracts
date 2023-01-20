// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * This contract will be used as a helper for all the sparse merkle tree related functions
 * Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol
 */
contract DepositContract is Initializable {
    // Merkle tree levels
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // This ensures `depositCount` will fit into 32-bits
    uint256 internal constant _MAX_DEPOSIT_COUNT =
        2 ** _DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    // Branch array which contains the necessary sibilings to compute the next root when a new
    // leaf is inserted
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _branch;

    // Counter of current deposits
    uint256 public depositCount;

    /**
     * @notice Computes and returns the merkle root
     */
    function getDepositRoot() public view returns (bytes32) {
        bytes32 node;
        uint256 size = depositCount;
        bytes32 currentZeroHashHeight = 0;

        for (
            uint256 height = 0;
            height < _DEPOSIT_CONTRACT_TREE_DEPTH;
            height++
        ) {
            if ((size & 1) == 1)
                node = keccak256(abi.encodePacked(_branch[height], node));
            else
                node = keccak256(abi.encodePacked(node, currentZeroHashHeight));
            size /= 2;
            currentZeroHashHeight = keccak256(
                abi.encodePacked(currentZeroHashHeight, currentZeroHashHeight)
            );
        }
        return node;
    }

    /**
     * @notice Add a new leaf to the merkle tree
     * @param leafHash Leaf hash
     */
    function _deposit(bytes32 leafHash) internal {
        bytes32 node = leafHash;

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `_branch`)
        require(
            depositCount < _MAX_DEPOSIT_COUNT,
            "DepositContract:_deposit: Merkle tree full"
        );

        // Add deposit data root to Merkle tree (update a single `_branch` node)
        uint256 size = ++depositCount;
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
     * @param leafHash Leaf hash
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param root Merkle root
     */
    function verifyMerkleProof(
        bytes32 leafHash,
        bytes32[] memory smtProof,
        uint32 index,
        bytes32 root
    ) public pure returns (bool) {
        bytes32 node = leafHash;

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

    /**
     * @notice Given the leaf data returns the leaf value
     * @param leafType Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message
     * @param originNetwork Origin Network
     * @param originAddress [0] Origin token address, 0 address is reserved for ether, [1] msg.sender of the message
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount [0] Amount of tokens/ether, [1] Amount of ether
     * @param metadataHash Hash of the metadata
     */
    function getLeafValue(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    leafType,
                    originNetwork,
                    originAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadataHash
                )
            );
    }
}
