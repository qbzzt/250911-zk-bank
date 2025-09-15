use std::hash::pedersen_hash;
use dep::ecrecover;
use keccak256::keccak256;


global ACCOUNT_NUMBER: u32 = 5;
global FLAT_ACCOUNT_FIELDS : u32 = 2;
global MESSAGE_LENGTH : u32 = 100;
global ASCII_MESSAGE_LENGTH : [u8; 3] = [0x31, 0x30, 0x30];
global HASH_BUFFER_SIZE : u32 = 26+3+MESSAGE_LENGTH; 

struct Account {
    balance: u128,
    address: Field,
    nonce: u32,
}

struct TransferTxn {
    from: Field,
    to: Field,
    amount: u128,
    nonce: u32
}




fn flatten_account(account: Account) -> [Field; FLAT_ACCOUNT_FIELDS] {
    let flat = [
        account.address,
        ((account.balance << 32) + account.nonce.into()).into(),
    ];

    flat
}



fn flatten_accounts(accounts: [Account; ACCOUNT_NUMBER]) -> [Field; FLAT_ACCOUNT_FIELDS*ACCOUNT_NUMBER] {
    let mut flat: [Field; FLAT_ACCOUNT_FIELDS*ACCOUNT_NUMBER] = [0; FLAT_ACCOUNT_FIELDS*ACCOUNT_NUMBER];

    for i in 0..ACCOUNT_NUMBER {
        let fields = flatten_account(accounts[i]);
        for j in 0..FLAT_ACCOUNT_FIELDS {
            flat[i*FLAT_ACCOUNT_FIELDS + j] = fields[j];
        }
    }

    flat
}


fn hash_accounts(accounts: [Account; ACCOUNT_NUMBER]) -> Field {
    pedersen_hash(flatten_accounts(accounts))
}

fn find_account(accounts: [Account; ACCOUNT_NUMBER], address: Field) -> u32 {
    let mut account : u32 = ACCOUNT_NUMBER;

    for i in 0..ACCOUNT_NUMBER {
        if accounts[i].address == address {
            account = i;
        }
    }

    // Or else account not found, and the transaction is impossible to fulfill
    assert (account < ACCOUNT_NUMBER);

    account
}


fn apply_transfer_txn(accounts: [Account; ACCOUNT_NUMBER], txn: TransferTxn) -> [Account; ACCOUNT_NUMBER] {
    let from = find_account(accounts, txn.from);
    let to = find_account(accounts, txn.to);

    // Or else there isn't enough balance to transfer
    assert (accounts[from].balance >= txn.amount);

    // Or else this might be a replay attack
    assert (accounts[from].nonce == txn.nonce);    

    let mut newAccounts = accounts;

    newAccounts[from].balance -= txn.amount;
    newAccounts[from].nonce += 1;
    newAccounts[to].balance += txn.amount;

    newAccounts
}

fn readAddress(messageBytes: [u8; MESSAGE_LENGTH]) -> Field 
{
    let mut result : Field = 0;

    for i in 7..47 {
        result *= 0x10;
        if messageBytes[i] >= 48 & messageBytes[i] <= 57 {    // 0-9
            result += (messageBytes[i]-48).into();
        }
        if messageBytes[i] >= 65 & messageBytes[i] <= 70 {    // A-F
            result += (messageBytes[i]-65+10).into()
        }
        if messageBytes[i] >= 97 & messageBytes[i] <= 102 {   // a-f
            result += (messageBytes[i]-97+10).into()
        }        
    }    

    result
}

fn readAmountAndNonce(messageBytes: [u8; MESSAGE_LENGTH]) -> (u128, u32)
{
    let mut amount : u128 = 0;
    let mut stillReadingAmount: bool = true;
    let mut lookingForNonce: bool = false;
    let mut stillReadingNonce: bool = false;
    let mut nonce: u32 = 0;

    for i in 48..MESSAGE_LENGTH {
        if messageBytes[i] >= 48 & messageBytes[i] <= 57 {    // 0-9
            let digit = (messageBytes[i]-48);

            if stillReadingAmount {
                amount = amount*10 + digit.into();
            }

            if lookingForNonce {    // We just found it
                stillReadingNonce = true;
                lookingForNonce = false;
            }

            if stillReadingNonce {
                nonce = nonce*10 + digit.into();
            }
        } else {
            if stillReadingAmount {
                stillReadingAmount = false;
                lookingForNonce = true;
            }
            if stillReadingNonce {
                stillReadingNonce = false;
            }
        }
    }

    (amount, nonce)
}


