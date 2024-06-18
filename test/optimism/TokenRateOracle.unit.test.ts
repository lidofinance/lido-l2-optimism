import hre from "hardhat";
import { assert } from "chai";
import { BigNumber } from "ethers";
import { wei } from "../../utils/wei";
import testing, { unit } from "../../utils/testing";
import { tokenRateOracleUnderProxy } from "../../utils/testing/contractsFactory";
import { getContractTransactionTimestamp, getBlockTimestamp } from "../../utils/testing/helpers";
import { TokenRateOracle__factory, CrossDomainMessengerStub__factory } from "../../typechain";

unit("TokenRateOracle", ctxFactory)

  .test("constructor() :: zero params", async (ctx) => {

    const { deployer, stranger, zero } = ctx.accounts;

    await assert.revertsWith(new TokenRateOracle__factory(
      deployer
    ).deploy(
      zero.address,
      stranger.address,
      stranger.address,
      0,
      0,
      0,
      0,
      0
    ), "ErrorZeroAddressMessenger()");

    await assert.revertsWith(new TokenRateOracle__factory(
      deployer
    ).deploy(
      stranger.address,
      zero.address,
      stranger.address,
      0,
      0,
      0,
      0,
      0
    ), "ErrorZeroAddressL2ERC20TokenBridge()");

    await assert.revertsWith(new TokenRateOracle__factory(
      deployer
    ).deploy(
      stranger.address,
      stranger.address,
      zero.address,
      0,
      0,
      0,
      0,
      0
    ), "ErrorZeroAddressL1TokenRatePusher()");
  })

  .test("state after init", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { bridge, l1TokenBridgeEOA } = ctx.accounts;
    const {
      tokenRate,
      decimals,
      rateL1Timestamp,
      blockTimestampOfDeployment,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay
    } = ctx.constants;

    assert.equal(await tokenRateOracle.MESSENGER(), l2MessengerStub.address);
    assert.equal(await tokenRateOracle.L2_ERC20_TOKEN_BRIDGE(), bridge.address);
    assert.equal(await tokenRateOracle.L1_TOKEN_RATE_PUSHER(), l1TokenBridgeEOA.address);
    assert.equalBN(await tokenRateOracle.TOKEN_RATE_OUTDATED_DELAY(), tokenRateOutdatedDelay);
    assert.equalBN(await tokenRateOracle.MAX_ALLOWED_L2_TO_L1_CLOCK_LAG(), maxAllowedL2ToL1ClockLag);
    assert.equalBN(await tokenRateOracle.MAX_ALLOWED_TOKEN_RATE_DEVIATION_PER_DAY_BP(), maxAllowedTokenRateDeviationPerDay);
    assert.equalBN(await tokenRateOracle.latestAnswer(), tokenRate);

    const {
      roundId_,
      answer_,
      startedAt_,
      updatedAt_,
      answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    assert.equalBN(roundId_, rateL1Timestamp);
    assert.equalBN(answer_, tokenRate);
    assert.equalBN(startedAt_, rateL1Timestamp);
    assert.equalBN(updatedAt_, blockTimestampOfDeployment);
    assert.equalBN(answeredInRound_, rateL1Timestamp);

    assert.equalBN(await tokenRateOracle.decimals(), decimals);
  })

  .test("initialize() :: petrified version", async (ctx) => {
    const { deployer, bridge, l1TokenBridgeEOA } = ctx.accounts;
    const { l2MessengerStub } = ctx.contracts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const tokenRateOracleImpl = await new TokenRateOracle__factory(deployer).deploy(
      l2MessengerStub.address,
      bridge.address,
      l1TokenBridgeEOA.address,
      86400,
      86400,
      500,
      86400*3,
      3600
    );

    const petrifiedVersionMark = hre.ethers.constants.MaxUint256;
    assert.equalBN(await tokenRateOracleImpl.getContractVersion(), petrifiedVersionMark);

    await assert.revertsWith(
      tokenRateOracleImpl.initialize(deployer.address, tokenRate, blockTimestampOfDeployment),
      "NonZeroContractVersionOnInit()"
    );
  })

  .test("initialize() :: don't allow to initialize twice", async (ctx) => {
    const { deployer } = ctx.accounts;
    const { tokenRateOracle } = ctx.contracts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    assert.equalBN(await tokenRateOracle.getContractVersion(), 1);

    await assert.revertsWith(
      tokenRateOracle.initialize(deployer.address, tokenRate, blockTimestampOfDeployment),
      "NonZeroContractVersionOnInit()"
    );
  })

  .test("initialize() :: token rate is out of range", async (ctx) => {
    const { deployer, bridge, l1TokenBridgeEOA } = ctx.accounts;
    const { l2MessengerStub } = ctx.contracts;
    const {
      blockTimestampOfDeployment,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay,
      oldestRateAllowedInPauseTimeSpan,
      minTimeBetweenTokenRateUpdates
    } = ctx.constants;

    const tokenRateMin = BigNumber.from(10).pow(27-2);
    const tokenRateMax = BigNumber.from(10).pow(27+2);

    await assert.revertsWith(
      tokenRateOracleUnderProxy(
        deployer,
        l2MessengerStub.address,
        bridge.address,
        l1TokenBridgeEOA.address,
        tokenRateOutdatedDelay,
        maxAllowedL2ToL1ClockLag,
        maxAllowedTokenRateDeviationPerDay,
        oldestRateAllowedInPauseTimeSpan,
        minTimeBetweenTokenRateUpdates,
        tokenRateMin.sub(1),
        blockTimestampOfDeployment
      ),
      "ErrorTokenRateIsOutOfSaneRange(" + tokenRateMin.sub(1) + ")"
    );

    await assert.revertsWith(
      tokenRateOracleUnderProxy(
        deployer,
        l2MessengerStub.address,
        bridge.address,
        l1TokenBridgeEOA.address,
        tokenRateOutdatedDelay,
        maxAllowedL2ToL1ClockLag,
        maxAllowedTokenRateDeviationPerDay,
        oldestRateAllowedInPauseTimeSpan,
        minTimeBetweenTokenRateUpdates,
        tokenRateMax.add(1),
        blockTimestampOfDeployment
      ),
      "ErrorTokenRateIsOutOfSaneRange(" + tokenRateMax.add(1) + ")"
    );
  })

  .test("initialize() :: time is out of init range", async (ctx) => {
    const { deployer, bridge, l1TokenBridgeEOA } = ctx.accounts;
    const { l2MessengerStub } = ctx.contracts;
    const {
      tokenRate,
      blockTimestampOfDeployment,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay,
      oldestRateAllowedInPauseTimeSpan,
      minTimeBetweenTokenRateUpdates
    } = ctx.constants;

    const wrongTimeMax = blockTimestampOfDeployment.add(maxAllowedL2ToL1ClockLag).add(20);

    await assert.revertsWith(
      tokenRateOracleUnderProxy(
        deployer,
        l2MessengerStub.address,
        bridge.address,
        l1TokenBridgeEOA.address,
        tokenRateOutdatedDelay,
        maxAllowedL2ToL1ClockLag,
        maxAllowedTokenRateDeviationPerDay,
        oldestRateAllowedInPauseTimeSpan,
        minTimeBetweenTokenRateUpdates,
        tokenRate,
        wrongTimeMax
      ),
      "ErrorL1TimestampExceededMaxAllowedClockLag(" + wrongTimeMax + ")"
    );
  })

  .test("initialize() :: wrong maxAllowedTokenRateDeviationPerDay", async (ctx) => {
    const { deployer, bridge, l1TokenBridgeEOA } = ctx.accounts;
    const { l2MessengerStub } = ctx.contracts;

    const maxAllowedTokenRateDeviationPerDay = 10001;

    await assert.revertsWith(
      new TokenRateOracle__factory(deployer).deploy(
        l2MessengerStub.address,
        bridge.address,
        l1TokenBridgeEOA.address,
        86400,
        86400,
        maxAllowedTokenRateDeviationPerDay,
        86400*3,
        3600
      ),
      "ErrorMaxTokenRateDeviationIsOutOfRange()"
    );
  })

  .test("updateRate() :: called by non-bridge account", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { stranger } = ctx.accounts;
    await assert.revertsWith(
      tokenRateOracle.connect(stranger).updateRate(10, 40),
      "ErrorNotBridgeOrTokenRatePusher()"
    );
  })

  .test("updateRate() :: called by messenger with incorrect cross-domain sender", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { stranger, l2MessengerStubEOA } = ctx.accounts;
    await l2MessengerStub.setXDomainMessageSender(stranger.address);
    await assert.revertsWith(
      tokenRateOracle.connect(l2MessengerStubEOA).updateRate(10, 40),
      "ErrorNotBridgeOrTokenRatePusher()"
    );
  })

  .test("updateRate() :: L1 time exceeded allowed L2 clock lag", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, maxAllowedL2ToL1ClockLag } = ctx.constants;

    const exceededTime = blockTimestampOfDeployment.add(maxAllowedL2ToL1ClockLag).add(40); // more than maxAllowedL2ToL1ClockLag
    await assert.revertsWith(
      tokenRateOracle.connect(bridge).updateRate(tokenRate, exceededTime),
      "ErrorL1TimestampExceededAllowedClockLag(" + tokenRate + ", " + exceededTime + ")"
    )
  })

  .test("updateRate() :: received token rate has l1 time in the past", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, rateL1Timestamp } = ctx.constants;

    const rateL1TimestampInPast = rateL1Timestamp.sub(100);

    const tx0 = await tokenRateOracle
      .connect(bridge)
      .updateRate(tokenRate, rateL1TimestampInPast);

    await assert.emits(tokenRateOracle, tx0, "DormantTokenRateUpdateIgnored", [
      rateL1TimestampInPast,
      rateL1Timestamp,
    ]);
    await assert.notEmits(tokenRateOracle, tx0, "RateUpdated");
  })

  .test("updateRate() :: received token rate has the same l1 time", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, rateL1Timestamp } = ctx.constants;

    const tx = await tokenRateOracle
      .connect(bridge)
      .updateRate(tokenRate, rateL1Timestamp);

    const updatedAt = await getContractTransactionTimestamp(ctx.provider, tx);

    await assert.emits(tokenRateOracle, tx, "RateReceivedTimestampUpdated", [updatedAt]);

    const {
      roundId_,
      answer_,
      startedAt_,
      updatedAt_,
      answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    assert.equalBN(updatedAt_, updatedAt);
  })

  .test("updateRate() :: token rate updates too often", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, rateL1Timestamp, minTimeBetweenTokenRateUpdates } = ctx.constants;

    const rateL1TimestampWithinTooOften = rateL1Timestamp.add(minTimeBetweenTokenRateUpdates).sub(1);

    const tx0 = await tokenRateOracle
      .connect(bridge)
      .updateRate(tokenRate, rateL1TimestampWithinTooOften);

    await assert.emits(tokenRateOracle, tx0, "UpdateRateIsTooOften", [rateL1TimestampWithinTooOften, rateL1Timestamp]);
    await assert.notEmits(tokenRateOracle, tx0, "RateUpdated");
  })

  .test("updateRate() :: token rate is out of range 1 day", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const {
      tokenRate,
      blockTimestampOfDeployment,
      maxAllowedTokenRateDeviationPerDay,
      minTimeBetweenTokenRateUpdates
    } = ctx.constants;

    const blockTimestampForNextUpdate = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1);
    const tokenRateTooBig = tokenRate.mul(
      BigNumber.from('10000')
        .add(maxAllowedTokenRateDeviationPerDay)
        .add(100)
    )
      .div(BigNumber.from('10000'));  // 1% more than allowed
    const tokenRateTooSmall = tokenRate.mul(
      BigNumber.from('10000')
        .sub(maxAllowedTokenRateDeviationPerDay)
        .sub(100)
    )
      .div(BigNumber.from('10000')); // 1% less than allowed

    const tokenRateAllowed = tokenRate.mul(
      BigNumber.from('10000')
        .add(maxAllowedTokenRateDeviationPerDay)
        .sub(100)
    )
      .div(BigNumber.from('10000')); // allowed within one day

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment);

    await assert.revertsWith(
      tokenRateOracle.connect(bridge).updateRate(tokenRateTooBig, blockTimestampForNextUpdate),
      "ErrorTokenRateIsOutOfRange(" + tokenRateTooBig + ", " + blockTimestampForNextUpdate + ")"
    );

    await assert.revertsWith(
      tokenRateOracle.connect(bridge).updateRate(tokenRateTooSmall, blockTimestampForNextUpdate),
      "ErrorTokenRateIsOutOfRange(" + tokenRateTooSmall + ", " + blockTimestampForNextUpdate + ")"
    );

    await tokenRateOracle.connect(bridge).updateRate(tokenRateAllowed, blockTimestampForNextUpdate);
  })

  .test("updateRate() :: token rate is out of range 2 days", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, maxAllowedTokenRateDeviationPerDay } = ctx.constants;

    const tokenRateFirstUpdate = tokenRate.add(10);

    const tokenRateTooBig = tokenRate.mul(
      BigNumber.from('10000')
        .add(maxAllowedTokenRateDeviationPerDay.mul(2))
        .add(100)
    )
      .div(BigNumber.from('10000'));  // 1% more than allowed in 2 days

    const tokenRateTooSmall = tokenRate.mul(
      BigNumber.from('10000')
        .sub(maxAllowedTokenRateDeviationPerDay.mul(2))
        .sub(100)
    )
      .div(BigNumber.from('10000')); // 1% less than allowed in 2 days

    const tokenRateSizeDoesMatterAfterAll = tokenRate.mul(
      BigNumber.from('10000')
        .add(maxAllowedTokenRateDeviationPerDay.mul(2))
        .sub(100)
    )
      .div(BigNumber.from('10000')); // allowed within 2 days


    await tokenRateOracle.connect(bridge).updateRate(tokenRateFirstUpdate, blockTimestampOfDeployment.add(1000));

    const blockTimestampMoreThanOneDays = blockTimestampOfDeployment.add(86400 + 2000);
    await assert.revertsWith(
      tokenRateOracle.connect(bridge).updateRate(tokenRateTooBig, blockTimestampMoreThanOneDays),
      "ErrorTokenRateIsOutOfRange(" + tokenRateTooBig + ", " + blockTimestampMoreThanOneDays + ")"
    );

    await assert.revertsWith(
      tokenRateOracle.connect(bridge).updateRate(tokenRateTooSmall, blockTimestampMoreThanOneDays),
      "ErrorTokenRateIsOutOfRange(" + tokenRateTooSmall + ", " + blockTimestampMoreThanOneDays + ")"
    );

    await tokenRateOracle.connect(bridge).updateRate(tokenRateSizeDoesMatterAfterAll, blockTimestampMoreThanOneDays);
  })

  .test("updateRate() :: token rate limits", async (ctx) => {
    const { deployer, bridge, l1TokenBridgeEOA } = ctx.accounts;
    const { tokenRate, minTimeBetweenTokenRateUpdates } = ctx.constants;

    const tokenRateOutdatedDelay = BigNumber.from(86400);              // 1 day
    const maxAllowedL2ToL1ClockLag = BigNumber.from(86400 * 2);        // 2 days
    const maxAllowedTokenRateDeviationPerDay = BigNumber.from(10000);  // 100%

    const l2MessengerStub = await new CrossDomainMessengerStub__factory(
      deployer
    ).deploy({ value: wei.toBigNumber(wei`1 ether`) });

    const { tokenRateOracle, blockTimestampOfDeployment } = await tokenRateOracleUnderProxy(
      deployer,
      l2MessengerStub.address,
      bridge.address,
      l1TokenBridgeEOA.address,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay,
      BigNumber.from(86400*3),
      BigNumber.from(3600),
      tokenRate,
      BigNumber.from(0)
    );

    const maxAllowedTokenRate = await tokenRateOracle.MAX_SANE_TOKEN_RATE();
    await tokenRateOracle.connect(bridge).updateRate(maxAllowedTokenRate, blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1));
    assert.equalBN(await tokenRateOracle.latestAnswer(), maxAllowedTokenRate);

    const minAllowedTokenRate = await tokenRateOracle.MIN_SANE_TOKEN_RATE();
    await tokenRateOracle.connect(bridge).updateRate(minAllowedTokenRate, blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates.mul(2)).add(1));
    assert.equalBN(await tokenRateOracle.latestAnswer(), minAllowedTokenRate);
  })

  .test("updateRate() :: happy path called by bridge", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, minTimeBetweenTokenRateUpdates } = ctx.constants;

    const newTokenRate = tokenRate.mul(BigNumber.from('104')).div(BigNumber.from('100')); // 104%

    const blockTimestampInFuture = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1);
    const tx = await tokenRateOracle.connect(bridge).updateRate(newTokenRate, blockTimestampInFuture);

    await assert.emits(tokenRateOracle, tx, "TokenRateL1TimestampIsInFuture", [
      newTokenRate,
      blockTimestampInFuture
    ]);

    await assert.emits(tokenRateOracle, tx, "RateUpdated", [
      newTokenRate,
      blockTimestampInFuture
    ]);

    assert.equalBN(await tokenRateOracle.latestAnswer(), newTokenRate);

    const {
      roundId_,
      answer_,
      startedAt_,
      updatedAt_,
      answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    const updatedAt = await getContractTransactionTimestamp(ctx.provider, tx);

    assert.equalBN(roundId_, blockTimestampInFuture);
    assert.equalBN(answer_, newTokenRate);
    assert.equalBN(startedAt_, blockTimestampInFuture);
    assert.equalBN(updatedAt_, updatedAt);
    assert.equalBN(answeredInRound_, blockTimestampInFuture);
  })

  .test("updateRate() :: happy path called by messenger with correct cross-domain sender", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { l2MessengerStubEOA, l1TokenBridgeEOA } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, minTimeBetweenTokenRateUpdates } = ctx.constants;

    await l2MessengerStub.setXDomainMessageSender(l1TokenBridgeEOA.address);

    const newTokenRate = tokenRate.mul(BigNumber.from('104')).div(BigNumber.from('100')); // 104%

    const blockTimestampInFuture = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1);
    const tx = await tokenRateOracle.connect(l2MessengerStubEOA).updateRate(newTokenRate, blockTimestampInFuture);

    await assert.emits(tokenRateOracle, tx, "TokenRateL1TimestampIsInFuture", [
      newTokenRate,
      blockTimestampInFuture
    ]);

    await assert.emits(tokenRateOracle, tx, "RateUpdated", [
      newTokenRate,
      blockTimestampInFuture
    ]);

    assert.equalBN(await tokenRateOracle.latestAnswer(), newTokenRate);

    const {
      roundId_,
      answer_,
      startedAt_,
      updatedAt_,
      answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    const updatedAt = await getContractTransactionTimestamp(ctx.provider, tx);

    assert.equalBN(roundId_, blockTimestampInFuture);
    assert.equalBN(answer_, newTokenRate);
    assert.equalBN(startedAt_, blockTimestampInFuture);
    assert.equalBN(updatedAt_, updatedAt);
    assert.equalBN(answeredInRound_, blockTimestampInFuture);
  })

  .test("pauseTokenRateUpdates() :: wrong role", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { deployer } = ctx.accounts;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    const account = deployer.address.toLowerCase();

    await assert.revertsWith(
      tokenRateOracle.pauseTokenRateUpdates(1),
      "AccessControl: account " + account + " is missing role " + disablerRole
    );
  })

  .test("pauseTokenRateUpdates() :: double pause", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig } = ctx.accounts;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).pauseTokenRateUpdates(1),
      "ErrorAlreadyPaused()"
    );
  })

  .test("pauseTokenRateUpdates() :: wrong index", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig } = ctx.accounts;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).pauseTokenRateUpdates(1),
      "ErrorWrongTokenRateIndex()"
    );
  })

  .test("pauseTokenRateUpdates() :: old rate", async (ctx) => {

    const { multisig, bridge, deployer, l1TokenBridgeEOA } = ctx.accounts;
    const { tokenRate, tokenRateOutdatedDelay, maxAllowedL2ToL1ClockLag, maxAllowedTokenRateDeviationPerDay } = ctx.constants;
    const { l2MessengerStub } = ctx.contracts;

    /// create new Oracle with 0 maxDeltaTimeToPauseTokenRateUpdates
    const maxDeltaTimeToPauseTokenRateUpdates = BigNumber.from(0);
    const { tokenRateOracle, blockTimestampOfDeployment } = await tokenRateOracleUnderProxy(
      deployer,
      l2MessengerStub.address,
      bridge.address,
      l1TokenBridgeEOA.address,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay,
      maxDeltaTimeToPauseTokenRateUpdates,
      BigNumber.from(3600),
      tokenRate,
      BigNumber.from(0),
    );

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment.add(1000));

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0),
      "ErrorTokenRateUpdateTooOld()"
    );
  })

  .test("pauseTokenRateUpdates() :: success", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig, bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, minTimeBetweenTokenRateUpdates } = ctx.constants;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    const tokenRate0 = tokenRate.add(100);
    const tokenRate1 = tokenRate.add(200);
    const tokenRate2 = tokenRate.add(300);
    const tokenRate3 = tokenRate.add(300);

    const blockTimestampOfDeployment0 = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1);
    const blockTimestampOfDeployment1 = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates.mul(2)).add(1);
    const blockTimestampOfDeployment2 = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates.mul(3)).add(1);
    const blockTimestampOfDeployment3 = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates.mul(4)).add(1);

    const tx0 = await tokenRateOracle.connect(bridge).updateRate(tokenRate0, blockTimestampOfDeployment0);
    await assert.emits(tokenRateOracle, tx0, "RateUpdated", [tokenRate0, blockTimestampOfDeployment0]);

    const tx1 = await tokenRateOracle.connect(bridge).updateRate(tokenRate1, blockTimestampOfDeployment1);
    await assert.emits(tokenRateOracle, tx1, "RateUpdated", [tokenRate1, blockTimestampOfDeployment1]);

    const tx2 = await tokenRateOracle.connect(bridge).updateRate(tokenRate2, blockTimestampOfDeployment2);
    await assert.emits(tokenRateOracle, tx2, "RateUpdated", [tokenRate2, blockTimestampOfDeployment2]);

    assert.equalBN(await tokenRateOracle.getTokenRatesLength(), 4);
    assert.isFalse(await tokenRateOracle.isTokenRateUpdatesPaused());

    const pauseTx = await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(1);

    await assert.emits(tokenRateOracle, pauseTx, "TokenRateUpdatesPaused", [
      tokenRate0,
      blockTimestampOfDeployment0
    ]);

    assert.equalBN(await tokenRateOracle.getTokenRatesLength(), 2);
    assert.isTrue(await tokenRateOracle.isTokenRateUpdatesPaused());

    const tx3 = await tokenRateOracle.connect(bridge).updateRate(tokenRate3, blockTimestampOfDeployment3);
    await assert.emits(
      tokenRateOracle,
      tx3,
      "TokenRateUpdateAttemptDuringPause"
    );
  })

  .test("resumeTokenRateUpdates() :: wrong role", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { deployer } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    const account = deployer.address.toLowerCase();

    await assert.revertsWith(
      tokenRateOracle.resumeTokenRateUpdates(tokenRate, blockTimestampOfDeployment.add(1000)),
      "AccessControl: account " + account + " is missing role " + enablerRole
    );
  })

  .test("resumeTokenRateUpdates() :: unpause when unpaused", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    await tokenRateOracle.grantRole(enablerRole, multisig.address);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).resumeTokenRateUpdates(tokenRate, blockTimestampOfDeployment),
      "ErrorAlreadyResumed()"
    );
  })

  .test("resumeTokenRateUpdates() :: token rate is out of range", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig, bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    await tokenRateOracle.grantRole(enablerRole, multisig.address);

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment.add(1000));
    await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).resumeTokenRateUpdates(1, blockTimestampOfDeployment),
      "ErrorTokenRateIsOutOfSaneRange(1)"
    );
  })

  .test("resumeTokenRateUpdates() :: time is out of clock lag", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig, bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    await tokenRateOracle.grantRole(enablerRole, multisig.address);

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment.add(1000));
    await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0);

    const MAX_ALLOWED_L2_TO_L1_CLOCK_LAG = await tokenRateOracle.MAX_ALLOWED_L2_TO_L1_CLOCK_LAG();
    const newWrongTime = blockTimestampOfDeployment.add(MAX_ALLOWED_L2_TO_L1_CLOCK_LAG).add(1000);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).resumeTokenRateUpdates(tokenRate, newWrongTime),
      "ErrorL1TimestampExceededMaxAllowedClockLag("+newWrongTime+")"
    );
  })

  .test("resumeTokenRateUpdates() :: time is older than previous", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig, bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment } = ctx.constants;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    await tokenRateOracle.grantRole(enablerRole, multisig.address);

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment.add(1000));
    await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0);

    const newWrongTime = blockTimestampOfDeployment.sub(1000);

    await assert.revertsWith(
      tokenRateOracle.connect(multisig).resumeTokenRateUpdates(tokenRate, newWrongTime),
      "ErrorL1TimestampOlderThanPrevious("+newWrongTime+")"
    );
  })

  .test("resumeTokenRateUpdates() :: success", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { multisig, bridge } = ctx.accounts;
    const { tokenRate, blockTimestampOfDeployment, minTimeBetweenTokenRateUpdates } = ctx.constants;

    const disablerRole = await tokenRateOracle.RATE_UPDATE_DISABLER_ROLE();
    await tokenRateOracle.grantRole(disablerRole, multisig.address);

    const enablerRole = await tokenRateOracle.RATE_UPDATE_ENABLER_ROLE();
    await tokenRateOracle.grantRole(enablerRole, multisig.address);

    await tokenRateOracle.connect(bridge).updateRate(tokenRate, blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates).add(1));
    assert.isFalse(await tokenRateOracle.isTokenRateUpdatesPaused());
    await tokenRateOracle.connect(multisig).pauseTokenRateUpdates(0);
    assert.isTrue(await tokenRateOracle.isTokenRateUpdatesPaused());
    const unpauseTx = await tokenRateOracle.connect(multisig).resumeTokenRateUpdates(tokenRate, blockTimestampOfDeployment);
    assert.isFalse(await tokenRateOracle.isTokenRateUpdatesPaused());

    await assert.emits(
      tokenRateOracle,
      unpauseTx,
      "TokenRateUpdatesResumed",
      [tokenRate, blockTimestampOfDeployment]
    );
    await assert.emits(tokenRateOracle,
      unpauseTx,
      "RateUpdated",
      [tokenRate, blockTimestampOfDeployment]
    );

    const newTime = blockTimestampOfDeployment.add(minTimeBetweenTokenRateUpdates.mul(2)).add(1);
    const tx = await tokenRateOracle.connect(bridge).updateRate(tokenRate.add(100), newTime);
    await assert.emits(tokenRateOracle,
      tx,
      "RateUpdated",
      [tokenRate.add(100), newTime]
    );
  })

  .run();

