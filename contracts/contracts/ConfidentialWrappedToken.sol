// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/**
 * @title ConfidentialWrappedToken
 * @notice ERC-20 → ERC-7984 confidential wrapper powered by Nox.
 * @dev Used as the private balance layer for ShadowSwap inputs/outputs.
 */
contract ConfidentialWrappedToken is ERC20ToERC7984Wrapper {
    constructor(
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        IERC20 underlying_
    ) ERC20ToERC7984Wrapper(name_, symbol_, contractURI_, underlying_) {}
}
