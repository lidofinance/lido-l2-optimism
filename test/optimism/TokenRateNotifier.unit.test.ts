import { ethers } from "hardhat";
import { assert } from "chai";
import { BigNumber } from 'ethers'
import { unit } from "../../utils/testing";
import { wei } from "../../utils/wei";
import { getInterfaceID, getExchangeRate } from "../../utils/testing/helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  TokenRateNotifier__factory,
  ITokenRatePusher__factory,
  OpStackTokenRatePusher__factory,
  ITokenRateOracle__factory,
  CrossDomainMessengerStub__factory,
  OpStackTokenRatePusherWithSomeErrorStub__factory,
  OpStackTokenRatePusherWithOutOfGasErrorStub__factory,
  ERC20BridgedStub__factory,
  ERC20WrapperStub__factory,
  AccountingOracleStub__factory
} from "../../typechain";

unit("TokenRateNotifier", ctxFactory)

  .test("deploy with zero address owner", async (ctx) => {
    const { deployer, lido } = ctx.accounts;

    await assert.revertsWith(
      new TokenRateNotifier__factory(deployer).deploy(ethers.constants.AddressZero, lido.address),
      "ErrorZeroAddressOwner()"
    );
  })

  .test("deploy with zero address rebase caller", async (ctx) => {
    const { deployer } = ctx.accounts;

    await assert.revertsWith(
      new TokenRateNotifier__factory(deployer).deploy(deployer.address, ethers.constants.AddressZero),
      "ErrorZeroAddressLido()"
    );
  })

  .test("initial state", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;

    assert.equalBN(await tokenRateNotifier.MAX_OBSERVERS_COUNT(), 32);
    const iTokenRateObserver = getInterfaceID(ITokenRatePusher__factory.createInterface());
    assert.equal(await tokenRateNotifier.REQUIRED_INTERFACE(), iTokenRateObserver._hex);
    assert.equalBN(await tokenRateNotifier.observersLength(), 0);
  })

  .test("addObserver() :: not the owner", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { stranger } = ctx.accounts;

    await assert.revertsWith(
      tokenRateNotifier
        .connect(stranger)
        .addObserver(ethers.constants.AddressZero),
      "Ownable: caller is not the owner"
    );
  })

  .test("addObserver() :: revert on adding zero address observer", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;

    await assert.revertsWith(
      tokenRateNotifier
        .connect(ctx.accounts.owner)
        .addObserver(ethers.constants.AddressZero),
      "ErrorZeroAddressObserver()"
    );
  })

  .test("addObserver() :: revert on adding observer with bad interface", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { deployer, lido } = ctx.accounts;

    const observer = await new TokenRateNotifier__factory(deployer).deploy(deployer.address, lido.address);
    await assert.revertsWith(
      tokenRateNotifier
        .connect(ctx.accounts.owner)
        .addObserver(observer.address),
      "ErrorBadObserverInterface()"
    );
  })

  .test("addObserver() :: revert on adding too many observers", async (ctx) => {
    const { tokenRateNotifier, opStackTokenRatePusher } = ctx.contracts;
    const { deployer, owner, tokenRateOracle, lido } = ctx.accounts;
    const { l2GasLimitForPushingTokenRate, tokenRate, totalPooledEther, totalShares, genesisTime, secondsPerSlot, lastProcessingRefSlot } = ctx.constants;

    assert.equalBN(await tokenRateNotifier.observersLength(), 0);
    const maxObservers = await tokenRateNotifier.MAX_OBSERVERS_COUNT();
    for (let i = 0; i < maxObservers.toNumber(); i++) {

      const {
        opStackTokenRatePusher
      } = await createContracts(
        totalPooledEther,
        totalShares,
        tokenRate,
        genesisTime,
        secondsPerSlot,
        lastProcessingRefSlot,
        deployer,
        owner,
        tokenRateOracle,
        l2GasLimitForPushingTokenRate,
        lido
      );

      await tokenRateNotifier
        .connect(ctx.accounts.owner)
        .addObserver(opStackTokenRatePusher.address);
    }
    assert.equalBN(await tokenRateNotifier.observersLength(), maxObservers);

    await assert.revertsWith(
      tokenRateNotifier
        .connect(ctx.accounts.owner)
        .addObserver(opStackTokenRatePusher.address),
      "ErrorMaxObserversCountExceeded()"
    );
  })

  .test("addObserver() :: revert on adding the same observer twice", async (ctx) => {
    const { tokenRateNotifier, opStackTokenRatePusher } = ctx.contracts;

    await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(opStackTokenRatePusher.address);

    await assert.revertsWith(
      tokenRateNotifier
        .connect(ctx.accounts.owner)
        .addObserver(opStackTokenRatePusher.address),
      "ErrorAddExistedObserver()"
    );
  })

  .test("addObserver() :: happy path of adding observer", async (ctx) => {
    const { tokenRateNotifier, opStackTokenRatePusher } = ctx.contracts;

    assert.equalBN(await tokenRateNotifier.observersLength(), 0);
    const tx = await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(opStackTokenRatePusher.address);
    assert.equalBN(await tokenRateNotifier.observersLength(), 1);

    await assert.emits(tokenRateNotifier, tx, "ObserverAdded", [opStackTokenRatePusher.address]);
  })

  .test("removeObserver() :: revert on calling by not the owner", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { stranger } = ctx.accounts;

    await assert.revertsWith(
      tokenRateNotifier
        .connect(stranger)
        .removeObserver(ethers.constants.AddressZero),
      "Ownable: caller is not the owner"
    );
  })

  .test("removeObserver() :: revert on removing non-added observer", async (ctx) => {
    const { tokenRateNotifier, opStackTokenRatePusher } = ctx.contracts;

    assert.equalBN(await tokenRateNotifier.observersLength(), 0);

    await assert.revertsWith(
      tokenRateNotifier
        .connect(ctx.accounts.owner)
        .removeObserver(opStackTokenRatePusher.address),
      "ErrorNoObserverToRemove()"
    );
  })

  .test("removeObserver() :: happy path of removing observer", async (ctx) => {
    const { tokenRateNotifier, opStackTokenRatePusher } = ctx.contracts;

    assert.equalBN(await tokenRateNotifier.observersLength(), 0);

    await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(opStackTokenRatePusher.address);

    assert.equalBN(await tokenRateNotifier.observersLength(), 1);

    const tx = await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .removeObserver(opStackTokenRatePusher.address);
    await assert.emits(tokenRateNotifier, tx, "ObserverRemoved", [opStackTokenRatePusher.address]);

    assert.equalBN(await tokenRateNotifier.observersLength(), 0);
  })

  .test("handlePostTokenRebase() :: unauthorized caller", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { stranger } = ctx.accounts;

    await assert.revertsWith(
      tokenRateNotifier.connect(stranger).handlePostTokenRebase(1, 2, 3, 4, 5, 6, 7),
      "ErrorNotAuthorizedRebaseCaller()"
    );
  })

  .test("handlePostTokenRebase() :: failed with some error", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { deployer, lido } = ctx.accounts;

    const observer = await new OpStackTokenRatePusherWithSomeErrorStub__factory(deployer).deploy();
    await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(observer.address);

    const tx = await tokenRateNotifier.connect(lido).handlePostTokenRebase(1, 2, 3, 4, 5, 6, 7);

    await assert.emits(tokenRateNotifier, tx, "PushTokenRateFailed", [observer.address, "0x332e27d2"]);
  })

  .test("handlePostTokenRebase() :: revert when observer has out of gas error", async (ctx) => {
    const { tokenRateNotifier } = ctx.contracts;
    const { deployer, lido } = ctx.accounts;

    const observer = await new OpStackTokenRatePusherWithOutOfGasErrorStub__factory(deployer).deploy();
    await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(observer.address);

    await assert.revertsWith(
      tokenRateNotifier.connect(lido).handlePostTokenRebase(1, 2, 3, 4, 5, 6, 7),
      "ErrorTokenRateNotifierRevertedWithNoData()"
    );
  })

  .test("handlePostTokenRebase() :: happy path of handling token rebase", async (ctx) => {
    const {
      tokenRateNotifier,
      l1MessengerStub,
      opStackTokenRatePusher
    } = ctx.contracts;
    const { tokenRateOracle, lido } = ctx.accounts;
    const { l2GasLimitForPushingTokenRate, tokenRate, genesisTime, secondsPerSlot, lastProcessingRefSlot } = ctx.constants;

    const updateRateTime = genesisTime.add(secondsPerSlot.mul(lastProcessingRefSlot));

    await tokenRateNotifier
      .connect(ctx.accounts.owner)
      .addObserver(opStackTokenRatePusher.address);
    let tx = await tokenRateNotifier.connect(lido).handlePostTokenRebase(1, 2, 3, 4, 5, 6, 7);

    await assert.emits(l1MessengerStub, tx, "SentMessage", [
      tokenRateOracle.address,
      opStackTokenRatePusher.address,
      ITokenRateOracle__factory.createInterface().encodeFunctionData(
        "updateRate",
        [
          tokenRate,
          updateRateTime
        ]
      ),
      1,
      l2GasLimitForPushingTokenRate,
    ]);
  })

  .run();

