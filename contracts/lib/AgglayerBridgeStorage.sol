pragma solidity 0.8.28;

import "./DepositContractV2.sol";
import "./EmergencyManager.sol";
import "../interfaces/IBaseLegacyAgglayerGER.sol";
import "../interfaces/IAgglayerBridgeState.sol";
import "../interfaces/IAgglayerBridge.sol";
import "../interfaces/ITokenWrappedBridgeUpgradeable.sol";

/// @dev An inherited base, not a deployed store; legacy slots and gaps remain on each proxy.
abstract contract AgglayerBridgeStorage is
    DepositContractV2,
    EmergencyManager,
    IAgglayerBridgeState
{
    struct TokenInformation {
        uint32 originNetwork;
        address originTokenAddress;
    }

    uint32 internal constant _MAINNET_NETWORK_ID = 0;
    uint8 internal constant _LEAF_TYPE_ASSET = 0;
    uint8 internal constant _LEAF_TYPE_MESSAGE = 1;
    uint256 internal constant _MAX_LEAFS_PER_NETWORK = 2 ** 32;
    uint256 internal constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;

    // Network identifier
    uint32 public networkID;

    // Global Exit Root address
    IBaseLegacyAgglayerGER public globalExitRootManager;

    // Last updated deposit count to the global exit root manager
    uint32 public lastUpdatedDepositCount;

    // Leaf index --> claimed bit map
    mapping(uint256 => uint256) public claimedBitMap;

    // keccak256(OriginNetwork || tokenAddress) --> Wrapped token address
    mapping(bytes32 => address) public tokenInfoToWrappedToken;

    // Wrapped token Address --> Origin token information
    mapping(address => TokenInformation) public wrappedTokenToTokenInfo;

    // Rollup manager address, previously PolygonZkEVM
    /// @custom:oz-renamed-from polygonZkEVMaddress
    address public polygonRollupManager;

    // Native address
    address public gasTokenAddress;

    // Native address
    uint32 public gasTokenNetwork;

    // Gas token metadata
    bytes public gasTokenMetadata;

    // WETH address
    // @note WETH address will only be present when the native token is not ether.
    ITokenWrappedBridgeUpgradeable public WETHToken;

    // Address of the proxied tokens manager, is the admin of proxied wrapped tokens
    address internal proxiedTokensManager;

    // This account will be able to accept the proxiedTokensManager role
    address public pendingProxiedTokensManager;

    // @notice Value to detect if the contract has been initialized previously.
    uint8 internal _initializerVersion;

    // Preserve even fields unused by the module; removing them shifts the L2 layout.
    uint256[48] private __gap;

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

    event NewWrappedToken(
        uint32 originNetwork,
        address originTokenAddress,
        address wrappedTokenAddress,
        bytes metadata
    );

    event AcceptProxiedTokensManagerRole(
        address oldProxiedTokensManager,
        address newProxiedTokensManager
    );

    event TransferProxiedTokensManagerRole(
        address currentProxiedTokensManager,
        address newProxiedTokensManager
    );

    /**
     * @notice Function to add a new leaf to the bridge merkle tree
     * @param leafType leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount Amount of tokens
     * @param metadataHash Metadata hash
     */
    function _addLeafBridge(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) internal virtual {
        _addLeaf(
            getLeafValue(
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

    /**
     * @notice Function decode an index into a wordPos and bitPos
     * @param index Index
     */
    function _bitmapPositions(
        uint256 index
    ) internal pure returns (uint256 wordPos, uint256 bitPos) {
        wordPos = uint248(index >> 8);
        bitPos = uint8(index);
    }

    /**
     * @notice Internal function to validate and decode global index
     * @dev Validates global index format and extracts leafIndex, indexRollup, and sourceBridgeNetwork
     * @param globalIndex The global index to validate and decode, defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * @return leafIndex The leaf index extracted from global index
     * @return indexRollup The rollup index extracted from global index (0 for mainnet)
     * @return sourceBridgeNetwork The source bridge network (0 for mainnet, indexRollup + 1 for rollups)
     */
    function _validateAndDecodeGlobalIndex(
        uint256 globalIndex
    )
        internal
        pure
        returns (
            uint32 leafIndex,
            uint32 indexRollup,
            uint32 sourceBridgeNetwork
        )
    {
        // Last 32 bits are leafIndex
        leafIndex = uint32(globalIndex);

        // Get origin network from global index
        if (globalIndex & _GLOBAL_INDEX_MAINNET_FLAG != 0) {
            // The network is mainnet
            indexRollup = 0;
            sourceBridgeNetwork = 0;

            // Reconstruct global index to assert that all unused bits are 0
            require(
                _GLOBAL_INDEX_MAINNET_FLAG + uint256(leafIndex) == globalIndex,
                IAgglayerBridge.InvalidGlobalIndex()
            );
        } else {
            // The network is a rollup
            indexRollup = uint32(globalIndex >> 32);
            sourceBridgeNetwork = indexRollup + 1;

            // Reconstruct global index to assert that all unused bits are 0
            require(
                (uint256(indexRollup) << uint256(32)) + uint256(leafIndex) ==
                    globalIndex,
                IAgglayerBridge.InvalidGlobalIndex()
            );
        }
    }
}
