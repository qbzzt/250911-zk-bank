import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
    createWalletClient,
    custom,
    hashMessage,
} from 'viem'

export default attrs =>  {

  const accounts = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  ]

  const account = useAccount()

  const wallet = createWalletClient({
    transport: custom(window.ethereum!)
  })

  const fromAccount = account.address
  const [ toAccount, setToAccount ] = useState(accounts[1])
  const [ ethAmount, setEthAmount ] = useState(0)
  const [ signature, setSignature ] = useState("")
  const [ hash, setHash ] = useState("") 
  const [ nonce, setNonce ] = useState(0)
  const [ balance, setBalance ] = useState(0)
  const [ accountDataAvailabe, setAccountDataAvailable ] = useState(false)

  const message = `send ${toAccount} ${ethAmount*1000} finney (milliEth) ${nonce}`.padEnd(100, " ")

  const getAccountData = async () => {
    const signature = await wallet.signMessage({
        account: fromAccount,
        message: "Get account data " + Math.floor((new Date().getTime())/60000)
    })

    const httpResponse = await fetch("http://localhost:3000/data", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            signature
        })
    })

    const accountData = await httpResponse.json()

    setNonce(accountData.nonce)
    setBalance(accountData.balance)
    setEthAmount(0)
    setAccountDataAvailable(true)
  }


  const sign = async () => {
    const signature = await wallet.signMessage({
        account: fromAccount,
        message,
    })
    const hash = hashMessage(message)

    setSignature(signature)
    setHash(hash)

    const httpResponse = await fetch("http://localhost:3000/transfer", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            signature,
            message
        })
    })

    setAccountDataAvailable(false)
  }

  return (
    <>
        <h2>Account Data</h2>
        <button onClick={getAccountData}>
            Update account data
        </button>
        {accountDataAvailabe && (
        <>
            <table>
                <tr>
                    <th>Balance</th>
                    <td>{balance/1000}</td>
                </tr>
                <tr>
                    <th>Nonce</th>
                    <td>{nonce}</td>
                </tr>
            </table>
            <h2>Transfer</h2>
            <table border="true">
                <tr>
                    <th>From (your address)</th>
                    <td>{fromAccount}</td>
                </tr>
                <tr>
                    <th>To</th>
                    <td>
                        <select onChange={event => setToAccount(event.target.value)}
                            value={toAccount}>
                            {
                                accounts.map(
                                    account => (
                                        <option value={account} key={account}
                                            disabled={account == fromAccount}>
                                        {account}</option>
                                    )
                                )
                            }
                        </select>
                    </td>
                </tr>
                <tr>
                    <th>Amount</th>
                    <td>
                        <input type="range" min="0" max={balance/1000} step="0.1" value={ethAmount} 
                            onChange={event => setEthAmount(event.target.value)}
                        />
                        {ethAmount} ETH
                    </td>
                </tr>
            </table>

            <h3>Presignature values</h3>
            <table border="true">
                <tr>
                    <th>Message to sign</th>
                    <td><pre>{message}</pre></td>
                </tr>
                <tr>
                    <th>Message hash</th>
                    <td>{hashMessage(message)}</td>
                </tr>
                <tr>
                    <th>Message length</th>
                    <td>{message.length}</td>
                </tr>
            </table>

            <p/>

            <button onClick={sign}>Transfer</button>
        </>
        )}
    </>
  )

}

// export default Transfer
