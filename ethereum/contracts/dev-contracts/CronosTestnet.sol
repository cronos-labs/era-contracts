// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CronosTestnet is ERC20, Ownable {
    uint8 private _decimals = 18;

    constructor() ERC20("Cronos Testnet", "TCRO"){
    }

    function mint(address dest, uint wad) public onlyOwner returns (bool) {
        _mint(dest, wad);
        return true;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
