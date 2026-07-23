// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title ISwapAdapter
 * @notice Minimal swap surface used by ShadowSwap (Uniswap V2-compatible or mock AMM).
 */
interface ISwapAdapter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}
