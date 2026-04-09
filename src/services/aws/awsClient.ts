import {
  EC2Client,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { EC2ClientConfig } from "@aws-sdk/client-ec2";
import { S3Client } from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { RDSClient } from "@aws-sdk/client-rds";
import type { RDSClientConfig } from "@aws-sdk/client-rds";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import type { CloudWatchClientConfig } from "@aws-sdk/client-cloudwatch";
import { CostExplorerClient } from "@aws-sdk/client-cost-explorer";
import type { CostExplorerClientConfig } from "@aws-sdk/client-cost-explorer";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import type { STSClientConfig } from "@aws-sdk/client-sts";

export interface AWSClientConfig {
  accessKey: string;
  secretKey: string;
  region: string;
}

export interface AWSClients {
  ec2: EC2Client;
  s3: S3Client;
  rds: RDSClient;
  cloudwatch: CloudWatchClient;
  costExplorer: CostExplorerClient;
  sts: STSClient;
}

export function createAWSClients(config: AWSClientConfig): AWSClients {
  const { accessKey, secretKey, region } = config;

  const ec2Config: EC2ClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  const s3Config: S3ClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  const rdsConfig: RDSClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  const cloudwatchConfig: CloudWatchClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  const costExplorerConfig: CostExplorerClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  const stsConfig: STSClientConfig = {
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  };

  return {
    ec2: new EC2Client(ec2Config),
    s3: new S3Client(s3Config),
    rds: new RDSClient(rdsConfig),
    cloudwatch: new CloudWatchClient(cloudwatchConfig),
    costExplorer: new CostExplorerClient(costExplorerConfig),
    sts: new STSClient(stsConfig),
  };
}

export async function validateAWSCredentials(
  ec2Client: EC2Client
): Promise<string | boolean> {
  try {
    await ec2Client.send(new DescribeInstancesCommand({ MaxResults: 10 }));
    return true;
  } catch (error) {
    const err = error as Error;
    console.error("AWS credential validation failed:", err.message);
    return err.message || "Unknown error occurred while validating AWS credentials.";
  }
}

export async function getAWSAccountUsername(stsClient: STSClient): Promise<string> {
  const response = await stsClient.send(new GetCallerIdentityCommand({}));
  if (response.Arn) {
    const arnParts = response.Arn.split("/");
    return arnParts[arnParts.length - 1] || "iam user";
  }
  return response.UserId || "iam user";
}