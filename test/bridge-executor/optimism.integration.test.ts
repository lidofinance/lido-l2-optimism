import { assert } from "chai";
import { BigNumber } from 'ethers'
import {
  StETHStub__factory,
  L2ERC20ExtendedTokensBridge__factory,
  OssifiableProxy__factory,
  OptimismBridgeExecutor__factory,
  ERC20BridgedPermit__factory,
  WstETHStub__factory,
  AccountingOracleStub__factory,
  EmptyContractStub__factory
} from "../../typechain";
import { wei } from "../../utils/wei";
import optimism from "../../utils/optimism";
import testing, { scenario } from "../../utils/testing";
import { BridgingManagerRole } from "../../utils/bridging-management";
import { getExchangeRate } from "../../utils/testing/helpers";
import env from "../../utils/env";
import network from "../../utils/network";
import { getBridgeExecutorParams } from "../../utils/bridge-executor";
import deploymentAll from "../../utils/optimism/deployment";

scenario("Optimism :: Bridge Executor integration test", ctxFactory)
  .step("Activate L2 bridge", async (ctx) => {
    const { l2ERC20ExtendedTokensBridge, bridgeExecutor, l2CrossDomainMessenger } =
      ctx.l2;

    assert.isFalse(
      await l2ERC20ExtendedTokensBridge.hasRole(
        BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
        bridgeExecutor.address
      )
    );
    assert.isFalse(
      await l2ERC20ExtendedTokensBridge.hasRole(
        BridgingManagerRole.WITHDRAWALS_ENABLER_ROLE.hash,
        bridgeExecutor.address
      )
    );
    assert.isFalse(await l2ERC20ExtendedTokensBridge.isDepositsEnabled());
    assert.isFalse(await l2ERC20ExtendedTokensBridge.isWithdrawalsEnabled());

    const actionsSetCountBefore = await bridgeExecutor.getActionsSetCount();

    await l2CrossDomainMessenger.relayMessage(
      0,
      ctx.l1.l1EthGovExecutorAddress,
      bridgeExecutor.address,
      0,
      300_000,
      bridgeExecutor.interface.encodeFunctionData("queue", [
        new Array(4).fill(l2ERC20ExtendedTokensBridge.address),
        new Array(4).fill(0),
        [
          "grantRole(bytes32,address)",
          "grantRole(bytes32,address)",
          "enableDeposits()",
          "enableWithdrawals()",
        ],
        [
          "0x" +
          l2ERC20ExtendedTokensBridge.interface
            .encodeFunctionData("grantRole", [
              BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
              bridgeExecutor.address,
            ])
            .substring(10),
          "0x" +
          l2ERC20ExtendedTokensBridge.interface
            .encodeFunctionData("grantRole", [
              BridgingManagerRole.WITHDRAWALS_ENABLER_ROLE.hash,
              bridgeExecutor.address,
            ])
            .substring(10),
          "0x" +
          l2ERC20ExtendedTokensBridge.interface
            .encodeFunctionData("enableDeposits")
            .substring(10),
          "0x" +
          l2ERC20ExtendedTokensBridge.interface
            .encodeFunctionData("enableWithdrawals")
            .substring(10),
        ],
        new Array(4).fill(false),
      ]),
      { gasLimit: 5_000_000 }
    );

    const actionsSetCountAfter = await bridgeExecutor.getActionsSetCount();

    assert.equalBN(actionsSetCountBefore.add(1), actionsSetCountAfter);

    // execute the last added actions set
    await bridgeExecutor.execute(actionsSetCountAfter.sub(1), { value: 0 });

    assert.isTrue(
      await l2ERC20ExtendedTokensBridge.hasRole(
        BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
        bridgeExecutor.address
      )
    );
    assert.isTrue(
      await l2ERC20ExtendedTokensBridge.hasRole(
        BridgingManagerRole.WITHDRAWALS_ENABLER_ROLE.hash,
        bridgeExecutor.address
      )
    );
    assert.isTrue(await l2ERC20ExtendedTokensBridge.isDepositsEnabled());
    assert.isTrue(await l2ERC20ExtendedTokensBridge.isWithdrawalsEnabled());
  })

  .step("Change Proxy implementation", async (ctx) => {
    const {
      l2Token,
      l2CrossDomainMessenger,
      l2ERC20ExtendedTokensBridgeProxy,
      bridgeExecutor,
    } = ctx.l2;

    const actionsSetCountBefore = await bridgeExecutor.getActionsSetCount();

    const proxyImplBefore =
      await l2ERC20ExtendedTokensBridgeProxy.proxy__getImplementation();

    await l2CrossDomainMessenger.relayMessage(
      0,
      ctx.l1.l1EthGovExecutorAddress,
      bridgeExecutor.address,
      0,
      300_000,
      bridgeExecutor.interface.encodeFunctionData("queue", [
        [l2ERC20ExtendedTokensBridgeProxy.address],
        [0],
        ["proxy__upgradeTo(address)"],
        [
          "0x" +
          l2ERC20ExtendedTokensBridgeProxy.interface
            .encodeFunctionData("proxy__upgradeTo", [l2Token.address])
            .substring(10),
        ],
        [false],
      ]),
      { gasLimit: 5_000_000 }
    );
    const actionSetCount = await bridgeExecutor.getActionsSetCount();

    assert.equalBN(actionsSetCountBefore.add(1), actionSetCount);

    await bridgeExecutor.execute(actionsSetCountBefore, { value: 0 });
    const proxyImplAfter =
      await l2ERC20ExtendedTokensBridgeProxy.proxy__getImplementation();

    assert.notEqual(proxyImplBefore, proxyImplAfter);
    assert.equal(proxyImplAfter, l2Token.address);
  })

  .step("Change proxy Admin", async (ctx) => {
    const {
      l2CrossDomainMessenger,
      l2ERC20ExtendedTokensBridgeProxy,
      bridgeExecutor,
      accounts: { sender },
    } = ctx.l2;

    const actionsSetCountBefore = await bridgeExecutor.getActionsSetCount();

    const proxyAdminBefore = await l2ERC20ExtendedTokensBridgeProxy.proxy__getAdmin();

    await l2CrossDomainMessenger.relayMessage(
      0,
      ctx.l1.l1EthGovExecutorAddress,
      bridgeExecutor.address,
      0,
      300_000,
      bridgeExecutor.interface.encodeFunctionData("queue", [
        [l2ERC20ExtendedTokensBridgeProxy.address],
        [0],
        ["proxy__changeAdmin(address)"],
        [
          "0x" +
          l2ERC20ExtendedTokensBridgeProxy.interface
            .encodeFunctionData("proxy__changeAdmin", [sender.address])
            .substring(10),
        ],
        [false],
      ]),
      { gasLimit: 5_000_000 }
    );
    const actionSetCount = await bridgeExecutor.getActionsSetCount();

    assert.equalBN(actionsSetCountBefore.add(1), actionSetCount);

    await bridgeExecutor.execute(actionsSetCountBefore, { value: 0 });
    const proxyAdminAfter = await l2ERC20ExtendedTokensBridgeProxy.proxy__getAdmin();

    assert.notEqual(proxyAdminBefore, proxyAdminAfter);
    assert.equal(proxyAdminAfter, sender.address);
  })

  .run();

