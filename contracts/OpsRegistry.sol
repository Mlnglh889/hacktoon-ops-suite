// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OpsRegistry
/// @notice Minimal evidence registry for Portaldot validator snapshots.
contract OpsRegistry {
    address public immutable owner;
    uint256 public heartbeatCount;
    uint256 public lastHeartbeatBlock;
    bytes32 public lastPayloadHash;

    event Heartbeat(
        address indexed reporter,
        bytes32 indexed payloadHash,
        uint256 indexed blockNumber,
        uint256 heartbeatNumber
    );

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    function heartbeat(bytes32 payloadHash) external {
        heartbeatCount += 1;
        lastHeartbeatBlock = block.number;
        lastPayloadHash = payloadHash;
        emit Heartbeat(msg.sender, payloadHash, block.number, heartbeatCount);
    }

    function ownerHeartbeat(bytes32 payloadHash) external {
        if (msg.sender != owner) revert NotOwner();
        heartbeatCount += 1;
        lastHeartbeatBlock = block.number;
        lastPayloadHash = payloadHash;
        emit Heartbeat(msg.sender, payloadHash, block.number, heartbeatCount);
    }
}
