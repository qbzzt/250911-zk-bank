// SPDX-License-Identifier: MIT
// Copyright 2022 Aztec

pragma solidity >=0.8.21;

import {HonkVerifier} from "./Verifier.sol";

contract ZkBank {
    HonkVerifier myVerifier;
    bytes32 currentStateHash;

    event TransactionProcessed(
        bytes32 indexed transactionHash,
        bytes32 oldStateHash,
        bytes32 newStateHash
    );

    constructor(address _verifierAddress, bytes32 _initialStateHash) {
        currentStateHash = _initialStateHash;
        myVerifier = HonkVerifier(_verifierAddress);
    }

    function processTransaction(
        bytes calldata _proof, 
        bytes32[] calldata _publicInputs
    ) public {
        require(_publicInputs[0] == currentStateHash, 
            "Wrong old state hash");

        myVerifier.verify(_proof, _publicInputs);

        currentStateHash = _publicInputs[1];

        emit TransactionProcessed(
            _publicInputs[2]<<128 | _publicInputs[3],
            _publicInputs[0],
            _publicInputs[1]
        );
    }
}