fn readTransferTxn(message: str<MESSAGE_LENGTH>) -> TransferTxn 
{
    let mut txn: TransferTxn = TransferTxn { from: 0, to: 0, amount:0, nonce:0 };
    let messageBytes = message.as_bytes();

    txn.from = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // For now
    txn.to = readAddress(messageBytes);
    let (amount, nonce) = readAmountAndNonce(messageBytes);
    txn.amount = amount;
    txn.nonce = nonce;

    txn
}


fn fill_u8_times_32_from_u128s(x0: u128, x1: u128) -> [u8; 32] {
    let mut out: [u8; 32] = [0; 32];
    for i in 0..16 {
        out[(15-i) as u32] = ((x0 >> (8 * i)) & 0xFF) as u8;
    }
    for i in 0..16 {
        out[(31-i) as u32] = ((x1 >> (8 * i)) & 0xFF) as u8;
    }    
    out
}


fn fill_u8_times_64_from_u128s(x: [u128; 4]) -> [u8; 64] {
    let mut out: [u8; 64] = [0; 64];

    for i in 0..16 {
        out[(15-i) as u32] = ((x[0] >> (8 * i)) & 0xFF) as u8;
    }
    for i in 0..16 {
        out[(31-i) as u32] = ((x[1] >> (8 * i)) & 0xFF) as u8;
    }
    for i in 0..16 {
        out[(47-i) as u32] = ((x[2] >> (8 * i)) & 0xFF) as u8;
    }
    for i in 0..16 {
        out[(63-i) as u32] = ((x[3] >> (8 * i)) & 0xFF) as u8;
    }        
    out
}


// The equivalent to Viem's hashMessage
// https://viem.sh/docs/utilities/hashMessage#hashmessage
fn hashMessage(message: str<MESSAGE_LENGTH>) -> [u8;32] {
    // ASCII prefix
    let prefix_bytes = [
        0x19, // \x19
        0x45, // 'E'
        0x74, // 't'
        0x68, // 'h'
        0x65, // 'e'
        0x72, // 'r'
        0x65, // 'e'
        0x75, // 'u'
        0x6D, // 'm'
        0x20, // ' '
        0x53, // 'S'
        0x69, // 'i'
        0x67, // 'g'
        0x6E, // 'n'
        0x65, // 'e'
        0x64, // 'd'
        0x20, // ' '
        0x4D, // 'M'
        0x65, // 'e'
        0x73, // 's'
        0x73, // 's'
        0x61, // 'a'
        0x67, // 'g'
        0x65, // 'e'
        0x3A, // ':'
        0x0A  // '\n'
    ];

    let mut buffer: [u8; HASH_BUFFER_SIZE] = [0u8; HASH_BUFFER_SIZE];
    for i in 0..26 {
        buffer[i] = prefix_bytes[i];
    }
    for i in 0..2 {
        buffer[i+26] = ASCII_MESSAGE_LENGTH[i];
    }

    let messageBytes : [u8; MESSAGE_LENGTH] = message.as_bytes();

    for i in 0..MESSAGE_LENGTH {
        buffer[i+28] = messageBytes[i];
    }

    keccak256::keccak256(buffer, HASH_BUFFER_SIZE)
}

fn signatureToAddress(
        message: str<MESSAGE_LENGTH>, 
        pubKey: [u128; 4],
        signatureParam: [u128; 4]
    ) -> Field
{
    let pub_x_array = fill_u8_times_32_from_u128s(pubKey[0], pubKey[1]);
    let pub_y_array = fill_u8_times_32_from_u128s(pubKey[2], pubKey[3]);
    let signature = fill_u8_times_64_from_u128s(signatureParam);

    let hash = hashMessage(message);

    ecrecover::ecrecover(pub_x_array, pub_y_array, signature, hash)
}


fn main(
        accounts: [Account; ACCOUNT_NUMBER], 
        message: str<MESSAGE_LENGTH>, 
        pubKey: [u128; 4],
        signatureParam: [u128; 4],
    ) -> pub (
        [Account; ACCOUNT_NUMBER], // New accounts array
        Field,  // Hash of new accounts array
        Field,  // Hash of old accounts array
        TransferTxn,
    )
{
    let mut txn = readTransferTxn(message);

    txn.from = signatureToAddress(
        message,
        pubKey,
        signatureParam);

    let newAccounts = apply_transfer_txn(accounts, txn);

    (
        newAccounts, 
        hash_accounts(newAccounts),
        hash_accounts(accounts),
        txn,
    )
}


// #[test]
// fn test_main() {
//    main(1, 2);

    // Uncomment to make test fail
    // main(1, 1);
// }
