// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ShadowIntentBook} from "../ShadowIntentBook.sol";

contract ShadowIntentBookHarness is ShadowIntentBook {
    constructor() ShadowIntentBook(300) {}

    function seedIntent(
        uint256 intentId,
        address user,
        uint32 batchId,
        IntentStatus status
    ) external {
        intents[intentId] = Intent({
            user: user,
            cTokenIn: address(1),
            cTokenOut: address(2),
            tokenIn: address(3),
            tokenOut: address(4),
            amountIn: euint256.wrap(bytes32(0)),
            minAmountOut: euint256.wrap(bytes32(0)),
            deadline: uint64(block.timestamp + 1 days),
            createdAt: uint64(block.timestamp),
            batchId: batchId,
            status: status
        });
        batches[batchId].intentIds.push(intentId);
    }

    function setDeadline(uint256 intentId, uint64 deadline) external {
        intents[intentId].deadline = deadline;
    }
}
