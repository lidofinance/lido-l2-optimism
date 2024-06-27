import { ethers } from "ethers";
import { ethers } from "hardhat";
import pLimit from "p-limit";

async function main() {

  //http://localhost:8545
  const ethereumNode = ''
  const optimismNode = ''

  // Set up providers
  const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumNode);
  const optimismProvider = new ethers.providers.JsonRpcProvider(optimismNode);

  const ethBridgeAddress = "0x76943C0D61395d8F2edF9060e1533529cAe05dE6"
  const optBridgeAddress = "0x8e01013243a96601a86eb3153f0d9fa4fbfb6957"

  // Define the ABI on the Ethereum
  const ethBridgeAbi = [
    "event ERC20DepositInitiated(address indexed _l1Token,address indexed _l2Token,address indexed _from,address _to,uint256 _amount, bytes _data)",
    "event ERC20WithdrawalFinalized(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)"
  ];
  const ethInterface = new ethers.utils.Interface(ethBridgeAbi);
  const topicEthDeposit = ethers.utils.id("ERC20DepositInitiated(address,address,address,address,uint256,bytes)")
  const topicEthWithdraw = ethers.utils.id("ERC20WithdrawalFinalized(address,address,address,address,uint256,bytes)")


  // Define the ABI on the Optimism
  const optBridgeAbi = [
    "event DepositFinalized(address indexed _l1Token,address indexed _l2Token,address indexed _from,address _to,uint256 _amount,bytes _data)",
    "event WithdrawalInitiated(address indexed _l1Token,address indexed _l2Token,address indexed _from,address _to,uint256 _amount,bytes _data)"
  ];
  const optInterface = new ethers.utils.Interface(optBridgeAbi);
  const topicOptDeposit = ethers.utils.id("DepositFinalized(address,address,address,address,uint256,bytes)")
  const topicOptWithdraw = ethers.utils.id("WithdrawalInitiated(address,address,address,address,uint256,bytes)")


  // Define the starting and ending block numbers
  // creation code
  // https://etherscan.io/tx/0x1bc90e7c6fe12e03691f7eccf025f3a244ea5a4888c7fb274f45f5e1004110ca
  const startEthBlock = 15281202;

  // creation code
  // https://optimistic.etherscan.io/tx/0xd0a75128fcedaa0acfe5ccb2740a1a47a6a8e47bca844dee23e7b4cc747ea4d1
  const startOptBlock = 17831155;

  const blockStep = 100000;

  // Get the latest block numbers from both networks
  const latestEthBlock = await ethereumProvider.getBlockNumber();
  const latestOptBlock = await optimismProvider.getBlockNumber();

  const fetchLogs = async (
    provider: ethers.providers.JsonRpcProvider,
    startBlock: number,
    latestBlock: number,
    bridgeAddress: string,
    logsInterface: ethers.utils.Interface,
    topicDeposit: string,
    topicWithdraw: string,
    networkName: string
  ) => {

    console.log(`Get Ethereum logs:`);
    console.log(`     address: ${bridgeAddress}`);
    console.log(`     startBlock: ${startBlock}`);
    console.log(`     endBlock: ${latestBlock}`);
    console.log(`     topicDeposit: ${topicDeposit}`);
    console.log(`     topicWithdraw: ${topicWithdraw}`);

    let depositsCount = 0;
    let withdrawalsCount = 0;
    let depositsTotal = ethers.BigNumber.from(0);
    let withdrawalsTotal = ethers.BigNumber.from(0);

    // Limit concurrency to 10 threads
    const limit = pLimit(10);

    // Array to hold promises for each block range iteration
    const promises = [];

    for (let fromBlock = startBlock; fromBlock < latestBlock; fromBlock += blockStep) {
      const toBlock = Math.min(fromBlock + blockStep - 1, latestBlock)



      // Create promise for fetching logs in this block range
      const promise = limit(async () => {
        const filterDeposit = {
          address: bridgeAddress,
          topics: [
            topicDeposit
          ],
          fromBlock,
          toBlock
        };

        const filterWithdraw = {
          address: bridgeAddress,
          topics: [
            topicWithdraw
          ],
          fromBlock,
          toBlock
        };

        // Fetch logs from the forked network
        const logsDeposits = await provider.getLogs(filterDeposit);
        logsDeposits.forEach((log) => {
          const parsedLog = logsInterface.parseLog(log);

          depositsCount++
          depositsTotal = depositsTotal.add(parsedLog.args._amount)
        });

        // Fetch logs from the forked network
        const logsWithdraw = await provider.getLogs(filterWithdraw);
        logsWithdraw.forEach((log) => {
          const parsedLog = logsInterface.parseLog(log);
          withdrawalsCount++
          withdrawalsTotal = withdrawalsTotal.add(parsedLog.args._amount)
        });

        console.log(`${networkName} proceed blocks ${fromBlock}-${toBlock} of ${latestBlock}}`)
      });

      // Push promise into array
      promises.push(promise);
    }

    // Execute all promises in parallel
    await Promise.all(promises);

    const balance = depositsTotal.sub(withdrawalsTotal)

    console.log(' ')

    return {
      depositsCount,
      depositsTotal,
      withdrawalsCount,
      withdrawalsTotal,
      balance
    }
  }

  const promises = [
    // Promise for Ethereum
    fetchLogs(ethereumProvider, startEthBlock, latestEthBlock, ethBridgeAddress, ethInterface, topicEthDeposit, topicEthWithdraw, "Ethereum"),
    fetchLogs(optimismProvider, startOptBlock, latestOptBlock, optBridgeAddress, optInterface, topicOptDeposit, topicOptWithdraw, "Optimism"),
  ];

  // Execute all promises in parallel and wait for all blocks to be processed
  const results = await Promise.all(promises);

  const fromEthereum = results[0]
  const fromOptimism = results[1]


  const table = {}
  table.L1 = {
    deposits: fromEthereum.depositsTotal.toString(),
    depCount: fromEthereum.depositsCount,
    withdrawals: fromEthereum.withdrawalsTotal.toString(),
    wthCount: fromEthereum.withdrawalsCount,
    balance: fromEthereum.balance.toString()
  }
  table.L2 = {
    deposits: fromOptimism.depositsTotal.toString(),
    depCount: fromOptimism.depositsCount,
    withdrawals: fromOptimism.withdrawalsTotal.toString(),
    wthCount: fromOptimism.withdrawalsCount,
    balance: fromOptimism.balance.toString()
  }
  table.diff = {
    deposits: fromEthereum.depositsTotal.sub(fromOptimism.depositsTotal).toString(),
    depCount: fromEthereum.depositsCount-fromOptimism.depositsCount,
    withdrawals: fromEthereum.withdrawalsTotal.sub(fromOptimism.withdrawalsTotal).toString(),
    wthCount: fromEthereum.withdrawalsCount-fromOptimism.withdrawalsCount,
    balance: fromEthereum.balance.sub(fromOptimism.balance).toString()
  }
  console.table(table)

  console.log(' ')
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
