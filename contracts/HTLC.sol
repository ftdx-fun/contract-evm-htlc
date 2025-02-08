// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CrossChainHTLC {
    using SafeERC20 for IERC20;

    struct TokenAmount {
        address token;
        uint256 amount;
    }

    struct Swap {
        address initiator;
        address participant;
        TokenAmount[] tokens;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bytes32 secret;
    }

    mapping(bytes32 => Swap) public swaps;

    event NewSwap(
        bytes32 indexed swapId,
        address indexed initiator,
        address indexed participant,
        bytes32 hashlock,
        uint256 timelock,
        uint256 timestamp
    );

    event Withdrawn(
        bytes32 indexed swapId,
        bytes32 secret,
        address indexed receiver,
        uint256 timestamp
    );

    event Refunded(
        bytes32 indexed swapId,
        address indexed refundee,
        uint256 timestamp
    );

    modifier futureTimelock(uint256 _timelock) {
        require(_timelock > block.timestamp, "Timelock must be in the future");
        _;
    }

    modifier swapExists(bytes32 _swapId) {
        require(swaps[_swapId].initiator != address(0), "Swap does not exist");
        _;
    }

    modifier withdrawable(bytes32 _swapId, bytes32 _secret) {
        require(swaps[_swapId].hashlock == keccak256(abi.encodePacked(_secret)), "Invalid secret");
        require(swaps[_swapId].timelock > block.timestamp, "Timelock expired");
        require(!swaps[_swapId].withdrawn, "Already withdrawn");
        require(!swaps[_swapId].refunded, "Already refunded");
        _;
    }

    modifier refundable(bytes32 _swapId) {
        require(block.timestamp >= swaps[_swapId].timelock, "Timelock not expired");
        require(!swaps[_swapId].withdrawn, "Already withdrawn");
        require(!swaps[_swapId].refunded, "Already refunded");
        require(msg.sender == swaps[_swapId].initiator, "Not initiator");
        _;
    }

    function lockTokens(
        address _participant,
        TokenAmount[] calldata _tokens,
        bytes32 _hashlock,
        uint256 _timelock
    ) external futureTimelock(_timelock) returns (bytes32) {
        require(_tokens.length > 0, "Must lock at least one token");
        require(_participant != address(0), "Invalid participant address");

        bytes32 swapId = keccak256(
            abi.encodePacked(
                msg.sender,
                _participant,
                _hashlock,
                _timelock
            )
        );

        require(swaps[swapId].initiator == address(0), "Swap already exists");

        Swap storage newSwap = swaps[swapId];
        newSwap.initiator = msg.sender;
        newSwap.participant = _participant;
        newSwap.hashlock = _hashlock;
        newSwap.timelock = _timelock;
        newSwap.withdrawn = false;
        newSwap.refunded = false;
        newSwap.secret = 0;

        for (uint i = 0; i < _tokens.length; i++) {
            TokenAmount memory tokenAmount = _tokens[i];
            require(tokenAmount.amount > 0, "Amount must be greater than 0");

            IERC20 token = IERC20(tokenAmount.token);
            require(
                token.allowance(msg.sender, address(this)) >= tokenAmount.amount,
                "Insufficient allowance"
            );

            token.safeTransferFrom(msg.sender, address(this), tokenAmount.amount);
            newSwap.tokens.push(tokenAmount);
        }

        emit NewSwap(
            swapId,
            msg.sender,
            _participant,
            _hashlock,
            _timelock,
            block.timestamp
        );

        return swapId;
    }

    function redeemTokens(bytes32 _swapId, bytes32 _secret)
        external
        swapExists(_swapId)
        withdrawable(_swapId, _secret)
    {
        Swap storage swap = swaps[_swapId];
        require(msg.sender == swap.participant, "Not participant");

        swap.withdrawn = true;
        swap.secret = _secret;

        for (uint i = 0; i < swap.tokens.length; i++) {
            TokenAmount storage tokenAmount = swap.tokens[i];
            IERC20(tokenAmount.token).safeTransfer(swap.participant, tokenAmount.amount);
        }

        emit Withdrawn(_swapId, _secret, msg.sender, block.timestamp);
    }

    function refundTokens(bytes32 _swapId)
        external
        swapExists(_swapId)
        refundable(_swapId)
    {
        Swap storage swap = swaps[_swapId];
        swap.refunded = true;

        for (uint i = 0; i < swap.tokens.length; i++) {
            TokenAmount storage tokenAmount = swap.tokens[i];
            IERC20(tokenAmount.token).safeTransfer(swap.initiator, tokenAmount.amount);
        }

        emit Refunded(_swapId, msg.sender, block.timestamp);
    }
}
