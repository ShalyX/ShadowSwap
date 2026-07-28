// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ShadowIntentBook} from "../ShadowIntentBook.sol";

contract MockIntentBook {
    mapping(uint256 => ShadowIntentBook.Intent) private _intents;
    mapping(uint32 => bool) public executedBatches;
    mapping(address => address) private _registeredUnderlying;

    function setAssetPair(address wrapper, address underlying) external {
        _registeredUnderlying[wrapper] = underlying;
    }

    function setStatus(uint256 intentId, ShadowIntentBook.IntentStatus status) external {
        _intents[intentId].status = status;
    }

    function isAssetPair(address wrapper, address underlying) external view returns (bool) {
        return underlying != address(0) && _registeredUnderlying[wrapper] == underlying;
    }

    function setIntent(
        uint256 intentId,
        address user,
        address cTokenIn,
        address cTokenOut,
        address tokenIn,
        address tokenOut,
        uint32 batchId,
        ShadowIntentBook.IntentStatus status
    ) external {
        _intents[intentId] = ShadowIntentBook.Intent({
            user: user,
            cTokenIn: cTokenIn,
            cTokenOut: cTokenOut,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: euint256.wrap(bytes32(0)),
            minAmountOut: euint256.wrap(bytes32(0)),
            deadline: uint64(block.timestamp + 1 days),
            createdAt: uint64(block.timestamp),
            batchId: batchId,
            status: status
        });
    }

    function getIntent(uint256 intentId) external view returns (ShadowIntentBook.Intent memory) {
        return _intents[intentId];
    }

    function markExecuted(uint256[] calldata intentIds, uint32 batchId) external {
        for (uint256 i = 0; i < intentIds.length; i++) {
            _intents[intentIds[i]].status = ShadowIntentBook.IntentStatus.Executed;
        }
        executedBatches[batchId] = true;
    }

    function allowExecutorOnIntent(uint256) external {}

    function allowSettlementAgentOnIntent(uint256, address) external {}

    function minOutHandle(uint256 intentId) external view returns (euint256) {
        return _intents[intentId].minAmountOut;
    }
}
