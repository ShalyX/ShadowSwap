// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";

/**
 * @title SimpleAMM
 * @notice Constant-product AMM used for local tests and guaranteed Sepolia demo liquidity.
 * @dev Uniswap V2-compatible swapExactTokensForTokens / getAmountsOut surface.
 */
contract SimpleAMM is ISwapAdapter {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 30; // 0.30%
    uint256 public constant BPS = 10_000;

    mapping(address => mapping(address => uint256)) public reserveA;
    mapping(address => mapping(address => uint256)) public reserveB;

    event LiquidityAdded(address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB);
    event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external {
        require(tokenA != tokenB, "same token");
        require(amountA > 0 && amountB > 0, "zero");

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        if (tokenA < tokenB) {
            reserveA[tokenA][tokenB] += amountA;
            reserveB[tokenA][tokenB] += amountB;
        } else {
            reserveA[tokenB][tokenA] += amountB;
            reserveB[tokenB][tokenA] += amountA;
        }

        emit LiquidityAdded(tokenA, tokenB, amountA, amountB);
    }

    function getReserves(address tokenA, address tokenB) public view returns (uint256 rIn, uint256 rOut) {
        if (tokenA < tokenB) {
            rIn = reserveA[tokenA][tokenB];
            rOut = reserveB[tokenA][tokenB];
        } else {
            rIn = reserveB[tokenB][tokenA];
            rOut = reserveA[tokenB][tokenA];
        }
    }

    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) public view returns (uint256) {
        (uint256 rIn, uint256 rOut) = getReserves(tokenIn, tokenOut);
        require(rIn > 0 && rOut > 0, "no liquidity");
        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        return (amountInWithFee * rOut) / (rIn * BPS + amountInWithFee);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view override returns (uint256[] memory amounts) {
        require(path.length >= 2, "path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            amounts[i + 1] = getAmountOut(amounts[i], path[i], path[i + 1]);
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "expired");
        require(path.length == 2, "only direct pairs in demo AMM");
        require(amountIn > 0, "zero in");

        address tokenIn = path[0];
        address tokenOut = path[1];

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = getAmountOut(amountIn, tokenIn, tokenOut);
        require(amounts[1] >= amountOutMin, "slippage");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        if (tokenIn < tokenOut) {
            reserveA[tokenIn][tokenOut] += amountIn;
            reserveB[tokenIn][tokenOut] -= amounts[1];
        } else {
            reserveB[tokenOut][tokenIn] += amountIn;
            reserveA[tokenOut][tokenIn] -= amounts[1];
        }

        IERC20(tokenOut).safeTransfer(to, amounts[1]);
        emit Swap(tokenIn, tokenOut, amountIn, amounts[1]);
    }
}
