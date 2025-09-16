import { useState } from 'react'
import { useAccount } from 'wagmi'
import {
    createWalletClient,
    custom,
    hashMessage,
    recoverPublicKey,
    verifyMessage
} from 'viem'
import { mainnet } from 'viem/chains'

export default attrs =>  {

  const hexToArray = hexString => JSON.stringify(hexString.match(/../g).map(x => `0x${x}`))

  const accountInProverToml = address => `
[[accounts]]
address="${address}"
balance=100_000
nonce=0
`

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
  const [ ethAmount, setEthAmount ] = useState(0.5)
  const [ signature, setSignature ] = useState("")
  const [ hash, setHash ] = useState("") 
  const [ pubKey, setPubKey ] = useState("")
  const [ proverToml, setProverToml ] = useState("")
  const nonce = 0

  const message = `send ${toAccount} ${ethAmount*1000} finney (milliEth) ${nonce}`.padEnd(100, " ")

  const sign = async () => {
    const signature = await wallet.signMessage({
        account: fromAccount,
        message,
    })
    const hash = hashMessage(message)
    const pubKey = await recoverPublicKey({
        hash,
        signature
    })

    setSignature(signature)
    setHash(hash)
    setPubKey(pubKey)
    let proverToml = `
message="${message}"

pubKeyX=${hexToArray(pubKey.slice(4,4+2*32))}
pubKeyY=${hexToArray(pubKey.slice(4+2*32))}
signature=${hexToArray(signature.slice(2,-2))}

${accounts.map(accountInProverToml).reduce((a,b) => a+b, "")}
`

    setProverToml(proverToml)
  }

  return (
    <>
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
                        value={toAccount}
                        >
                        {
                            accounts.map(
                                account => (
                                    <option value={account} key={account}
                                        disabled={account == fromAccount}
                                    >{account}</option>
                                )
                            )
                        }
                    </select>
                </td>
            </tr>
            <tr>
                <th>Amount</th>
                <td>
                    <input type="range" min="0" max="2" step="0.1" value={ethAmount} 
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

        <button onClick={sign}>Sign</button>

        <h3>Signature values</h3>
        <table border="true">
            <tr>
                <th>Signature</th>
                <td>{signature}</td>
            </tr>
            <tr>
                <th>Message hash</th>
                <td>{hash}</td>
            </tr>
            <tr>
                <th>Public key</th>
                <td>{pubKey}</td>
            </tr>
        </table>

        <h3>Prover.toml</h3>
        <pre>{proverToml}</pre>

    </>
  )

}

// export default Transfer
