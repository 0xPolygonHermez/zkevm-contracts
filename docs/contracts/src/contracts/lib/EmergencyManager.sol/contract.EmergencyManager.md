# EmergencyManager
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/EmergencyManager.sol)

**Inherits:**
[IEmergencyManager](/contracts/interfaces/IEmergencyManager.sol/interface.IEmergencyManager.md)

Contract helper responsible to manage the emergency state


## State Variables
### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.

**Note:**
oz-renamed-from: _gap


```solidity
uint256[10] private __gap
```


### isEmergencyState

```solidity
bool public isEmergencyState
```


## Functions
### ifNotEmergencyState

Only allows a function to be callable if emergency state is unactive


```solidity
modifier ifNotEmergencyState() ;
```

### ifEmergencyState

Only allows a function to be callable if emergency state is active


```solidity
modifier ifEmergencyState() ;
```

### _activateEmergencyState

Activate emergency state


```solidity
function _activateEmergencyState() internal virtual ifNotEmergencyState;
```

### _deactivateEmergencyState

Deactivate emergency state


```solidity
function _deactivateEmergencyState() internal virtual ifEmergencyState;
```

