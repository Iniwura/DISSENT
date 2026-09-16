import { readFileSync } from "fs";
import path from "path";
import {
  TransactionHash,
  TransactionStatus,
  GenLayerClient,
  DecodedDeployData,
  GenLayerChain,
} from "genlayer-js/types";
const STUDIO_NEXT_RPC_URL = "https://studio-next.genlayer.com/api";
const STUDIO_NEXT_CHAIN_ID = 61997;

type FeeProfileEntry = {
  leaderTimeunitsAllocation: string;
  validatorTimeunitsAllocation: string;
  totalMessageFees?: string;
  rotationsPerRound: string;
};

function loadDeploymentFeeOptions() {
  const profile = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "fee-profile.json"), "utf8"),
  ) as { deploy?: FeeProfileEntry };
  const deploy = profile.deploy;
  if (!deploy) {
    throw new Error("fee-profile.json does not contain a measured deploy entry.");
  }

  const rotationsPerRound = BigInt(deploy.rotationsPerRound);
  if (rotationsPerRound < 1n) {
    throw new Error("fee-profile.json deploy entry has invalid rotationsPerRound.");
  }

  // The installed genlayer-js FeeEstimateOptions accepts these measured
  // distribution fields. executionBudgetPerRound remains in the profile as
  // measured metadata but is not a supported top-level estimate option.
  return {
    leaderTimeunitsAllocation: BigInt(deploy.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: BigInt(deploy.validatorTimeunitsAllocation),
    totalMessageFees: BigInt(deploy.totalMessageFees ?? "0"),
    rotations: [rotationsPerRound],
  };
}

export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/dissent.py");

  try {
    const contractCode = new Uint8Array(readFileSync(filePath));

    await client.initializeConsensusSmartContract();

    if ((client.chain as GenLayerChain).id !== STUDIO_NEXT_CHAIN_ID) {
      throw new Error("Deployment client must target Studio Next chain " + STUDIO_NEXT_CHAIN_ID + " through " + STUDIO_NEXT_RPC_URL + ".");
    }

    const feeEstimate = await client.estimateTransactionFees(loadDeploymentFeeOptions());
    if (feeEstimate.feeValue <= 0n) {
      throw new Error("Studio Next returned no positive deployment feeValue estimate.");
    }

    const deployTransaction = await client.deployContract({
      code: contractCode,
      // Constructor ABI remains (minimum_bounty, minimum_stake, minimum_execution_bond).
      fees: { distribution: feeEstimate.distribution, feeValue: feeEstimate.feeValue },
      args: [300, 100, 1_000],
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: deployTransaction as TransactionHash,
      status: TransactionStatus.FINALIZED,
      retries: 200,
    });

    const lifecycleSucceeded =
      receipt.statusName === TransactionStatus.ACCEPTED ||
      receipt.statusName === TransactionStatus.FINALIZED ||
      receipt.status === TransactionStatus.ACCEPTED ||
      receipt.status === TransactionStatus.FINALIZED ||
      receipt.status === 5 ||
      receipt.status === 7;
    if (!lifecycleSucceeded || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
      throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
    }

    const deployedContractAddress =
      (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

    if (!deployedContractAddress) {
      throw new Error("Deployment succeeded without a contract address");
    }

    console.log(`Contract deployed at address: ${deployedContractAddress}`);
  } catch (error) {
    throw new Error(`Error during deployment: ${error}`);
  }
}
