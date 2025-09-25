// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {HonkVerifier} from "../src/Verifier.sol";

contract ZkBankScript is Script {
    HonkVerifier public verifier;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        verifier = new HonkVerifier();

        console.log(address(verifier));

        bytes32[] memory keys = new bytes32[](2);
        
        bool result = verifier.verify(
            hex"beefbabe",
            keys
        );

        console.log(result);

        vm.stopBroadcast();
    }
}
