// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CrossChainHTLC {
    using SafeERC20 for IERC20;

    address public admin;

    struct TokenAmount {
        address token;
        uint256 amount;
        bool isNative;
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
    mapping(bytes32 => bool) public usedHashlocks;

    event NewSwap(
        bytes32 indexed swapId,
        address indexed initiator,
        address indexed participant,
        bytes32 hashlock,
        uint256 timelock,
        uint256 timestamp,
        TokenAmount[] tokens
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

    event TimelockExpired(
        bytes32 indexed swapId,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

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

    constructor() {
        admin = msg.sender;
    }

    function lockTokens(
        address _participant,
        TokenAmount[] calldata _tokens,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable futureTimelock(_timelock) returns (bytes32) {
        require(_tokens.length > 0, "Must lock at least one token");
        uint256 totalEthRequired = _validateAndCalculateETH(_tokens);
        require(msg.value == totalEthRequired, "Incorrect ETH amount sent");

        _transferIncomingTokens(msg.sender, address(this), _tokens);
        return _createSwap(_participant, _tokens, _hashlock, _timelock);
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

        _transferTokensToReceiver(swap.tokens, swap.participant);
        emit Withdrawn(_swapId, _secret, msg.sender, block.timestamp);
    }

    function refundTokens(bytes32 _swapId)
        external
        swapExists(_swapId)
        refundable(_swapId)
    {
        Swap storage swap = swaps[_swapId];
        swap.refunded = true;

        _transferTokensToReceiver(swap.tokens, swap.initiator);
        emit Refunded(_swapId, msg.sender, block.timestamp);
    }

    function expireTimelock(bytes32 _swapId) external onlyAdmin swapExists(_swapId) {
        Swap storage swap = swaps[_swapId];
        require(!swap.withdrawn, "Already withdrawn");
        require(!swap.refunded, "Already refunded");

        swap.timelock = block.timestamp;

        emit TimelockExpired(_swapId, block.timestamp);
    }

    function _createSwap(
        address _participant,
        TokenAmount[] memory _tokens,
        bytes32 _hashlock,
        uint256 _timelock
    ) internal returns (bytes32) {
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
        
        for (uint i = 0; i < _tokens.length; i++) {
            newSwap.tokens.push(_tokens[i]);
        }
        
        newSwap.hashlock = _hashlock;
        newSwap.timelock = _timelock;
        newSwap.withdrawn = false;
        newSwap.refunded = false;
        newSwap.secret = 0;

        usedHashlocks[_hashlock] = true;

        emit NewSwap(
            swapId,
            msg.sender,
            _participant,
            _hashlock,
            _timelock,
            block.timestamp,
            _tokens
        );

        return swapId;
    }

    function _validateAndCalculateETH(TokenAmount[] calldata _tokens) internal pure returns (uint256) {
        uint256 totalEthRequired = 0;
        for (uint i = 0; i < _tokens.length; i++) {
            require(_tokens[i].amount > 0, "Amount must be greater than 0");
            if (_tokens[i].isNative) {
                totalEthRequired += _tokens[i].amount;
            }
        }
        return totalEthRequired;
    }

    function _transferIncomingTokens(address _from, address _to, TokenAmount[] calldata _tokens) internal {
        for (uint i = 0; i < _tokens.length; i++) {
            if (!_tokens[i].isNative) {
                IERC20 token = IERC20(_tokens[i].token);
                require(
                    token.allowance(_from, address(this)) >= _tokens[i].amount,
                    "Insufficient allowance"
                );
                token.safeTransferFrom(_from, _to, _tokens[i].amount);
            }
        }
    }

    function _transferTokensToReceiver(TokenAmount[] storage _tokens, address _receiver) internal {
        for (uint i = 0; i < _tokens.length; i++) {
            if (_tokens[i].isNative) {
                (bool success, ) = payable(_receiver).call{value: _tokens[i].amount}("");
                require(success, "ETH transfer failed");
            } else {
                IERC20(_tokens[i].token).safeTransfer(_receiver, _tokens[i].amount);
            }
        }
    }

    // Add receive() function to accept ETH
    receive() external payable {}
}
