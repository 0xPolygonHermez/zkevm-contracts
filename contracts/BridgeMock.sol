// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * This is totally a mock contract, there's jsut enough to test the proof of efficiency contract
 */
contract BridgeMock is Ownable {
    // Global exit root, this will be updated every time a batch is verified
    bytes32 public currentGlobalExitRoot;

    // Rollup exit root, this will be updated every time a batch is verified
    bytes32 public rollupExitRoot;

    // mainnet exit root, updated every deposit
    bytes32 public mainnetExitRoot;

    // Rollup contract address
    address public rollupAddress;

    /**
     * @param _rollupAddress Rollup contract address
     */
    constructor(address _rollupAddress) {
        rollupAddress = _rollupAddress;
        _updateGlobalExitRoot();
    }

    // register function? maybe governance should add exit trees?
    //function register() public onlyOwner {
    //
    // }
    function deposit() public {
        //check deposit eth2.0
        // this will be just a mock function
        mainnetExitRoot = bytes32(uint256(mainnetExitRoot) + 1);
        _updateGlobalExitRoot();
    }

    function updateRollupExitRoot(bytes32 newRollupExitRoot) public {
        require(
            msg.sender == rollupAddress,
            "BridgeMock::updateRollupExitRoot: ONLY_ROLLUP"
        );
        rollupExitRoot = newRollupExitRoot;
        _updateGlobalExitRoot();
    }

    function _updateGlobalExitRoot() internal {
        currentGlobalExitRoot = keccak256(
            abi.encode(mainnetExitRoot, rollupExitRoot)
        );
    }
}
