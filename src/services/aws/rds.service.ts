import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import type { DescribeDBInstancesCommandOutput } from "@aws-sdk/client-rds";

export interface RDSInstance {
  dbInstanceIdentifier: string;
  status: string;
}

export async function fetchRDSInstances(client: RDSClient): Promise<RDSInstance[]> {
  const instances: RDSInstance[] = [];

  let marker: string | undefined;
  do {
    const command = new DescribeDBInstancesCommand({
      MaxRecords: 100,
      Marker: marker,
    });

    const response: DescribeDBInstancesCommandOutput = await client.send(command);

    for (const dbInstance of response.DBInstances || []) {
      if (dbInstance.DBInstanceIdentifier) {
        instances.push({
          dbInstanceIdentifier: dbInstance.DBInstanceIdentifier,
          status: dbInstance.DBInstanceStatus || "unknown",
        });
      }
    }

    marker = response.Marker;
  } while (marker);

  return instances;
}