# PolygonTransparentProxy
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/PolygonTransparentProxy.sol)

**Inherits:**
ERC1967Proxy

*Contract TransparentUpgradeableProxy from Openzeppelin v5 with the following modifications:
- Admin is a parameter in the constructor ( like previous versions) instead of being deployed
- Let the admin get access to the proxy
- Replace _msgSender() with msg.sender*


## State Variables
### _admin

```solidity
address private immutable _admin;
```


## Functions
### constructor

*Initializes an upgradeable proxy managed by an instance of a {ProxyAdmin} with an `initialOwner`,
backed by the implementation at `_logic`, and optionally initialized with `_data` as explained in
{ERC1967Proxy-constructor}.*


```solidity
constructor(address _logic, address admin, bytes memory _data) payable ERC1967Proxy(_logic, _data);
```

### _proxyAdmin

*Returns the admin of this proxy.*


```solidity
function _proxyAdmin() internal virtual returns (address);
```

### _fallback

*If caller is the admin process the call internally, otherwise transparently fallback to the proxy behavior.*


```solidity
function _fallback() internal virtual override;
```

### _dispatchUpgradeToAndCall

*Upgrade the implementation of the proxy. See [ERC1967Utils-upgradeToAndCall](/node_modules/@openzeppelin/contracts-upgradeable5/proxy/utils/UUPSUpgradeable.sol/abstract.UUPSUpgradeable.md#upgradetoandcall).
Requirements:
- If `data` is empty, `msg.value` must be zero.*


```solidity
function _dispatchUpgradeToAndCall() private;
```

