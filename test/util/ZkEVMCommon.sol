// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

abstract contract ZkEVMCommon is Test {
    string constant MERKLE_TREE_HEIGHT = "32"; // As of now, the height of the Merkle tree is fixed to 32

    function _encodeLeaves(
        bytes32[] memory leaves
    ) public pure returns (string memory encodedLeaves) {
        for (uint i = 0; i < leaves.length; i++) {
            encodedLeaves = string(
                abi.encodePacked(
                    encodedLeaves,
                    _bytes32ToHex(abi.encodePacked(leaves[i]))
                )
            );
        }
    }

    function _getMerkleTreeRoot(
        string memory encodedLeaves
    ) public returns (bytes32) {
        string[] memory operation = new string[](5);
        operation[0] = "node";
        operation[1] = "tools/zkevm-commonjs-wrapper";
        operation[2] = "makeTreeAndGetRoot";
        operation[3] = MERKLE_TREE_HEIGHT;
        operation[4] = encodedLeaves;

        bytes memory result = vm.ffi(operation);
        return abi.decode(result, (bytes32));
    }

    function _getProofByIndex(
        string memory encodedLeaves,
        string memory index
    ) public returns (bytes32[32] memory) {
        string[] memory operation = new string[](6);
        operation[0] = "node";
        operation[1] = "tools/zkevm-commonjs-wrapper";
        operation[2] = "makeTreeAndGetProofByIndex";
        operation[3] = MERKLE_TREE_HEIGHT;
        operation[4] = encodedLeaves;
        operation[5] = index;

        bytes memory result = vm.ffi(operation);
        return abi.decode(result, (bytes32[32]));
    }

    function _bytes32ToHex(
        bytes memory buffer
    ) internal pure returns (string memory) {
        bytes memory converted = new bytes(buffer.length * 2);

        bytes memory _base = "0123456789abcdef";

        for (uint256 i = 0; i < buffer.length; i++) {
            converted[i * 2] = _base[uint8(buffer[i]) / _base.length];
            converted[i * 2 + 1] = _base[uint8(buffer[i]) % _base.length];
        }

        return string(abi.encodePacked(converted)); // do not append "0x" prefix for encoding
    }
}
