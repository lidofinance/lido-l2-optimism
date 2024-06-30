// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IStETH} from "../token/interfaces/IStETH.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev For testing purposes.
contract StETHStub is IStETH, ERC20 {

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, 1000000 * 10**40);
    }

    function getTotalShares() external view returns (uint256) {
        return 0;
    }
    function getTotalPooledEther() external view returns (uint256) {
        return 0;
    }
}
