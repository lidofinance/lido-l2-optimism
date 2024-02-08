// SPDX-FileCopyrightText: 2023 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

/// @author kovalgek
/// @notice Oracle interface for token rate. A subset of Chainlink data feed interface.
interface ITokenRateOracle {

    /// @notice get the latest token rate data.
    /// @return roundId_ is a unique id for each answer. The value is based on timestamp.
    /// @return answer_ is wstETH/stETH token rate.
    /// @return startedAt_ is time when rate was pushed on L1 side. 
    /// @return updatedAt_ is the same as startedAt_.
    /// @return answeredInRound_ is the same as roundId_.
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId_,
            int256 answer_,
            uint256 startedAt_,
            uint256 updatedAt_,
            uint80 answeredInRound_
        );

    /// @notice get the lastest token rate.
    /// @return wstETH/stETH token rate.
    function latestAnswer() external view returns (int256);

    /// @notice represents the number of decimals the oracle responses represent.
    /// @return decimals of the oracle response.
    function decimals() external view returns (uint8);

    /// @notice Updates token rate.
    /// @param tokenRate_ wstETH/stETH token rate.
    /// @param rateL1Timestamp_ L1 time when rate was pushed on L1 side. 
    function updateRate(uint256 tokenRate_, uint256 rateL1Timestamp_) external;
}