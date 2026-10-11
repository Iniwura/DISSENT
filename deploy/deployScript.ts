import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type {
  TransactionHash,
  GenLayerClient,
  DecodedDeployData,
  GenLayerChain,
} from "genlayer-js/types";

type FeeProfileEntry = {
  leaderTimeunitsAllocation: string;
  validatorTimeunitsAllocation: string;
  appealRounds: string;
  executionBudgetPerRound: string;
  executionConsumed: string;
  totalMessageFees: string;
  rotations: string[];
  maxPriceGenPerTimeUnit: string;
  storageFeeMaxGasPrice: string;
  receiptFeeMaxGasPrice: string;
};

function loadDeploymentFeeOptions() {
  const profile = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "fee-profile.json"), "utf8"),
  ) as { deploy?: FeeProfileEntry };
  const deploy = profile.deploy;
  if (!deploy) {
    throw new Error("fee-profile.json does not contain a measured deploy entry.");
  }
  if (deploy.appealRounds !== "0" || deploy.rotations.length !== 1) {
    throw new Error("Deployment fee profile must explicitly select zero appeal rounds and one rotation.");
  }
  return {
    leaderTimeunitsAllocation: BigInt(deploy.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: BigInt(deploy.validatorTimeunitsAllocation),
    appealRounds: BigInt(deploy.appealRounds),
    executionBudgetPerRound: BigInt(deploy.executionBudgetPerRound),
    executionConsumed: BigInt(deploy.executionConsumed),
    totalMessageFees: BigInt(deploy.totalMessageFees),
    rotations: deploy.rotations.map((value) => BigInt(value)),
    maxPriceGenPerTimeUnit: BigInt(deploy.maxPriceGenPerTimeUnit),
    storageFeeMaxGasPrice: BigInt(deploy.storageFeeMaxGasPrice),
    receiptFeeMaxGasPrice: BigInt(deploy.receiptFeeMaxGasPrice),
  };
}

function sourceHash(code: Uint8Array) {
  return createHash("sha256").update(code).digest("hex");
}

function clientRpcUrl(client: GenLayerClient<any>) {
  return (client.chain as GenLayerChain).rpcUrls.default.http[0];
}

export default async function main(client: GenLayerClient<any>) {
  const {
    AUTHORIZED_DEPLOYMENT,
    assertAuthorizedDeploymentEnvelope,
  } = await import(
    pathToFileURL(path.resolve(process.cwd(), "deploy/deploymentGuard.mjs")).href
  );
  const filePath = path.resolve(process.cwd(), "contracts/dissent.py");
  const contractCode = new Uint8Array(readFileSync(filePath));
  const constructorArgs = [...AUTHORIZED_DEPLOYMENT.constructorArgs];

  const chain = client.chain as GenLayerChain;
  if (chain.id !== AUTHORIZED_DEPLOYMENT.chainId) {
    throw new Error(`Deployment client must target chain ${AUTHORIZED_DEPLOYMENT.chainId}.`);
  }
  if (clientRpcUrl(client) !== AUTHORIZED_DEPLOYMENT.rpcUrl) {
    throw new Error(`Deployment client must target ${AUTHORIZED_DEPLOYMENT.rpcUrl}.`);
  }

  const signer = client.account?.address;
  if (!signer) {
    throw new Error("Deployment client has no signer; refusing to prepare a transaction.");
  }
  const feeOptions = loadDeploymentFeeOptions();
  const feeEstimate = await client.estimateTransactionFees(feeOptions);
  const fees = {
    distribution: feeEstimate.distribution,
    feeValue: feeEstimate.feeValue,
  };
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + AUTHORIZED_DEPLOYMENT.validUntilWindowSeconds);

  // Last local check before deployContract reaches the SDK signing path.
  // Every authorized envelope field is explicit; no CLI preset or SDK default is accepted.
  assertAuthorizedDeploymentEnvelope({
    rpcUrl: clientRpcUrl(client),
    chainId: chain.id,
    signer,
    sourceSha256: sourceHash(contractCode),
    constructorArgs,
    feeValue: fees.feeValue,
    fees,
    userValue: 0n,
    recipient: AUTHORIZED_DEPLOYMENT.recipient,
    leaderOnly: false,
    consensusMaxRotations: AUTHORIZED_DEPLOYMENT.consensusMaxRotations,
    validUntil,
  });

  const deployTransaction = await client.deployContract({
    code: contractCode,
    fees,
    args: constructorArgs,
    leaderOnly: false,
    consensusMaxRotations: AUTHORIZED_DEPLOYMENT.consensusMaxRotations,
    validUntil,
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: deployTransaction as TransactionHash,
    status: "FINALIZED",
    retries: 200,
  });

  if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
  }

  const decodedAddress = (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;
  const deployedContractAddress =
    decodedAddress ??
    (receipt as any).contractAddress ??
    (receipt as any).contract_address ??
    (receipt as any).recipient ??
    (receipt as any).to_address;
  if (!deployedContractAddress) {
    throw new Error("Deployment succeeded without a contract address");
  }
  console.log(`Contract deployed at address: ${deployedContractAddress}`);
}
