import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { DescribeInstancesCommandOutput } from "@aws-sdk/client-ec2";

export interface EC2Instance {
  instanceId: string;
  state: string;
  instanceType: string;
}

export async function fetchEC2Instances(client: EC2Client): Promise<EC2Instance[]> {
  const instances: EC2Instance[] = [];

  let nextToken: string | undefined;
  do {
    const command = new DescribeInstancesCommand({
      MaxResults: 100,
      NextToken: nextToken,
    });

    const response: DescribeInstancesCommandOutput = await client.send(command);

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.InstanceId) {
          instances.push({
            instanceId: instance.InstanceId,
            state: instance.State?.Name || "unknown",
            instanceType: instance.InstanceType || "unknown",
          });
        }
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return instances;
}