// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {ITransactionFilterer} from "../state-transition/chain-interfaces/ITransactionFilterer.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract TransactionFiltererDenyList is ITransactionFilterer, Ownable2Step {
    
    mapping(address => bool) denylist;

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner and the addresses of the deny list.
     */
    constructor(address _owner, address[] memory list) {
        require(_owner != address(0), "Owner should be non zero address");

        _transferOwnership(_owner);

        for (uint256 i = 0; i < list.length; i++) {
            denylist[list[i]] = true;
        }
    }
    
    /**
     * @dev add this to be excluded from coverage report.
     */
    function test() internal virtual {}

    /**
     * @dev ITransactionFilterer function implementation.
     */
    function isTransactionAllowed(
        address _sender,
        address,
        uint256,
        uint256,
        bytes memory,
        address
    ) external view returns (bool) {
        return !denylist[_sender];
    }

    /**
     * @dev updateDenyList updates the deny list.
     * @param _list the addresses of the deny list want to be updated.
     * @param _add default should set it to true unless intending to remove addresses from the deny list.
     */
    function updateDenyList(address[] memory _list, bool _add) external onlyOwner {
        for (uint256 i = 0; i < _list.length; i++) {
            denylist[_list[i]] = _add;
        }
    }
}
