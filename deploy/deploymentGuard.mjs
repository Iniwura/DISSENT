const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const AUTHORIZED_DEPLOYMENT = Object.freeze({
  rpcUrl: "https://studio-dev.genlayer.com/api",
  chainId: 61997,
  signer: "0x01feebafdfddd4ba23f69b43f0b501bba7aa7cff",
  sourceSha256:
    "1075533a8b413ae7a94b80d9aa2cb7139e83c1733519fc56c17e90f14ae6581a",
  constructorArgs: Object.freeze([300, 100, 1000]),
  feeValue: 50000000000006470n,
  userValue: 0n,
  recipient: ZERO_ADDRESS,
  leaderOnly: false,
  consensusMaxRotations: 3,
  validUntilWindowSeconds: 3600,
  distribution: Object.freeze({
    leaderTimeunitsAllocation: 125n,
    validatorTimeunitsAllocation: 250n,
    appealRounds: 0n,
    executionBudgetPerRound: 25000000000000000n,
    executionConsumed: 0n,
    totalMessageFees: 0n,
    rotations: Object.freeze([1n]),
    maxPriceGenPerTimeUnit: 2n,
    storageFeeMaxGasPrice: 300000000n,
    receiptFeeMaxGasPrice: 300000000n,
  }),
});

function normalizeAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sameBigInt(actual, expected, field) {
  let actualValue;
  try {
    actualValue = BigInt(actual);
  } catch {
    throw new Error(`deployment authorization mismatch: ${field} is not an integer`);
  }
  if (actualValue !== expected) {
    throw new Error(
      `deployment authorization mismatch: ${field}=${actualValue} expected ${expected}`,
    );
  }
}

function sameArray(actual, expected, field) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new Error(`deployment authorization mismatch: ${field} length`);
  }
  actual.forEach((value, index) =>
    sameBigInt(value, expected[index], `${field}[${index}]`),
  );
}

function assertDistribution(actual) {
  if (!actual || typeof actual !== "object") {
    throw new Error("deployment authorization mismatch: missing fee distribution");
  }
  const expected = AUTHORIZED_DEPLOYMENT.distribution;
  for (const field of [
    "leaderTimeunitsAllocation",
    "validatorTimeunitsAllocation",
    "appealRounds",
    "executionBudgetPerRound",
    "executionConsumed",
    "totalMessageFees",
    "maxPriceGenPerTimeUnit",
    "storageFeeMaxGasPrice",
    "receiptFeeMaxGasPrice",
  ]) {
    sameBigInt(actual[field], expected[field], `fees.distribution.${field}`);
  }
  sameArray(actual.rotations, expected.rotations, "fees.distribution.rotations");
}

export function assertAuthorizedDeploymentEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("deployment authorization mismatch: missing transaction envelope");
  }
  if (envelope.rpcUrl !== AUTHORIZED_DEPLOYMENT.rpcUrl) {
    throw new Error("deployment authorization mismatch: rpcUrl");
  }
  if (Number(envelope.chainId) !== AUTHORIZED_DEPLOYMENT.chainId) {
    throw new Error("deployment authorization mismatch: chainId");
  }
  if (normalizeAddress(envelope.signer) !== AUTHORIZED_DEPLOYMENT.signer) {
    throw new Error("deployment authorization mismatch: signer");
  }
  if (String(envelope.sourceSha256).toLowerCase() !== AUTHORIZED_DEPLOYMENT.sourceSha256) {
    throw new Error("deployment authorization mismatch: sourceSha256");
  }

  if (!Array.isArray(envelope.constructorArgs)) {
    throw new Error("deployment authorization mismatch: constructorArgs must be an array");
  }
  if (envelope.constructorArgs.length !== AUTHORIZED_DEPLOYMENT.constructorArgs.length) {
    throw new Error("deployment authorization mismatch: constructorArgs length");
  }
  envelope.constructorArgs.forEach((value, index) => {
    if (typeof value !== "number" && typeof value !== "bigint") {
      throw new Error(
        `deployment authorization mismatch: constructorArgs[${index}] must be a numeric integer`,
      );
    }
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error(
        `deployment authorization mismatch: constructorArgs[${index}] must be an integer`,
      );
    }
    sameBigInt(
      value,
      BigInt(AUTHORIZED_DEPLOYMENT.constructorArgs[index]),
      `constructorArgs[${index}]`,
    );
  });

  sameBigInt(envelope.feeValue, AUTHORIZED_DEPLOYMENT.feeValue, "feeValue");
  sameBigInt(envelope.userValue, AUTHORIZED_DEPLOYMENT.userValue, "userValue");
  if (normalizeAddress(envelope.recipient) !== AUTHORIZED_DEPLOYMENT.recipient) {
    throw new Error("deployment authorization mismatch: recipient");
  }
  if (envelope.leaderOnly !== AUTHORIZED_DEPLOYMENT.leaderOnly) {
    throw new Error("deployment authorization mismatch: leaderOnly");
  }
  if (Number(envelope.consensusMaxRotations) !== AUTHORIZED_DEPLOYMENT.consensusMaxRotations) {
    throw new Error("deployment authorization mismatch: consensusMaxRotations");
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  let validUntil;
  try {
    validUntil = BigInt(envelope.validUntil);
  } catch {
    throw new Error("deployment authorization mismatch: validUntil is not an integer");
  }
  if (
    validUntil <= now ||
    validUntil > now + BigInt(AUTHORIZED_DEPLOYMENT.validUntilWindowSeconds)
  ) {
    throw new Error("deployment authorization mismatch: validUntil is outside the one-hour window");
  }
  assertDistribution(envelope.fees?.distribution);
  return true;
}
