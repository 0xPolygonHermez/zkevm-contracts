// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IBytecodeStorer {
    function INIT_BYTECODE_TRANSPARENT_PROXY()
        external
        pure
        returns (bytes memory);
}
