import fs from 'fs/promises'
import { Noir } from '@noir-lang/noir_js'
import express from 'express'
import {
    hashMessage,
    recoverAddress,
    recoverPublicKey,
    hexToBytes,
} from 'viem'

const circuit = JSON.parse(await fs.readFile("./noir/target/zkBank.json"))
const noir = new Noir(circuit)
const port = 3000



// We only provide account information in return to a signed request
const accountInformation = async signature => {
    const fromAddress = await recoverAddress({
        hash: hashMessage("Get account data"),
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
        balance: 5000,
        nonce: 0,
    },
    {
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        balance: 10000,
        nonce: 0,
    },        
    {
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        balance: 10000,
        nonce: 0,
    },
    {
        address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        balance: 10000,
        nonce: 0,
    },
    {
        address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        balance: 10000,
        nonce: 0,
    },
]

const message = "send 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 500 finney (milliEth) 0                             "
const signature = "0xb193b9bf521d3735cc60e3e9b5cac4e55fcc30d07f7153d3bc5372edc9dff0f15ef86ca26c4b8cb989ba1ec44fc7b155626fa2725d6b7261b691683cf9723e0d1b"


// processMessage(message, signature)


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
