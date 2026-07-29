// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ShadowSwapExecutor} from "../ShadowSwapExecutor.sol";

contract ShadowSwapExecutorHarness is ShadowSwapExecutor {
    uint256 private _mockDecryptedAmount;

    constructor(
        address intentBook_,
        address swapAdapter_
    ) ShadowSwapExecutor(intentBook_, swapAdapter_) {}

    function seedSettlement(
        uint256 intentId,
        euint256 pulledAmount,
        euint256 unwrapRequestId
    ) external {
        lastPulledAmount[intentId] = pulledAmount;
        unwrapRequestForIntent[intentId] = unwrapRequestId;
        settlementStarted[intentId] = true;
    }

    function setMockDecryptedAmount(uint256 amount) external {
        _mockDecryptedAmount = amount;
    }

    function seedReservedUnderlying(address token, uint256 amount) external {
        reservedUnderlying[token] = amount;
    }

    function _decryptUnwrapAmount(
        euint256,
        bytes calldata
    ) internal view override returns (uint256) {
        return _mockDecryptedAmount;
    }
}