async function ctxFactory() {
  const [deployer, owner, stranger, tokenRateOracle, lido] = await ethers.getSigners();
  const totalPooledEther = BigNumber.from('9309904612343950493629678');
  const totalShares = BigNumber.from('7975822843597609202337218');
  const tokenRateDecimals = BigNumber.from(27);
  const tokenRate = getExchangeRate(tokenRateDecimals, totalPooledEther, totalShares);
  const l2GasLimitForPushingTokenRate = 300_000;
  const genesisTime = BigNumber.from(1);
  const secondsPerSlot = BigNumber.from(2);
  const lastProcessingRefSlot = BigNumber.from(3);

  const {
    tokenRateNotifier,
    opStackTokenRatePusher,
    l1MessengerStub
  } = await createContracts(
    totalPooledEther,
    totalShares,
    tokenRate,
    genesisTime,
    secondsPerSlot,
    lastProcessingRefSlot,
    deployer,
    owner,
    tokenRateOracle,
    l2GasLimitForPushingTokenRate,
    lido
  );

  return {
    accounts: {
      deployer,
      owner,
      stranger,
      tokenRateOracle,
      lido
    },
    contracts: {
      tokenRateNotifier,
      opStackTokenRatePusher,
      l1MessengerStub
    },
    constants: {
      l2GasLimitForPushingTokenRate,
      tokenRate,
      totalPooledEther,
      totalShares,
      genesisTime,
      secondsPerSlot,
      lastProcessingRefSlot
    }
  };
}

