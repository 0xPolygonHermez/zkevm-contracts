
Contrac TransparentUpgradeableProxy from Openzeppelin v5 with the following modifications:
- Admin is a parameter in the constructor ( like previous versions) isntead of being deployed
- Let the admin get access to the proxy
- Replace _msgSender() with msg.sender

## Functions
### constructor
```solidity
  function constructor(
  ) public
```

Initializes an upgradeable proxy managed by an instance of a {ProxyAdmin} with an `initialOwner`,
backed by the implementation at `_logic`, and optionally initialized with `_data` as explained in
{ERC1967Proxy-constructor}.


### _proxyAdmin
```solidity
  function _proxyAdmin(
  ) internal returns (address)
```

Returns the admin of this proxy.


### _fallback
```solidity
  function _fallback(
  ) internal
```

If caller is the admin process the call internally, otherwise transparently fallback to the proxy behavior.


