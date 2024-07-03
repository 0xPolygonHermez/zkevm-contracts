// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import "contracts/mocks/ERC20PermitMock.sol";
import "contracts/PolygonZkEVMGlobalExitRootV2.sol";
import "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";

import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMBridgeV2Test is
    Test,
    PolygonZkEVMBridgeV2Deployer,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    IPolygonZkEVMBridgeV2Extended polygonZkEVMBridge;
    ERC20PermitMock pol;

    address deployer = makeAddr("deployer");
    address rollupManager = makeAddr("rollupManager");
    address user = makeAddr("user");
    address polygonZkEVMGlobalExitRootV2ProxyOwner =
        makeAddr("polygonZkEVMGlobalExitRootV2ProxyOwner");
    address polOwner = makeAddr("polOwner");
    address destinationAddress = makeAddr("destinationAddress");

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20000000 ether;
    uint256 constant tokenTransferAmount = 10 ether;

    uint256 constant LEAF_TYPE_ASSET = 0;
    uint256 constant LEAF_TYPE_MESSAGE = 1;

    uint32 constant networkIDMainnet = 0;
    uint32 constant networkIDRollup = 1;
    uint8 constant tokenDecimals = 18;
    bytes tokenMetaData = abi.encode(tokenName, tokenSymbol, tokenDecimals);

    // mapping(string functionName => mapping(string snapshotName => uint256 snapshotId))
    //     private snapshot;

    function setUp() public virtual {
        IPolygonZkEVMBridgeV2Extended polygonZkEVMBridgeImplementation = IPolygonZkEVMBridgeV2Extended(
                _preDeployPolygonZkEVMBridgeV2()
            );

        polygonZkEVMBridge = IPolygonZkEVMBridgeV2Extended(
            _proxify(address(polygonZkEVMBridgeImplementation))
        );

        address polygonZkEVMGlobalExitRootV2Proxy;
        (
            ,
            ,
            polygonZkEVMGlobalExitRootV2Proxy
        ) = deployPolygonZkEVMGlobalExitRootV2Transparent(
            polygonZkEVMGlobalExitRootV2ProxyOwner,
            rollupManager,
            address(polygonZkEVMBridge)
        );

        polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2(
            polygonZkEVMGlobalExitRootV2Proxy
        );

        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            "0x"
        );

        pol = new ERC20PermitMock(
            tokenName,
            tokenSymbol,
            polOwner,
            tokenInitialBalance
        );

        vm.prank(polOwner);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);
    }

    function test_initialization() public view {
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(0));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function testRevert_reinitialize() public {
        vm.expectRevert("Initializable: contract is already initialized");
        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            "0x"
        );
    }

    function testRevert_bridgeAsset_destinationNetworkInvalid() public {
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            "0x"
        );
    }

    function testRevert_bridgeAsset_amountDoesNotMatchMsgValue() public {
        // sending native asset
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.AmountDoesNotMatchMsgValue.selector
        );
        polygonZkEVMBridge.bridgeAsset( // msg.value = 0
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(0),
            true,
            "0x"
        );
    }

    function testRevert_bridgeAsset_msgValueNotZero() public {
        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.MsgValueNotZero.selector);
        polygonZkEVMBridge.bridgeAsset{value: 1 ether}(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            "0x"
        );
    }

    //TODO: add more tests

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
