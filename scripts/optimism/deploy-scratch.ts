import env from "../../utils/env";
import prompt from "../../utils/prompt";
import network from "../../utils/network";
import deployment from "../../utils/deployment";
import { BridgingManagement } from "../../utils/bridging-management";
import deploymentAll from "../../utils/optimism/deployment";

async function main() {
  const networkName = env.network();
  const ethOptNetwork = network.multichain(["eth", "opt"], networkName);

  const [ethDeployer] = ethOptNetwork.getSigners(env.privateKey(), {
    forking: env.forking(),
  });
  const [, optDeployer] = ethOptNetwork.getSigners(
    env.string("OPT_DEPLOYER_PRIVATE_KEY"),
    {
      forking: env.forking(),
    }
  );

  const deploymentConfig = deployment.loadMultiChainDeploymentConfig();

  const [l1DeployScript, l2DeployScript] = await deploymentAll (networkName, { logger: console })
    .deployAllScript(
      {
        l1TokenNonRebasable: deploymentConfig.l1TokenNonRebasable,
        l1TokenRebasable: deploymentConfig.l1RebasableToken,
        accountingOracle: deploymentConfig.accountingOracle,
        l2GasLimitForPushingTokenRate: deploymentConfig.l2GasLimitForPushingTokenRate,
        lido: deploymentConfig.lido,
        deployer: ethDeployer,
        admins: {
          proxy: deploymentConfig.l1.proxyAdmin,
          bridge: ethDeployer.address
        },
        contractsShift: 0,
      },
      {
        tokenRateOracle: {
          tokenRateOutdatedDelay: deploymentConfig.tokenRateOutdatedDelay,
          maxAllowedL2ToL1ClockLag: deploymentConfig.maxAllowedL2ToL1ClockLag,
          maxAllowedTokenRateDeviationPerDayBp: deploymentConfig.maxAllowedTokenRateDeviationPerDayBp,
          oldestRateAllowedInPauseTimeSpan: deploymentConfig.oldestRateAllowedInPauseTimeSpan,
          minTimeBetweenTokenRateUpdates: deploymentConfig.minTimeBetweenTokenRateUpdates,
          tokenRate: deploymentConfig.tokenRateValue,
          l1Timestamp: deploymentConfig.tokenRateL1Timestamp
        },
        l2TokenNonRebasable: {
          version: "1"
        },
        l2TokenRebasable: {
          version: "1"
        },

        deployer: optDeployer,
        admins: {
          proxy: deploymentConfig.l2.proxyAdmin,
          bridge: optDeployer.address,
        },
        contractsShift: 0,
      }
    );

  await deployment.printMultiChainDeploymentConfig(
    "Deploy Optimism Bridge",
    ethDeployer,
    optDeployer,
    deploymentConfig,
    l1DeployScript,
    l2DeployScript
  );

  await prompt.proceed();

  await l1DeployScript.run();
  await l2DeployScript.run();

  const l1BridgingManagement = new BridgingManagement(
    l1DeployScript.bridgeProxyAddress,
    ethDeployer,
    { logger: console }
  );

  const l2BridgingManagement = new BridgingManagement(
    l2DeployScript.tokenBridgeProxyAddress,
    optDeployer,
    { logger: console }
  );

   await l1BridgingManagement.setup(deploymentConfig.l1);
   await l2BridgingManagement.setup(deploymentConfig.l2);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
