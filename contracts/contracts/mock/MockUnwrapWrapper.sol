// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @notice Narrow wrapper double for executor settlement lifecycle tests.
contract MockUnwrapWrapper {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlyingToken;
    mapping(euint256 => address) private _requesters;

    constructor(IERC20 underlying_) {
        underlyingToken = underlying_;
    }

    function setUnwrapRequester(euint256 requestId, address requester) external {
        _requesters[requestId] = requester;
    }

    function unwrapRequester(euint256 requestId) external view returns (address) {
        return _requesters[requestId];
    }

    function finalizeUnwrap(
        euint256 requestId,
        bytes calldata
    ) external {
        address requester = _requesters[requestId];
        require(requester != address(0), "missing request");
        delete _requesters[requestId];
    }
}
