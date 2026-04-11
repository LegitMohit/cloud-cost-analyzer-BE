import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { prisma } from "@cloud_cost_analyzer/db";
import type { AWSClients } from "./awsClient.js";
import { fetchEC2Instances } from "./ec2.service.js";

export interface RecommendationInput {
  resourceId: string;
  resourceType: string;
  issue: string;
  recommendation: string;
  estimatedSavings: number;
}

const EC2_HOURLY_RATES: Record<string, number> = {
  "t3.micro": 0.0104, "t3.small": 0.0208, "t3.medium": 0.0416,
  "t3.large": 0.0832, "t3.xlarge": 0.1664, "t3.2xlarge": 0.3328,
  "t2.micro": 0.0116, "t2.small": 0.023, "t2.medium": 0.046,
  "t2.large": 0.092, "t2.xlarge": 0.184, "t2.2xlarge": 0.368,
  "m5.large": 0.096, "m5.xlarge": 0.192, "m5.2xlarge": 0.384,
  "m5.4xlarge": 0.768, "m5.8xlarge": 1.536, "m5.12xlarge": 2.304,
  "c5.large": 0.085, "c5.xlarge": 0.17, "c5.2xlarge": 0.34,
  "c5.4xlarge": 0.68, "r5.large": 0.126, "r5.xlarge": 0.252,
  "r5.2xlarge": 0.504, "i3.large": 0.15, "i3.xlarge": 0.30,
};

async function getEC2Utilization(client: CloudWatchClient, instanceId: string): Promise<{ cpuUtilization: number }> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const command = new GetMetricStatisticsCommand({
      Namespace: "AWS/EC2",
      MetricName: "CPUUtilization",
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ["Average"],
    });

    const response = await client.send(command);
    const avgCpu = response.Datapoints?.[0]?.Average ?? 0;
    return { cpuUtilization: avgCpu };
  } catch {
    return { cpuUtilization: 0 };
  }
}

export async function generateEC2Recommendations(clients: AWSClients, awsAccountId: string): Promise<RecommendationInput[]> {
  const recommendations: RecommendationInput[] = [];
  const instances = await fetchEC2Instances(clients.ec2);
  const dbResources = await prisma.resource.findMany({
    where: { awsAccountId, resourceType: "EC2" },
  });
  const resourceMap = new Map(dbResources.map(r => [r.resourceId, r]));

  for (const instance of instances) {
    const resource = resourceMap.get(instance.instanceId);
    if (!resource) continue;

    const hourlyRate = EC2_HOURLY_RATES[instance.instanceType] || 0.05;

    switch (instance.state) {
      case "stopped":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EC2",
          issue: `EC2 instance '${instance.instanceId}' is stopped (type: ${instance.instanceType})`,
          recommendation: "Terminate the stopped instance to avoid ongoing charges, or use stop protection to prevent accidental starts",
          estimatedSavings: hourlyRate * 24 * 30,
        });
        break;

      case "pending":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EC2",
          issue: `EC2 instance '${instance.instanceId}' is starting up (type: ${instance.instanceType})`,
          recommendation: "Instance is initializing. No action needed - monitor for normal operation after a few minutes",
          estimatedSavings: 0,
        });
        break;

      case "running":
        const { cpuUtilization } = await getEC2Utilization(clients.cloudwatch, instance.instanceId);

        if (cpuUtilization < 5) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "EC2",
            issue: `EC2 instance '${instance.instanceId}' has very low CPU utilization (${cpuUtilization.toFixed(1)}%)`,
            recommendation: "Consider stopping the instance during non-peak hours or using Auto Scaling to reduce costs",
            estimatedSavings: hourlyRate * 24 * 30 * 0.9,
          });
        }

        if (instance.publicIpAddress && !instance.tags?.Environment?.includes("prod")) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "EC2",
            issue: `EC2 instance '${instance.instanceId}' has a public IP but may not need it (Name: ${instance.instanceName || "unnamed"})`,
            recommendation: "Consider removing the public IP to reduce costs and improve security if not required",
            estimatedSavings: 2,
          });
        }

        if (instance.instanceType.startsWith("t2.") || instance.instanceType.startsWith("m1.") || instance.instanceType.startsWith("c1.")) {
          const upgradeType = instance.instanceType.replace(/[0-9]/g, "").replace("t2", "t3").replace("m1", "m5").replace("c1", "c5");
          recommendations.push({
            resourceId: resource.id,
            resourceType: "EC2",
            issue: `EC2 instance '${instance.instanceId}' uses older generation type '${instance.instanceType}'`,
            recommendation: `Consider upgrading to ${upgradeType}${instance.instanceType.slice(-1)} for better performance and cost efficiency`,
            estimatedSavings: hourlyRate * 24 * 30 * 0.15,
          });
        }

        if (cpuUtilization > 80) {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "EC2",
            issue: `EC2 instance '${instance.instanceId}' has high CPU utilization (${cpuUtilization.toFixed(1)}%)`,
            recommendation: "Consider resizing to a larger instance type or using Auto Scaling to handle load",
            estimatedSavings: 0,
          });
        }
        break;

      case "stopping":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EC2",
          issue: `EC2 instance '${instance.instanceId}' is stopping (type: ${instance.instanceType})`,
          recommendation: "Instance is in the process of stopping. No action needed - wait for it to fully stop",
          estimatedSavings: 0,
        });
        break;

      case "shutting-down":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EC2",
          issue: `EC2 instance '${instance.instanceId}' is terminating (type: ${instance.instanceType})`,
          recommendation: "Instance is being terminated. Ensure data backup if needed before it's gone",
          estimatedSavings: 0,
        });
        break;

      case "terminated":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EC2",
          issue: `EC2 instance '${instance.instanceId}' is terminated and no longer billing`,
          recommendation: "Clean up any associated resources like Elastic IPs, volumes, or security groups",
          estimatedSavings: 0,
        });
        break;
    }
  }

  return recommendations;
}