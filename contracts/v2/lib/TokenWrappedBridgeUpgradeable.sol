// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

// Main functionality.
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable5/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

// Other functionality.
import {Initializable} from "@openzeppelin/contracts-upgradeable5/proxy/utils/Initializable.sol";

// Interfaces
import {ITokenWrappedBridgeUpgradeable, IERC20Metadata, IERC20Permit} from "../interfaces/ITokenWrappedBridgeUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable5/token/ERC20/ERC20Upgradeable.sol";

// This contract contains the solidity code that compiles into the BASE_INIT_BYTECODE_WRAPPED_TOKEN_UPGRADEABLE constant on the PolygonZkEVMBridgeV2
// This contract should remain untouched, even if it's not used directly as dependency. The main use is to verify on block explorers
// and check the implementation.
contract TokenWrappedBridgeUpgradeable is
    Initializable,
    ERC20PermitUpgradeable,
    ITokenWrappedBridgeUpgradeable
{
    /// @dev Storage of TokenWrappedBridgeUpgradeable contract.
    /// @dev It's implemented on a custom ERC-7201 namespace to reduce the risk of storage collisions when using with upgradeable contracts.
    /// @custom:storage-location erc7201:agglayer.storage.TokenWrappedBridgeUpgradeable
    struct TokenWrappedBridgeUpgradeableStorage {
        uint8 decimals;
        address bridgeAddress;
    }

    /// @dev The storage slot at which Custom Token storage starts, following the EIP-7201 standard.
    /// @dev Calculated as `keccak256(abi.encode(uint256(keccak256("agglayer.storage.TokenWrappedBridgeUpgradeable")) - 1)) & ~bytes32(uint256(0xff))`.
    bytes32 private constant TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE =
        hex"863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00";

    // Errors.
    error OnlyBridge();

    // Checks if the sender is the bridge
    modifier onlyBridge() {
        TokenWrappedBridgeUpgradeableStorage
            storage $ = _getTokenWrappedBridgeUpgradeableStorage();

        // Only bridge can mint and burn tokens
        require(msg.sender == $.bridgeAddress, OnlyBridge());

        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @dev Disable initializers on the implementation following the best practices.
     */
    constructor() {
        // disable initializers for implementation contract
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////
    function initialize(
        string memory name,
        string memory symbol,
        uint8 __decimals
    ) external initializer {
        // Initialize the ERC20 token with the name and symbol
        __ERC20_init(name, symbol);
        // Initialize the ERC20Permit with the name
        __ERC20Permit_init(name);

        // Initialize storage
        TokenWrappedBridgeUpgradeableStorage
            storage $ = _getTokenWrappedBridgeUpgradeableStorage();
        $.decimals = __decimals;
        $.bridgeAddress = msg.sender;
    }

    /// @notice Mints Custom Tokens to the recipient.
    /// @notice This function is only callable by the bridge.
    /// @param to The address of the recipient.
    /// @param value The amount of tokens to mint.
    function mint(address to, uint256 value) external onlyBridge {
        _mint(to, value);
    }

    /// @notice Notice that is not require to approve wrapped tokens to use the bridge
    /// @notice burns Custom Tokens from the account.
    /// @notice This function is only callable by the bridge.
    /// @param account The address of the account.
    /// @param value The amount of tokens to burn.
    function burn(address account, uint256 value) external onlyBridge {
        _burn(account, value);
    }

    function nonces(
        address owner
    )
        public
        view
        override(ERC20PermitUpgradeable, IERC20Permit)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    /// @notice The number of decimals of the token.
    function decimals()
        public
        view
        override(ERC20Upgradeable, IERC20Metadata)
        returns (uint8)
    {
        TokenWrappedBridgeUpgradeableStorage
            storage $ = _getTokenWrappedBridgeUpgradeableStorage();
        return $.decimals;
    }

    /// @notice The address of the bridge contract.
    function bridgeAddress() public view returns (address) {
        TokenWrappedBridgeUpgradeableStorage
            storage $ = _getTokenWrappedBridgeUpgradeableStorage();
        return $.bridgeAddress;
    }

    /// @dev A function to return a pointer for the TokenWrappedBridgeUpgradeableStorageLocation.
    function _getTokenWrappedBridgeUpgradeableStorage()
        internal
        pure
        returns (TokenWrappedBridgeUpgradeableStorage storage $)
    {
        assembly {
            $.slot := TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE
        }
    }
}