async function createContracts(
  totalPooledEther: BigNumber,
  totalShares: BigNumber,
  tokenRate: BigNumber,
  genesisTime: BigNumber,
  secondsPerSlot: BigNumber,
  lastProcessingRefSlot: BigNumber,
  deployer: SignerWithAddress,
  owner: SignerWithAddress,
  tokenRateOracle: SignerWithAddress,
  l2GasLimitForPushingTokenRate: number,
  lido: SignerWithAddress) {

  const tokenRateNotifier = await new TokenRateNotifier__factory(deployer).deploy(
    owner.address,
    lido.address
  );

  const l1MessengerStub = await new CrossDomainMessengerStub__factory(deployer)
    .deploy({ value: wei.toBigNumber(wei`1 ether`) });


  const l1TokenRebasableStub = await new ERC20BridgedStub__factory(deployer).deploy(
    "L1 Token Rebasable",
    "L1R"
  );

  const l1TokenNonRebasableStub = await new ERC20WrapperStub__factory(deployer).deploy(
    l1TokenRebasableStub.address,
    "L1 Token Non Rebasable",
    "L1NR",
    totalPooledEther,
    totalShares
  );

  const accountingOracle = await new AccountingOracleStub__factory(deployer).deploy(
    genesisTime,
    secondsPerSlot,
    lastProcessingRefSlot
  );

  const opStackTokenRatePusher = await new OpStackTokenRatePusher__factory(deployer).deploy(
    l1MessengerStub.address,
    l1TokenNonRebasableStub.address,
    accountingOracle.address,
    tokenRateOracle.address,
    l2GasLimitForPushingTokenRate
  );

  return {
    tokenRateNotifier,
    l1TokenNonRebasableStub,
    opStackTokenRatePusher,
    accountingOracle,
    l1MessengerStub,
    totalPooledEther,
    totalShares,
    tokenRate
  };
}
