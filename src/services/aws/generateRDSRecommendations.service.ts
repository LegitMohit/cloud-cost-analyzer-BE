import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { prisma } from "@cloud_cost_analyzer/db";
import type { AWSClients } from "./awsClient.js";
import { fetchRDSInstances } from "./rds.service.js";

export interface RecommendationInput {
  resourceId: string;
  resourceType: string;
  issue: string;
  recommendation: string;
  estimatedSavings: number;
}

async function getRDSUtilization(client: CloudWatchClient, dbInstanceIdentifier: string): Promise<{ cpuUtilization: number; connections: number }> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const cpuCommand = new GetMetricStatisticsCommand({
      Namespace: "AWS/RDS",
      MetricName: "CPUUtilization",
      Dimensions: [{ Name: "DBInstanceIdentifier", Value: dbInstanceIdentifier }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ["Average"],
    });

    const connCommand = new GetMetricStatisticsCommand({
      Namespace: "AWS/RDS",
      MetricName: "DatabaseConnections",
      Dimensions: [{ Name: "DBInstanceIdentifier", Value: dbInstanceIdentifier }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ["Sum"],
    });

    const [cpuResponse, connResponse] = await Promise.all([
      client.send(cpuCommand),
      client.send(connCommand),
    ]);

    return {
      cpuUtilization: cpuResponse.Datapoints?.[0]?.Average ?? 0,
      connections: connResponse.Datapoints?.[0]?.Sum ?? 0,
    };
  } catch {
    return { cpuUtilization: 0, connections: 0 };
  }
}

export async function generateRDSRecommendations(clients: AWSClients, awsAccountId: string): Promise<RecommendationInput[]> {
  const recommendations: RecommendationInput[] = [];
  const instances = await fetchRDSInstances(clients.rds);
  const dbResources = await prisma.resource.findMany({
    where: { awsAccountId, resourceType: "RDS" },
  });
  const resourceMap = new Map(dbResources.map(r => [r.resourceId, r]));

  for (const instance of instances) {
    const resource = resourceMap.get(instance.dbInstanceIdentifier);
    if (!resource) continue;

    const monthlySavings = (instance.instanceClass?.includes("large") ? 150 : 75);

    switch (instance.status) {
      case "stopped":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is stopped (class: ${instance.instanceClass}, engine: ${instance.engine})`,
          recommendation: "Consider deleting the stopped RDS instance if not needed, or use stop/start for cost savings",
          estimatedSavings: monthlySavings,
        });
        break;

      case "available":
        const { cpuUtilization, connections } = await getRDSUtilization(clients.cloudwatch, instance.dbInstanceIdentifier);

        if (cpuUtilization < 10 && connections === 0) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "RDS",
            issue: `RDS instance '${instance.dbInstanceIdentifier}' has very low CPU usage (${cpuUtilization.toFixed(1)}%) and no connections`,
            recommendation: "Consider stopping the RDS instance during non-peak hours or use auto-stop feature",
            estimatedSavings: monthlySavings,
          });
        }

        if (cpuUtilization > 80) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "RDS",
            issue: `RDS instance '${instance.dbInstanceIdentifier}' has high CPU utilization (${cpuUtilization.toFixed(1)}%)`,
            recommendation: "Consider scaling up the instance class or enabling read replicas for better performance",
            estimatedSavings: 0,
          });
        }

        if (instance.publiclyAccessible) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "RDS",
            issue: `RDS instance '${instance.dbInstanceIdentifier}' is publicly accessible`,
            recommendation: "Disable public accessibility to improve security - access should be through VPC only",
            estimatedSavings: 0,
          });
        }

        if (!instance.multiAZ && (instance.instanceClass?.includes("large") || instance.instanceClass?.includes("xlarge"))) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "RDS",
            issue: `RDS instance '${instance.dbInstanceIdentifier}' is not configured for Multi-AZ but is a large instance`,
            recommendation: "Consider enabling Multi-AZ for production workloads for high availability",
            estimatedSavings: 0,
          });
        }

        if (instance.engine === "mysql" || instance.engine === "mariadb") {
          const majorVersion = instance.engineVersion?.split(".")[0];
          if (majorVersion && parseInt(majorVersion) < 8) {
            recommendations.push({
              resourceId: resource.id,
              resourceType: "RDS",
              issue: `RDS instance '${instance.dbInstanceIdentifier}' uses older ${instance.engine} version ${instance.engineVersion}`,
              recommendation: "Consider upgrading to MySQL 8.0 or MariaDB 10.6+ for better performance and security",
              estimatedSavings: 0,
            });
          }
        }

        if (instance.storageType === "standard") {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "RDS",
            issue: `RDS instance '${instance.dbInstanceIdentifier}' uses magnetic storage which is slower`,
            recommendation: "Upgrade to gp3 or io1 for better IOPS and performance",
            estimatedSavings: 20,
          });
        }

        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is running (CPU: ${cpuUtilization.toFixed(1)}%, connections: ${connections})`,
          recommendation: "Monitor with CloudWatch and consider using RDS Proxy for connection pooling",
          estimatedSavings: 5,
        });
        break;

      case "starting":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is starting up`,
          recommendation: "Instance is initializing. No action needed - wait for it to become available",
          estimatedSavings: 0,
        });
        break;

      case "stopping":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is stopping`,
          recommendation: "Instance is in the process of stopping. No action needed - wait for it to fully stop",
          estimatedSavings: 0,
        });
        break;

      case "creating":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is being created`,
          recommendation: "Instance is being provisioned. No action needed - wait for it to become available",
          estimatedSavings: 0,
        });
        break;

      case "deleting":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is being deleted`,
          recommendation: "Instance is in the process of deletion. Ensure data backup if needed before it's gone",
          estimatedSavings: 0,
        });
        break;

      case "deleted":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' has been deleted and is no longer billing`,
          recommendation: "Instance is deleted. No action required - ensure no applications depend on this instance",
          estimatedSavings: 0,
        });
        break;

      case "rebooting":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is rebooting`,
          recommendation: "Instance is rebooting - may be due to maintenance or user-initiated. No action needed",
          estimatedSavings: 0,
        });
        break;

      case "maintenance":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is in maintenance mode`,
          recommendation: "AWS is performing maintenance. Monitor the instance - may experience brief downtime",
          estimatedSavings: 0,
        });
        break;

      case "failed":
      case "error":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' is in failed/error state`,
          recommendation: "Investigate the failure - may need to be restored from a snapshot or recreated",
          estimatedSavings: 0,
        });
        break;

      case "inaccessible-encryption-credentials":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "RDS",
          issue: `RDS instance '${instance.dbInstanceIdentifier}' has inaccessible encryption credentials`,
          recommendation: "Check KMS key permissions - the encryption key may have been deleted or access revoked",
          estimatedSavings: 0,
        });
        break;
    }
  }

  return recommendations;
}