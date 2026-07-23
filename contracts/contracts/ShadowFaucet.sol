// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {MockERC20} from "./mock/MockERC20.sol";

/**
 * @title ShadowFaucet
 * @notice One-click Sepolia demo funding for ShadowSwap mock assets.
 */
contract ShadowFaucet {
    MockERC20 public immutable tokenA;
    MockERC20 public immutable tokenB;
    uint256 public amountA;
    uint256 public amountB;
    mapping(address => uint256) public lastClaim;
    uint256 public cooldown;

    event Claimed(address indexed user, uint256 amountA, uint256 amountB);

    constructor(
        MockERC20 tokenA_,
        MockERC20 tokenB_,
        uint256 amountA_,
        uint256 amountB_,
        uint256 cooldown_
    ) {
        tokenA = tokenA_;
        tokenB = tokenB_;
        amountA = amountA_;
        amountB = amountB_;
        cooldown = cooldown_;
    }

    function claim() external {
        require(block.timestamp >= lastClaim[msg.sender] + cooldown, "cooldown");
        lastClaim[msg.sender] = block.timestamp;
        tokenA.mint(msg.sender, amountA);
        tokenB.mint(msg.sender, amountB);
        emit Claimed(msg.sender, amountA, amountB);
    }
}
