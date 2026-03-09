// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {AgglayerGER, BaseTest} from "test/forge/base/BaseTest.t.sol";
import {Constants} from "test/forge/utils/Constants.sol";
import {IBaseLegacyAgglayerGER} from "contracts/interfaces/IBaseLegacyAgglayerGER.sol";

/**
 * @title AgglayerGERFuzz
 * @notice Fuzz tests for the AgglayerGER contract
 * @dev Tests various edge cases and boundary conditions using property-based testing
 */
contract AgglayerGERFuzz is BaseTest {
    function setUp() public override {
        super.setUp();
    }

    function testFuzz_RevertIf_nonBridgeOrRollupManager_updateExitRoot(address caller, bytes32 newRoot) public {
        // @todo change addresses according to the setup in BaseTest once updated
        vm.assume(caller != Constants.BRIDGE_ADDRESS && caller != Constants.ROLLUP_MANAGER_ADDRESS && caller != address(proxyAdmin));

        vm.expectRevert(abi.encodeWithSelector(IBaseLegacyAgglayerGER.OnlyAllowedContracts.selector));

        vm.prank(caller);
        agglayerGER.updateExitRoot(newRoot);
    }
}