async function ctxFactory() {
  /// ---------------------------
  /// constants
  /// ---------------------------
  const decimals = 27;
  const provider = await hre.ethers.provider;
  const tokenRate = BigNumber.from('1164454276599657236000000000');    // value taken from real contact on 23.04.24
  const tokenRateOutdatedDelay = BigNumber.from(86400);                // 1 day
  const maxAllowedL2ToL1ClockLag = BigNumber.from(86400 * 2);          // 2 days
  const maxAllowedTokenRateDeviationPerDay = BigNumber.from(500);      // 5%
  const oldestRateAllowedInPauseTimeSpan =  BigNumber.from(86400*3);   // 3 days
  const minTimeBetweenTokenRateUpdates =  BigNumber.from(3600); // 1 hour

  const [deployer, bridge, stranger, l1TokenBridgeEOA, multisig] = await hre.ethers.getSigners();
  const zero = await hre.ethers.getSigner(hre.ethers.constants.AddressZero);

  const l2MessengerStub = await new CrossDomainMessengerStub__factory(deployer)
    .deploy({ value: wei.toBigNumber(wei`1 ether`) });
  const l2MessengerStubEOA = await testing.impersonate(l2MessengerStub.address);

  const rateL1Timestamp = await getBlockTimestamp(provider, 0);

  /// ---------------------------
  /// contracts
  /// ---------------------------
  const { tokenRateOracle, blockTimestampOfDeployment } = await tokenRateOracleUnderProxy(
    deployer,
    l2MessengerStub.address,
    bridge.address,
    l1TokenBridgeEOA.address,
    tokenRateOutdatedDelay,
    maxAllowedL2ToL1ClockLag,
    maxAllowedTokenRateDeviationPerDay,
    oldestRateAllowedInPauseTimeSpan,
    minTimeBetweenTokenRateUpdates,
    tokenRate,
    rateL1Timestamp
  );

  return {
    accounts: {
      deployer,
      bridge,
      zero,
      stranger,
      l1TokenBridgeEOA,
      l2MessengerStubEOA,
      multisig
    },
    contracts: {
      tokenRateOracle,
      l2MessengerStub
    },
    constants: {
      tokenRate,
      decimals,
      rateL1Timestamp,
      blockTimestampOfDeployment,
      tokenRateOutdatedDelay,
      maxAllowedL2ToL1ClockLag,
      maxAllowedTokenRateDeviationPerDay,
      oldestRateAllowedInPauseTimeSpan,
      minTimeBetweenTokenRateUpdates
    },
    provider
  };
}
