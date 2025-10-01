import fs from 'fs/promises'
import { Noir } from '@noir-lang/noir_js'
import { exec } from 'child_process'
import util from 'util'

import express from 'express'
import {
    hashMessage,
    recoverAddress,
    recoverPublicKey,
    createWalletClient,
    getContract,
    http
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil } from 'viem/chains'

const execPromise = util.promisify(exec)

const circuit = JSON.parse(await fs.readFile("./noir/target/zkBank.json"))
const noir = new Noir(circuit)

// There is an @aztec/bb.js library we could use here. Howevevr,
// the bb cli runs natively and is a lot faster. 
// If you decide to use @aztec/bb.js, make sure you use version 0.87.9,
// later versions don't work with the current Noir

const port = 3000

const zkBankAddress = process.env.ZKBANK_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
const zkBankABI = [
 {
    "type": "function",
    "name": "processTransaction",
    "inputs": [
      {
        "name": "_proof",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "_publicInputs",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "TransactionProcessed",
    "inputs": [
      {
        "name": "transactionHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "oldStateHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "newStateHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ProofLengthWrong",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PublicInputsLengthWrong",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ShpleminiFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SumcheckFailed",
    "inputs": []
  }    
]


const walletClient = createWalletClient({ 
    chain: anvil, 
    transport: http(), 
    account: privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6")
})

const zkBank = getContract({
    address: zkBankAddress,
    abi: zkBankABI,
    client: { wallet: walletClient }
})


// We only provide account information in return to a signed request
const accountInformation = async signature => {
    const fromAddress = await recoverAddress({
        hash: hashMessage("Get account data " + Math.floor((new Date().getTime())/60000)),
        signature
    })

    for(var i=0; i<Accounts.length; i++) {
        if (Accounts[i].address == fromAddress) 
            return ({
                nonce: Accounts[i].nonce,
                balance: Accounts[i].balance
            })
    }

    // If we got here, the account is not found
    throw Error(`Address ${fromAddress} has no account`)
}


const generateProof = async (witness, fileID) => {
    const fname = `witness-${fileID}.gz`
    await fs.writeFile(fname, witness)
    await execPromise(`bb prove -b ./noir/target/zkBank.json -w ${fname} -o ${fileID} --oracle_hash keccak --output_format fields`)
    const proof = "0x" + JSON.parse(await fs.readFile(`./${fileID}/proof_fields.json`)).reduce((a,b) => a+b, "").replace(/0x/g, "")
    await execPromise(`rm -r ${fname} ${fileID}`)

    return proof
}


const processMessage = async (message, signature) => {
    // Get the from address and verify the signature
    const hash = hashMessage(message)
    const fromAddress = await recoverAddress({
        hash, 
        signature
    })

    // Parse the message
    const toAddress = message.slice(5,47)
    const [_, amount, nonce] = message.slice(47).split(/\D+/).map(x => Number(x))

    // Get the public key
    const pubKey = await recoverPublicKey({
        hash,
        signature
    })
    
    const pubKeyX = pubKey.slice(4,-64).match(/.{2}/g).map(x => `0x${x}`)
    const pubKeyY = pubKey.slice(-64).match(/.{2}/g).map(x => `0x${x}`)

    // Call the Noir code. If it is successful then the transaction is valid
    let noirResult
    try {
        noirResult = await noir.execute({
            message,
            signature: signature.slice(2,-2).match(/.{2}/g).map(x => `0x${x}`),
            pubKeyX,
            pubKeyY,
            accounts: Accounts
        })
    } catch (err) {
        console.log(`Noir error: ${err}`)
        throw Error("Invalid transaction, not processed")
    }

    const publicFields = noirResult.returnValue.map(x=>'0x' + x.slice(2).padStart(64, "0"))
    const proof = await generateProof(noirResult.witness, `${fromAddress}-${nonce}`)

//    const { proof, publicInputs } = await honk.generateProof(noirResult.witness, { keccak: true })

    try { 
        await zkBank.write.processTransaction([
            proof, publicFields])
    } catch (err) {
        console.log(`Verification error: ${err}`)
        throw Error("Can't verify the transaction onchain")
    }

    let fromAccountNumber, toAccountNumber

    for(var i=0; i<Accounts.length; i++) {
        if (Accounts[i].address == fromAddress)
            fromAccountNumber = i
        if (Accounts[i].address == toAddress)
            toAccountNumber = i            
    }

    Accounts[fromAccountNumber].nonce++
    Accounts[fromAccountNumber].balance -= amount
    Accounts[toAccountNumber].balance += amount

    console.log(`Txn ${message.trimEnd()} processed`)
    console.log("New state:")
    Accounts.map(x => console.log(`${x.address} has ${x.balance} (${x.nonce})`))
}

let Accounts = [
    {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        balance: 100000,
        nonce: 0,
    },
    {
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        balance: 100000,
        nonce: 0,
    },        
    {
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        balance: 100000,
        nonce: 0,
    },
    {
        address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        balance: 100000,
        nonce: 0,
    },
    {
        address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        balance: 100000,
        nonce: 0,
    },
]


/*
const message = "send 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 500 finney (milliEth) 0                             "
const signature = "0xb193b9bf521d3735cc60e3e9b5cac4e55fcc30d07f7153d3bc5372edc9dff0f15ef86ca26c4b8cb989ba1ec44fc7b155626fa2725d6b7261b691683cf9723e0d1b"

processMessage(message, signature)
*/


const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "*")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(204) // No Content
  }

  next()
})



app.post('/transfer', async (req, res) => {
    try {
        await processMessage(req.body.message, req.body.signature)
    } catch (err) {
        res.status(499).json({
            error: err.message
        })        
        console.log(err)
        return
    }

    res.send("OK\n")
})

app.post('/data', async (req, res) => {
    let accountData
    try {
        accountData = await accountInformation(req.body.signature)
    } catch (err) {
        res.status(499).json({
            error: err.message
        })        
        console.log(err)
        return        
    }

    res.send(accountData)
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})