async function ctxFactory() {
  const networkName = env.network("TESTING_OPT_NETWORK", "mainnet");
  const [l1Provider, l2Provider] = network
    .multichain(["eth", "opt"], networkName)
    .getProviders({ forking: true });

  const l1Deployer = testing.accounts.deployer(l1Provider);
  const l2Deployer = testing.accounts.deployer(l2Provider);

  // stETH config
  const l1TokenRebasableName = "Test Token Rebasable";
  const l1TokenRebasableSymbol = "TTR";

  // wstETH config
  const l1TokenNonRebasableName = "Test Non Rebasable Token";
  const l1TokenNonRebasableSymbol = "TT";
  const totalPooledEther = BigNumber.from('9309904612343950493629678');
  const totalShares = BigNumber.from('7975822843597609202337218');

  // Notifier config
  const lido = await new EmptyContractStub__factory(l1Deployer).deploy({ value: wei.toBigNumber(wei`1 ether`) });

  // OpStackPusher
  const l2GasLimitForPushingTokenRate = BigNumber.from(300_000);

  // Accounting oracle config
  const genesisTime = 1;
  const secondsPerSlot = 2;
  const lastProcessingRefSlot = 3;

  // Token rate oracle config
  const maxAllowedL2ToL1ClockLag = BigNumber.from(86400);
  const maxAllowedTokenRateDeviationPerDay = BigNumber.from(500);
  const oldestRateAllowedInPauseTimeSpan = BigNumber.from(86400 * 3);
  const minTimeBetweenTokenRateUpdates = BigNumber.from(3600);
  const tokenRateDecimals = BigNumber.from(27);
  const exchangeRate = getExchangeRate(tokenRateDecimals, totalPooledEther, totalShares);
  const tokenRateOutdatedDelay = BigNumber.from(86400);
  const l1Timestamp = BigNumber.from('1000');

  // L2 Non-Rebasable Token
  const l2TokenNonRebasable = {
    name: "wstETH",
    symbol: "WST",
    version: "1",
    decimals: 18
  };

  // L2 Rebasable Token
  const l2TokenRebasable = {
    name: "stETH",
    symbol: "ST",
    version: "1",
    decimals: 18
  };

  await optimism.testing(networkName).stubL1CrossChainMessengerContract();

  const l1TokenRebasable = await new StETHStub__factory(l1Deployer).deploy(
    l1TokenRebasableName,
    l1TokenRebasableSymbol
  );

  const l1TokenNonRebasable = await new WstETHStub__factory(l1Deployer).deploy(
    l1TokenRebasable.address,
    l1TokenNonRebasableName,
    l1TokenNonRebasableSymbol,
    totalPooledEther,
    totalShares
  );

  const accountingOracle = await new AccountingOracleStub__factory(l1Deployer).deploy(
    genesisTime,
    secondsPerSlot,
    lastProcessingRefSlot
  );

  const optAddresses = optimism.addresses(networkName);
  const testingOnDeployedContracts = testing.env.USE_DEPLOYED_CONTRACTS(false);

  const govBridgeExecutor = testingOnDeployedContracts
    ? OptimismBridgeExecutor__factory.connect(
      testing.env.OPT_GOV_BRIDGE_EXECUTOR(),
      l2Provider
    )
    : await new OptimismBridgeExecutor__factory(l2Deployer).deploy(
      optAddresses.L2CrossDomainMessenger,
      l1Deployer.address,
      ...getBridgeExecutorParams(),
      l2Deployer.address
    );

  const l1EthGovExecutorAddress =
    await govBridgeExecutor.getEthereumGovernanceExecutor();

  const [, optDeployScript] = await deploymentAll(
    networkName
  ).deployAllScript(
    {
      l1TokenNonRebasable: l1TokenNonRebasable.address,
      l1TokenRebasable: l1TokenRebasable.address,
      accountingOracle: accountingOracle.address,
      l2GasLimitForPushingTokenRate: l2GasLimitForPushingTokenRate,
      lido: lido.address,

      deployer: l1Deployer,
      admins: {
        proxy: l1Deployer.address,
        bridge: l1Deployer.address
      },
      contractsShift: 0,
    },
    {
      tokenRateOracle: {
        tokenRateOutdatedDelay: tokenRateOutdatedDelay,
        maxAllowedL2ToL1ClockLag: maxAllowedL2ToL1ClockLag,
        maxAllowedTokenRateDeviationPerDayBp: maxAllowedTokenRateDeviationPerDay,
        oldestRateAllowedInPauseTimeSpan: oldestRateAllowedInPauseTimeSpan,
        minTimeBetweenTokenRateUpdates: minTimeBetweenTokenRateUpdates,
        tokenRate: exchangeRate,
        l1Timestamp: l1Timestamp
      },
      l2TokenNonRebasable: {
        name: l2TokenNonRebasable.name,
        symbol: l2TokenNonRebasable.symbol,
        version: l2TokenNonRebasable.version,
        decimals: l2TokenNonRebasable.decimals
      },
      l2TokenRebasable: {
        name: l2TokenRebasable.name,
        symbol: l2TokenRebasable.symbol,
        version: l2TokenRebasable.version,
        decimals: l2TokenRebasable.decimals
      },

      deployer: l2Deployer,
      admins: {
        proxy: govBridgeExecutor.address,
        bridge: govBridgeExecutor.address,
      },
      contractsShift: 0,
    }
  );

  await optDeployScript.run();

  const l2Token = ERC20BridgedPermit__factory.connect(
    optDeployScript.tokenProxyAddress,
    l2Deployer
  );
  const l2ERC20ExtendedTokensBridge = L2ERC20ExtendedTokensBridge__factory.connect(
    optDeployScript.tokenBridgeProxyAddress,
    l2Deployer
  );
  const l2ERC20ExtendedTokensBridgeProxy = OssifiableProxy__factory.connect(
    optDeployScript.tokenBridgeProxyAddress,
    l2Deployer
  );

  const optContracts = optimism.contracts(networkName, { forking: true });

  const l1CrossDomainMessengerAliased = await testing.impersonate(
    testing.accounts.applyL1ToL2Alias(
      optContracts.L1CrossDomainMessenger.address
    ),
    l2Provider
  );

  const l2CrossDomainMessenger =
    await optContracts.L2CrossDomainMessenger.connect(
      l1CrossDomainMessengerAliased
    );

  await testing.setBalance(
    await l2CrossDomainMessenger.signer.getAddress(),
    wei.toBigNumber(wei`1 ether`),
    l2Provider
  );

  return {
    l1: {
      accounts: {
        admin: l1Deployer,
      },
      l1EthGovExecutorAddress,
    },
    l2: {
      l2Token,
      bridgeExecutor: govBridgeExecutor.connect(l2Deployer),
      l2ERC20ExtendedTokensBridge,
      l2CrossDomainMessenger,
      l2ERC20ExtendedTokensBridgeProxy,
      accounts: {
        sender: testing.accounts.sender(l2Provider),
        admin: l2Deployer,
      },
    },
  };
}
