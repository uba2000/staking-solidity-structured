// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StBTC is ERC20, Ownable {
    constructor() ERC20("Staked BTC", "stBTC") Ownable(msg.sender) {} // Make deployer initial owner

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }
}