// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {IUniswapV2Router02} from "../interfaces/IUniswapV2Router02.sol";

/**
 * @title UniswapV2Adapter
 * @notice Thin adapter so ShadowSwap can target official Uniswap V2 Router02 on Sepolia.
 * @dev Sepolia Router02: 0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3
 */
contract UniswapV2Adapter is ISwapAdapter {
    IUniswapV2Router02 public immutable router;

    constructor(address router_) {
        require(router_ != address(0), "router");
        router = IUniswapV2Router02(router_);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        // Caller must have transferred tokens to this adapter and approved it, OR
        // ShadowSwapExecutor holds tokens and approves the underlying router directly.
        // This adapter expects msg.sender to have approved `router` after transferring in.
        // Prefer ShadowSwapExecutor calling router directly; adapter is optional glue.
        amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        return router.getAmountsOut(amountIn, path);
    }
}
