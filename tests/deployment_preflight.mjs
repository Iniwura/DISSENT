import { readFileSync } from "node:fs";
import { abi, decodeInputData } from "../frontend/node_modules/genlayer-js/dist/index.js";
import {
  AUTHORIZED_DEPLOYMENT,
  assertAuthorizedDeploymentEnvelope,
} from "../deploy/deploymentGuard.mjs";

const source = new Uint8Array(readFileSync("contracts/dissent.py"));
const sourceSha256 = "1075533a8b413ae7a94b80d9aa2cb7139e83c1733519fc56c17e90f14ae6581a";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encodeDeployment(args) {
  const constructorData = abi.calldata.encode(
    abi.calldata.makeCalldataObject(undefined, args),
  );
  return abi.transactions.serialize([source, constructorData, false]);
}

function decodeConstructorArgs(raw) {
  const decoded = decodeInputData(
    raw,
    "0x0000000000000000000000000000000000000000",
  );
  return {
    readable: abi.calldata.toString(decoded.constructorArgs),
    map: decoded.constructorArgs,
  };
}

function envelope(overrides = {}) {
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + AUTHORIZED_DEPLOYMENT.validUntilWindowSeconds);
  return {
    rpcUrl: AUTHORIZED_DEPLOYMENT.rpcUrl,
    chainId: AUTHORIZED_DEPLOYMENT.chainId,
    signer: AUTHORIZED_DEPLOYMENT.signer,
    sourceSha256,
    constructorArgs: [...AUTHORIZED_DEPLOYMENT.constructorArgs],
    feeValue: AUTHORIZED_DEPLOYMENT.feeValue,
    userValue: AUTHORIZED_DEPLOYMENT.userValue,
    recipient: AUTHORIZED_DEPLOYMENT.recipient,
    leaderOnly: false,
    consensusMaxRotations: AUTHORIZED_DEPLOYMENT.consensusMaxRotations,
    validUntil,
    fees: { distribution: AUTHORIZED_DEPLOYMENT.distribution },
    ...overrides,
  };
}

assert(source.length > 0, "contract source is empty");
assert(
  decodeConstructorArgs(encodeDeployment([300, 100, 1000])).readable ===
    '{"args":[300,100,1000,]}',
  "typed constructor arguments did not round-trip through the pinned SDK encoder",
);
assert(
  decodeConstructorArgs(encodeDeployment(["int:300", "int:100", "int:1000"])).readable ===
    '{"args":["int:300","int:100","int:1000",]}',
  "failed deployment string payload did not round-trip as strings",
);
assertAuthorizedDeploymentEnvelope(envelope());

for (const [label, overrides] of [
  ["fee value", { feeValue: 125000000000041661n }],
  [
    "appeal rounds",
    {
      fees: {
        distribution: {
          ...AUTHORIZED_DEPLOYMENT.distribution,
          appealRounds: 1n,
          rotations: [1n, 1n],
        },
      },
    },
  ],
  ["wrong signer", { signer: "0x0000000000000000000000000000000000000001" }],
  ["wrong source", { sourceSha256: "00".repeat(32) }],
  ["string constructor", { constructorArgs: ["int:300", "int:100", "int:1000"] }],
  ["expired validity", { validUntil: 0n }],
]) {
  let rejected = false;
  try {
    assertAuthorizedDeploymentEnvelope(envelope(overrides));
  } catch {
    rejected = true;
  }
  assert(rejected, `${label} mismatch was not rejected before signing`);
}

console.log(
  JSON.stringify({
    ok: true,
    sourceSha256,
    typedConstructor: decodeConstructorArgs(encodeDeployment([300, 100, 1000])).readable,
    failedConstructor: decodeConstructorArgs(
      encodeDeployment(["int:300", "int:100", "int:1000"]),
    ).readable,
    feeValue: AUTHORIZED_DEPLOYMENT.feeValue.toString(),
    appealRounds: AUTHORIZED_DEPLOYMENT.distribution.appealRounds.toString(),
    rotations: AUTHORIZED_DEPLOYMENT.distribution.rotations.map(String),
    rejectedMismatches: 6,
  }),
);
