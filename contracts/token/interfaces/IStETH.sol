// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @author kovalgek
/// @dev For testing purposes.
interface IStETH is IERC20 {
    function getTotalShares() external view returns (uint256);
    function getTotalPooledEther() external view returns (uint256);
}
