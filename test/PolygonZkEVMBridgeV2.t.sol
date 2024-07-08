// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "test/util/TestHelpers.sol";

import {ZkEVMCommon} from "test/util/ZkEVMCommon.sol";

import "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import "contracts/lib/TokenWrapped.sol";
import "contracts/mocks/ERC20PermitMock.sol";
import "contracts/PolygonZkEVMGlobalExitRootV2.sol";

import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMBridgeV2Test is
    Test,
    TestHelpers,
    ZkEVMCommon,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    struct ClaimPayload {
        bytes32[32] proofMainnet;
        bytes32[32] proofRollup;
        uint256 globalIndex;
        bytes32 mainnetExitRoot;
        bytes32 rollupExitRoot;
        uint32 originNetwork;
        address originAddress;
        uint32 destinationNetwork;
        address destinationAddress;
        uint256 amount;
        bytes metadata;
    }

    IPolygonZkEVMBridgeV2Extended polygonZkEVMBridge;
    ERC20PermitMock pol;

    address deployer = makeAddr("deployer");
    address rollupManager = makeAddr("rollupManager");
    address user = makeAddr("user");
    address polygonZkEVMGlobalExitRootV2ProxyOwner =
        makeAddr("polygonZkEVMGlobalExitRootV2ProxyOwner");
    address polOwner = makeAddr("polOwner");
    address destinationAddress = makeAddr("destinationAddress");
    address wethCalculated;
    address dummyTokenAddress = makeAddr("dummyTokenAddress");

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20_000_000 ether;
    uint256 constant tokenTransferAmount = 10 ether;

    string constant WETH_NAME = "Wrapped Ether";
    string constant WETH_SYMBOL = "WETH";

    uint256 constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;

    uint32 constant networkIDMainnet = 0;
    uint32 constant networkIDRollup = 1;
    uint8 constant tokenDecimals = 18;
    uint8 constant WETH_DECIMALS = 18;
    uint8 constant LEAF_TYPE_ASSET = 0;
    uint8 constant LEAF_TYPE_MESSAGE = 1;

    bytes tokenMetaData = abi.encode(tokenName, tokenSymbol, tokenDecimals);
    bytes wethMetaData = abi.encode(WETH_NAME, WETH_SYMBOL, WETH_DECIMALS);

    event BridgeEvent(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes metadata,
        uint32 depositCount
    );

    event ClaimEvent(
        uint256 globalIndex,
        uint32 originNetwork,
        address originAddress,
        address destinationAddress,
        uint256 amount
    );

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

        pol = new ERC20PermitMock(
            tokenName,
            tokenSymbol,
            polOwner,
            tokenInitialBalance
        );

        bytes memory bytecode = polygonZkEVMBridge
            .BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        bytes memory creationCode = abi.encodePacked(
            bytecode,
            abi.encode(WETH_NAME, WETH_SYMBOL, WETH_DECIMALS)
        );
        wethCalculated = vm.computeCreate2Address(
            0, // salt
            keccak256(creationCode),
            address(polygonZkEVMBridge)
        );
    }

    function test_initialize_gasTokenNotPresent() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(0));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function test_initialize_gasTokenPresent() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.WETHToken(), wethCalculated);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(pol));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenMetadata(), tokenMetaData);

        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function testRevert_initialize_gasTokenNetworkMustBeZeroOnEther() public {
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended
                .GasTokenNetworkMustBeZeroOnEther
                .selector
        );
        _initializePolygonZkEVMBridge(address(0), networkIDRollup, bytes(""));
    }

    function testRevert_initialize_reinitialize() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert("Initializable: contract is already initialized");
        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDMainnet, // same network as bridge
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_amountDoesNotMatchMsgValue() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        // sending native asset
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.AmountDoesNotMatchMsgValue.selector
        );
        polygonZkEVMBridge.bridgeAsset( // msg.value = 0 && msg.value != tokenTransferAmount
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(0),
            true,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_msgValueNotZero() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.MsgValueNotZero.selector);
        polygonZkEVMBridge.bridgeAsset{value: tokenTransferAmount}(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
    }

    function test_bridgeAsset_assetIsTheGasToken() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(address(polygonZkEVMBridge));
        TokenWrapped(wethCalculated).mint(user, tokenTransferAmount);
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(user),
            tokenTransferAmount
        );

        vm.prank(user);
        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(0),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            bytes(""),
            0
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            wethCalculated,
            true,
            bytes("")
        );
        assertEq(TokenWrapped(wethCalculated).balanceOf(user), 0);
        assertEq(polygonZkEVMBridge.lastUpdatedDepositCount(), 1);
    }

    function test_bridgeAsset_assetIsTokenOnTheBridgeNetwork() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(polOwner);
        pol.mint(user, tokenTransferAmount);
        assertEq(pol.balanceOf(user), tokenTransferAmount);

        vm.startPrank(user);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            tokenMetaData,
            0
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
        vm.stopPrank();
        assertEq(
            pol.balanceOf(address(polygonZkEVMBridge)),
            tokenTransferAmount
        );
        assertEq(pol.balanceOf(user), 0);
        assertEq(polygonZkEVMBridge.lastUpdatedDepositCount(), 1);
    }

    function test_bridgeAsset_verifyProof() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        vm.prank(polOwner);
        pol.mint(user, tokenTransferAmount);

        vm.startPrank(user);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
        vm.stopPrank();

        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);
        assertEq(polygonZkEVMBridge.getRoot(), calculatedMainnetExitRoot);

        bytes32[32] memory proof = _getProofByIndex(encodedLeaves, "0");
        assertEq(
            polygonZkEVMBridge.verifyMerkleProof(
                leaf,
                proof,
                0,
                polygonZkEVMBridge.getRoot()
            ),
            true
        );
    }

    function testRevert_bridgeMessage_noValueInMessagesOnGasTokenNetworks()
        public
    {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended
                .NoValueInMessagesOnGasTokenNetworks
                .selector
        );
        polygonZkEVMBridge.bridgeMessage{value: tokenTransferAmount}(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );
    }

    function testRevert_bridgeMessage_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeMessage(
            networkIDMainnet, // same network as bridge
            destinationAddress,
            true,
            bytes("")
        );
    }

    function test_bridgeMessage() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDRollup,
            destinationAddress,
            0,
            bytes(""),
            0
        );
        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );
    }

    function test_bridgeMessage_verifyProof() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDRollup,
            destinationAddress,
            0,
            keccak256(abi.encodePacked(bytes("")))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );

        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);
        assertEq(polygonZkEVMBridge.getRoot(), calculatedMainnetExitRoot);

        bytes32[32] memory proof = _getProofByIndex(encodedLeaves, "0");
        assertEq(
            polygonZkEVMBridge.verifyMerkleProof(
                leaf,
                proof,
                0,
                polygonZkEVMBridge.getRoot()
            ),
            true
        );
    }

    function testRevert_bridgeMessageWETH_nativeTokenIsEther() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.NativeTokenIsEther.selector
        );
        polygonZkEVMBridge.bridgeMessageWETH(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            true,
            wethMetaData
        );
    }

    function test_bridgeMessageWETH() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(address(polygonZkEVMBridge));
        TokenWrapped(wethCalculated).mint(user, tokenTransferAmount);
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(user),
            tokenTransferAmount
        );

        vm.prank(user);
        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            user,
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            wethMetaData,
            0
        );
        polygonZkEVMBridge.bridgeMessageWETH(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            true,
            wethMetaData
        );
        assertEq(TokenWrapped(wethCalculated).balanceOf(user), 0);
    }

    function test_bridgeMessageWETH_verifyProof() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            user,
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(bytes("")))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        vm.prank(address(polygonZkEVMBridge));
        TokenWrapped(wethCalculated).mint(user, tokenTransferAmount);

        vm.startPrank(user);
        polygonZkEVMBridge.bridgeMessageWETH(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            true,
            bytes("")
        );
        vm.stopPrank();

        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);
        assertEq(polygonZkEVMBridge.getRoot(), calculatedMainnetExitRoot);

        bytes32[32] memory proof = _getProofByIndex(encodedLeaves, "0");
        assertEq(
            polygonZkEVMBridge.verifyMerkleProof(
                leaf,
                proof,
                0,
                polygonZkEVMBridge.getRoot()
            ),
            true
        );
    }

    function testRevert_claimAsset_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32[32] memory smtEmptyProof;
        ClaimPayload memory payload = ClaimPayload({
            proofMainnet: smtEmptyProof,
            proofRollup: smtEmptyProof,
            globalIndex: 0,
            mainnetExitRoot: bytes32(0),
            rollupExitRoot: bytes32(0),
            originNetwork: networkIDMainnet,
            originAddress: address(pol),
            destinationNetwork: networkIDRollup, // invalid destination network
            destinationAddress: destinationAddress,
            amount: tokenTransferAmount,
            metadata: tokenMetaData
        });

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimAsset_globalExitRootInvalid() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32[32] memory smtEmptyProof;
        ClaimPayload memory payload = ClaimPayload({
            proofMainnet: smtEmptyProof,
            proofRollup: smtEmptyProof,
            globalIndex: 0,
            mainnetExitRoot: bytes32(0), // invalid mainnetExitRoot
            rollupExitRoot: bytes32(0), // invalid rollupExitRoot
            originNetwork: networkIDMainnet,
            originAddress: address(pol),
            destinationNetwork: networkIDMainnet,
            destinationAddress: destinationAddress,
            amount: tokenTransferAmount,
            metadata: tokenMetaData
        });

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.GlobalExitRootInvalid.selector
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimAsset_onSameNetwork_invalidSmtProof() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount + 1; // invalidate proof by changing leaf value
        payload.metadata = tokenMetaData;

        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.InvalidSmtProof.selector);
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimAsset_onDiffNetwork_invalidSmtProof() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDRollup,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory mainnetLeaves = new bytes32[](2);
        mainnetLeaves[0] = leaf;
        mainnetLeaves[1] = leaf;
        string memory encodedLeaves = _encodeLeaves(mainnetLeaves);

        ClaimPayload memory payload;
        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        bytes32[] memory rollupLeaves = new bytes32[](10);
        for (uint256 i = 0; i < 10; i++) {
            rollupLeaves[i] = calculatedMainnetExitRoot;
        }
        string memory encodedRollupLeaves = _encodeLeaves(rollupLeaves);
        payload.rollupExitRoot = _getMerkleTreeRoot(encodedRollupLeaves);

        vm.prank(rollupManager);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.rollupExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
            payload.rollupExitRoot
        );

        payload.mainnetExitRoot = polygonZkEVMGlobalExitRootV2
            .lastMainnetExitRoot();

        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            keccak256(
                abi.encodePacked(
                    payload.mainnetExitRoot,
                    payload.rollupExitRoot
                )
            )
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.proofRollup = _getProofByIndex(encodedRollupLeaves, "5");
        payload.globalIndex = _computeGlobalIndex(0, 5, false);
        payload.originNetwork = networkIDRollup;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount + 1; //  invalidate proof by changing leaf value
        payload.metadata = tokenMetaData;

        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.InvalidSmtProof.selector);
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimAsset_alreadyClaimed() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = tokenMetaData;

        vm.deal(address(polygonZkEVMBridge), tokenTransferAmount);

        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(destinationAddress.balance, tokenTransferAmount);
        assertEq(address(polygonZkEVMBridge).balance, 0);

        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.AlreadyClaimed.selector);
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function test_claimAsset_assetIsNativeToken() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(bytes("")))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(0);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = bytes("");

        vm.deal(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(destinationAddress.balance, tokenTransferAmount);
        assertEq(address(polygonZkEVMBridge).balance, 0);
    }

    function test_claimAsset_assetIsNativeTokenWETH() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(bytes("")))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(0);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = bytes("");

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(destinationAddress),
            tokenTransferAmount
        );
    }

    function test_claimAsset_assetIsGasToken() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = tokenMetaData;

        vm.deal(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(destinationAddress.balance, tokenTransferAmount);
        assertEq(address(polygonZkEVMBridge).balance, 0);
    }

    function test_claimAsset_assetIsTokenOnSameNetwork() public {
        _initializePolygonZkEVMBridge(
            dummyTokenAddress,
            networkIDMainnet,
            bytes("")
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = tokenMetaData;

        vm.prank(polOwner);
        pol.mint(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(polygonZkEVMBridge.isClaimed(0, 0), true);
        assertEq(pol.balanceOf(destinationAddress), tokenTransferAmount);
        assertEq(pol.balanceOf(address(polygonZkEVMBridge)), 0);
    }

    function test_claimAsset_assetIsNewTokenOnDiffNetwork() public {
        _initializePolygonZkEVMBridge(
            dummyTokenAddress,
            networkIDMainnet,
            bytes("")
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDRollup,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory mainnetLeaves = new bytes32[](2);
        mainnetLeaves[0] = leaf;
        mainnetLeaves[1] = leaf;
        string memory encodedLeaves = _encodeLeaves(mainnetLeaves);

        ClaimPayload memory payload;
        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        bytes32[] memory rollupLeaves = new bytes32[](10);
        for (uint256 i = 0; i < 10; i++) {
            rollupLeaves[i] = calculatedMainnetExitRoot;
        }
        string memory encodedRollupLeaves = _encodeLeaves(rollupLeaves);
        payload.rollupExitRoot = _getMerkleTreeRoot(encodedRollupLeaves);

        vm.prank(rollupManager);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.rollupExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
            payload.rollupExitRoot
        );

        payload.mainnetExitRoot = polygonZkEVMGlobalExitRootV2
            .lastMainnetExitRoot();

        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            keccak256(
                abi.encodePacked(
                    payload.mainnetExitRoot,
                    payload.rollupExitRoot
                )
            )
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.proofRollup = _getProofByIndex(encodedRollupLeaves, "5");
        payload.globalIndex = _computeGlobalIndex(0, 5, false);
        payload.originNetwork = networkIDRollup;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = tokenMetaData;

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(polygonZkEVMBridge.isClaimed(0, 5 + 1), true);

        address wrappedTokenAddress = polygonZkEVMBridge
            .precalculatedWrapperAddress(
                payload.originNetwork,
                address(pol),
                tokenName,
                tokenSymbol,
                tokenDecimals
            );
        assertEq(
            TokenWrapped(wrappedTokenAddress).balanceOf(destinationAddress),
            tokenTransferAmount
        );
    }

    function test_claimAsset_assetIsExistingTokenOnDiffNetwork() public {
        _initializePolygonZkEVMBridge(
            dummyTokenAddress,
            networkIDMainnet,
            bytes("")
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDRollup,
            address(pol),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory mainnetLeaves = new bytes32[](2);
        mainnetLeaves[0] = leaf;
        mainnetLeaves[1] = leaf;
        string memory encodedLeaves = _encodeLeaves(mainnetLeaves);

        ClaimPayload memory payload;
        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        bytes32[] memory rollupLeaves = new bytes32[](10);
        for (uint256 i = 0; i < 10; i++) {
            rollupLeaves[i] = calculatedMainnetExitRoot;
        }
        string memory encodedRollupLeaves = _encodeLeaves(rollupLeaves);
        payload.rollupExitRoot = _getMerkleTreeRoot(encodedRollupLeaves);

        vm.prank(rollupManager);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.rollupExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
            payload.rollupExitRoot
        );

        payload.mainnetExitRoot = polygonZkEVMGlobalExitRootV2
            .lastMainnetExitRoot();

        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            keccak256(
                abi.encodePacked(
                    payload.mainnetExitRoot,
                    payload.rollupExitRoot
                )
            )
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.proofRollup = _getProofByIndex(encodedRollupLeaves, "5");
        payload.globalIndex = _computeGlobalIndex(0, 5, false);
        payload.originNetwork = networkIDRollup;
        payload.originAddress = address(pol);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = tokenMetaData;

        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "1");
        payload.proofRollup = _getProofByIndex(encodedRollupLeaves, "5");
        payload.globalIndex = _computeGlobalIndex(1, 5, false);
        polygonZkEVMBridge.claimAsset(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        address wrappedTokenAddress = polygonZkEVMBridge
            .precalculatedWrapperAddress(
                payload.originNetwork,
                address(pol),
                tokenName,
                tokenSymbol,
                tokenDecimals
            );
        assertEq(
            TokenWrapped(wrappedTokenAddress).balanceOf(destinationAddress),
            tokenTransferAmount * 2
        );
    }

    function testRevert_claimMessage_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32[32] memory smtEmptyProof;
        ClaimPayload memory payload = ClaimPayload({
            proofMainnet: smtEmptyProof,
            proofRollup: smtEmptyProof,
            globalIndex: 0,
            mainnetExitRoot: bytes32(0),
            rollupExitRoot: bytes32(0),
            originNetwork: networkIDMainnet,
            originAddress: address(this),
            destinationNetwork: networkIDRollup, // invalid destination network
            destinationAddress: destinationAddress,
            amount: 0,
            metadata: abi.encode("Test message")
        });

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimMessage_globalExitRootInvalid() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32[32] memory smtEmptyProof;
        ClaimPayload memory payload = ClaimPayload({
            proofMainnet: smtEmptyProof,
            proofRollup: smtEmptyProof,
            globalIndex: 0,
            mainnetExitRoot: bytes32(0), // invalid mainnetExitRoot
            rollupExitRoot: bytes32(0), // invalid rollupExitRoot
            originNetwork: networkIDMainnet,
            originAddress: address(this),
            destinationNetwork: networkIDMainnet,
            destinationAddress: destinationAddress,
            amount: 0,
            metadata: abi.encode("Test message")
        });

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.GlobalExitRootInvalid.selector
        );
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimMessage_onSameNetwork_invalidSmtProof() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDMainnet,
            destinationAddress,
            0,
            keccak256(abi.encode("Test message"))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(this);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = 0;
        payload.metadata = abi.encode("Test message: invalid"); // invalidate proof by changing leaf value

        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.InvalidSmtProof.selector);
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function testRevert_claimMessage_onDiffNetwork_invalidSmtProof() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDRollup,
            address(this),
            networkIDMainnet,
            destinationAddress,
            0,
            keccak256(abi.encode("Test message"))
        );

        bytes32[] memory mainnetLeaves = new bytes32[](2);
        mainnetLeaves[0] = leaf;
        mainnetLeaves[1] = leaf;
        string memory encodedLeaves = _encodeLeaves(mainnetLeaves);

        ClaimPayload memory payload;
        bytes32 calculatedMainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        bytes32[] memory rollupLeaves = new bytes32[](10);
        for (uint256 i = 0; i < 10; i++) {
            rollupLeaves[i] = calculatedMainnetExitRoot;
        }
        string memory encodedRollupLeaves = _encodeLeaves(rollupLeaves);
        payload.rollupExitRoot = _getMerkleTreeRoot(encodedRollupLeaves);

        vm.prank(rollupManager);
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.rollupExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
            payload.rollupExitRoot
        );

        payload.mainnetExitRoot = polygonZkEVMGlobalExitRootV2
            .lastMainnetExitRoot();

        assertEq(
            polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot(),
            keccak256(
                abi.encodePacked(
                    payload.mainnetExitRoot,
                    payload.rollupExitRoot
                )
            )
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.proofRollup = _getProofByIndex(encodedRollupLeaves, "5");
        payload.globalIndex = _computeGlobalIndex(0, 5, false);
        payload.originNetwork = networkIDRollup;
        payload.originAddress = address(this);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = 0;
        payload.metadata = abi.encode("Test message: invalid"); // invalidate proof by changing leaf value

        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.InvalidSmtProof.selector);
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofRollup,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
    }

    function test_claimMessage() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encode("Test message"))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(this);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = abi.encode("Test message");

        vm.deal(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(polygonZkEVMBridge.isClaimed(0, 0), true);
        assertEq(destinationAddress.balance, tokenTransferAmount);
        assertEq(address(polygonZkEVMBridge).balance, 0);
    }

    function test_claimMessage_WETH() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encode("Test message"))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        ClaimPayload memory payload;
        payload.mainnetExitRoot = _getMerkleTreeRoot(encodedLeaves);

        vm.prank(address(polygonZkEVMBridge));
        polygonZkEVMGlobalExitRootV2.updateExitRoot(payload.mainnetExitRoot);

        assertEq(
            polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot(),
            payload.mainnetExitRoot
        );

        payload.proofMainnet = _getProofByIndex(encodedLeaves, "0");
        payload.globalIndex = _computeGlobalIndex(0, 0, true);
        payload.rollupExitRoot = polygonZkEVMGlobalExitRootV2
            .lastRollupExitRoot();
        payload.originNetwork = networkIDMainnet;
        payload.originAddress = address(this);
        payload.destinationNetwork = networkIDMainnet;
        payload.destinationAddress = destinationAddress;
        payload.amount = tokenTransferAmount;
        payload.metadata = abi.encode("Test message");

        vm.expectEmit();
        emit ClaimEvent(
            payload.globalIndex,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationAddress,
            payload.amount
        );
        polygonZkEVMBridge.claimMessage(
            payload.proofMainnet,
            payload.proofMainnet,
            payload.globalIndex,
            payload.mainnetExitRoot,
            payload.rollupExitRoot,
            payload.originNetwork,
            payload.originAddress,
            payload.destinationNetwork,
            payload.destinationAddress,
            payload.amount,
            payload.metadata
        );
        assertEq(polygonZkEVMBridge.isClaimed(0, 0), true);
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(destinationAddress),
            tokenTransferAmount
        );
    }

    //TODO: add more tests

    function _initializePolygonZkEVMBridge(
        address gasTokenAddress,
        uint32 gasTokenNetwork,
        bytes memory gasTokenMetadata
    ) internal {
        polygonZkEVMBridge.initialize(
            networkIDMainnet, //_networkID
            gasTokenAddress, //_gasTokenAddress
            gasTokenNetwork, //_gasTokenNetwork
            polygonZkEVMGlobalExitRootV2, //_globalExitRootManager
            rollupManager, //_polygonRollupManager
            gasTokenMetadata //_gasTokenMetadata
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

    function _computeGlobalIndex(
        uint256 indexMainnet,
        uint256 indexRollup,
        bool isMainnet
    ) internal pure returns (uint256) {
        if (isMainnet) {
            return indexMainnet + _GLOBAL_INDEX_MAINNET_FLAG;
        } else {
            return indexMainnet + indexRollup * 2 ** 32;
        }
    }
}
