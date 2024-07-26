// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import {PolygonRollupManager} from "contracts/PolygonRollupManager.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IPolygonZkEVMBridgeV2Extended} from "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import {IPolygonZkEVMBridgeV2} from "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";

import {ERC20PermitMockDeployer} from "script/deployers/ERC20PermitMockDeployer.s.sol";
import {PolygonRollupManagerEmptyMockDeployer} from "script/deployers/PolygonRollupManagerEmptyMockDeployer.s.sol";
import {PolygonZkEVMEtrogDeployer, IPolygonZkEVMVEtrogErrors, TransparentUpgradeableProxy} from "script/deployers/PolygonZkEVMEtrogDeployer.s.sol";
import {PolygonZkEVMGlobalExitRootV2Deployer} from "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMEtrogTest is
    Test,
    ERC20PermitMockDeployer,
    PolygonRollupManagerEmptyMockDeployer,
    PolygonZkEVMEtrogDeployer,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    address proxyAdminOwner = makeAddr("proxyAdminOwner");
    address polTokenOwner = makeAddr("polTokenOwner");
    address trustedSequencer = makeAddr("trustedSequencer");
    address admin = makeAddr("admin");

    IPolygonZkEVMBridgeV2Extended polygonZkEVMBridge;
    IERC20Upgradeable pol;

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20_000_000 ether;

    string constant networkName = "zkevm";
    string constant sequencerURL = "http://zkevm-json-rpc:8123";
    uint32 networkIDMainnet = 0;
    uint32 networkIDRollup = 1;

    function setUp() public {
        pol = IERC20Upgradeable(
            deployERC20PermitMockImplementation(
                tokenName,
                tokenSymbol,
                polTokenOwner,
                tokenInitialBalance
            )
        );

        IPolygonZkEVMBridgeV2Extended polygonZkEVMBridgeImplementation = IPolygonZkEVMBridgeV2Extended(
                _preDeployPolygonZkEVMBridgeV2()
            );
        polygonZkEVMBridge = IPolygonZkEVMBridgeV2Extended(
            _proxify(address(polygonZkEVMBridgeImplementation))
        );

        deployPolygonRollupManagerEmptyMockTransparent(proxyAdminOwner);

        deployPolygonZkEVMGlobalExitRootV2Transparent(
            proxyAdminOwner,
            address(polygonRollupManagerEmptyMock),
            address(polygonZkEVMBridge)
        );

        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            0,
            polygonZkEVMGlobalExitRootV2,
            address(polygonRollupManagerEmptyMock),
            bytes("")
        );

        vm.prank(polTokenOwner);
        pol.transfer(trustedSequencer, 1_000 ether);

        deployPolygonZkEVMEtrogImplementation(
            polygonZkEVMGlobalExitRootV2,
            pol,
            IPolygonZkEVMBridgeV2(address(polygonZkEVMBridge)),
            PolygonRollupManager(address(polygonRollupManagerEmptyMock))
        );
    }

    // TODO: find out why the initialization fails
    function testRevert_initialize_onlyRollupManager() public {
        vm.expectRevert(IPolygonZkEVMVEtrogErrors.OnlyRollupManager.selector);
        _initializePolygonZkEVMEtrog();
    }

    function _initializePolygonZkEVMEtrog() internal {
        polygonZkEVMEtrog.initialize(
            admin,
            trustedSequencer,
            networkIDRollup,
            address(0),
            sequencerURL,
            networkName
        );
    }

    function _proxify(address logic) internal returns (address proxy) {
        TransparentUpgradeableProxy proxy_ = new TransparentUpgradeableProxy(
            logic,
            msg.sender,
            ""
        );
        return (address(proxy_));
    }

    function _preDeployPolygonZkEVMBridgeV2()
        internal
        returns (address implementation)
    {
        string[] memory exe = new string[](5);
        exe[0] = "forge";
        exe[1] = "inspect";
        exe[2] = "PolygonZkEVMBridgeV2";
        exe[3] = "bytecode";
        exe[
            4
        ] = "--contracts=contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";

        bytes memory creationCode = vm.ffi(exe);
        implementation = makeAddr("PolygonZkEVMBridgeV2");

        vm.etch(implementation, creationCode);
        (bool success, bytes memory runtimeBytecode) = implementation.call("");
        require(success, "Failed to predeploy PolygonZkEVMBridgeV2");
        vm.etch(implementation, runtimeBytecode);
    }
}
