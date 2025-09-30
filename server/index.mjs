import fs from 'fs/promises'
import { Noir } from '@noir-lang/noir_js'
// import { UltraHonkBackend } from "@aztec/bb.js"
import { exec } from 'child_process'
import util from 'util'

import express from 'express'
import {
    hashMessage,
    recoverAddress,
    recoverPublicKey,
    createPublicClient,
    getContract,
    http
} from 'viem'
import { anvil } from 'viem/chains'

const execPromise = util.promisify(exec)

const circuit = JSON.parse(await fs.readFile("./noir/target/zkBank.json"))
const noir = new Noir(circuit)

// I couldn't get this API to work, so I'm using the command line bb instead
// const honk = new UltraHonkBackend(circuit.bytecode, { threads: 1 })

const port = 3000

const verifierAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
const verifierABI = [
    {
        "type": "function",
        "name": "verify",
        "inputs": [
        {
            "name": "proof",
            "type": "bytes",
            "internalType": "bytes"
        },
        {
            "name": "publicInputs",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
        }
        ],
        "outputs": [
        {
            "name": "",
            "type": "bool",
            "internalType": "bool"
        }
        ],
        "stateMutability": "view"
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

const publicClient = createPublicClient({ 
    chain: anvil, 
    transport: http(), 
})

const verifier = getContract({
    address: verifierAddress,
    abi: verifierABI,
    client: { public: publicClient }
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

const uint8ArrayToHex = uint8Array =>
  '0x' + Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, '0')).join('')


// Created using bb prove -b ./target/zkBank.json -w ./target/zkBank.gz -o ./proof/ --oracle_hash keccak --output_format bytes_and_fields


// const pubFields = JSON.parse(await fs.readFile("./noir/proof/public_inputs_fields.json"))

// const proof = "0x" + proofTemp.reduce((a,b) => a+b, "").replace(/0x/g, "")

const generateProof = async (witness, fileID) => {
    const fname = `witness-${fileID}.gz`
    await fs.writeFile(fname, witness)
    await execPromise(`bb prove -b ./noir/target/zkBank.json -w ${fname} -o ${fileID} --oracle_hash keccak --output_format fields`)
    const proof = "0x" + JSON.parse(await fs.readFile(`./${fileID}/proof_fields.json`)).reduce((a,b) => a+b, "").replace(/0x/g, "")
    await execPromise("rm -rf ${fname} ${fileID}")

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
        const verifierResult = 
            await verifier.read.verify([
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


const message = "send 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 500 finney (milliEth) 0                             "
const signature = "0xb193b9bf521d3735cc60e3e9b5cac4e55fcc30d07f7153d3bc5372edc9dff0f15ef86ca26c4b8cb989ba1ec44fc7b155626fa2725d6b7261b691683cf9723e0d1b"

processMessage(message, signature)


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
