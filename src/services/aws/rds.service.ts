import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import type { DescribeDBInstancesCommandOutput } from "@aws-sdk/client-rds";

export interface RDSInstance {
  dbInstanceIdentifier: string;
  status: string;
  instanceClass?: string;
  engine?: string;
  engineVersion?: string;
  multiAZ?: boolean;
  allocatedStorage?: number;
  storageType?: string;
  publiclyAccessible?: boolean;
  dbName?: string;
  endpoint?: string;
  port?: number;
  masterUsername?: string;
  creationTime?: Date;
  tags?: Record<string, string>;
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
        const tagMap: Record<string, string> = {};
        for (const tag of dbInstance.TagList || []) {
          if (tag.Key && tag.Value) {
            tagMap[tag.Key] = tag.Value;
          }
        }

        instances.push({
          dbInstanceIdentifier: dbInstance.DBInstanceIdentifier,
          status: dbInstance.DBInstanceStatus || "unknown",
          instanceClass: dbInstance.DBInstanceClass,
          engine: dbInstance.Engine,
          engineVersion: dbInstance.EngineVersion,
          multiAZ: dbInstance.MultiAZ,
          allocatedStorage: dbInstance.AllocatedStorage,
          storageType: dbInstance.StorageType,
          publiclyAccessible: dbInstance.PubliclyAccessible,
          dbName: dbInstance.DBName,
          endpoint: dbInstance.Endpoint?.Address,
          port: dbInstance.Endpoint?.Port,
          masterUsername: dbInstance.MasterUsername,
          creationTime: dbInstance.InstanceCreateTime,
          tags: tagMap,
        });
      }
    }

    marker = response.Marker;
  } while (marker);

  return instances;
}