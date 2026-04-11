import { prisma } from "@cloud_cost_analyzer/db";
import type { AWSClients } from "./awsClient.js";
import { fetchEBSVolumes } from "./ebs.service.js";

export interface RecommendationInput {
  resourceId: string;
  resourceType: string;
  issue: string;
  recommendation: string;
  estimatedSavings: number;
}

const EBS_MONTHLY_RATES: Record<string, number> = {
  "gp2": 0.10, "gp3": 0.08, "io1": 0.125, "io2": 0.125,
  "st1": 0.045, "sc1": 0.025, "standard": 0.05,
};

export async function generateEBSRecommendations(clients: AWSClients, awsAccountId: string): Promise<RecommendationInput[]> {
  const recommendations: RecommendationInput[] = [];
  const volumes = await fetchEBSVolumes(clients.ec2);
  const dbResources = await prisma.resource.findMany({
    where: { awsAccountId, resourceType: "EBS" },
  });
  const resourceMap = new Map(dbResources.map(r => [r.resourceId, r]));

  for (const volume of volumes) {
    const resource = resourceMap.get(volume.volumeId);
    if (!resource) continue;
    console.log(`Analyzing EBS volume: ${volume.volumeId}, state: ${volume.state}, attachmentStatus: ${volume.attachmentStatus}`);

    const sizeGb = volume.size || 100;
    const monthlyRate = EBS_MONTHLY_RATES[volume.volumeType || "gp2"] || 0.10;
    const monthlyCost = monthlyRate * sizeGb;

    switch (volume.state) {
      case "available":
        if (volume.attachmentStatus === "detached") {
          recommendations.push({
            resourceId: resource.id,
            resourceType: "EBS",
            issue: `EBS volume '${volume.volumeId}' is detached but not deleted (${sizeGb} GB, type: ${volume.volumeType || "gp2"})`,
            recommendation: "Delete the unused EBS volume to avoid monthly storage charges",
            estimatedSavings: monthlyCost,
          });
        }
        break;

      case "in-use":
        if (volume.attachmentStatus === "attached") {
          if (volume.volumeType === "gp2") {
            recommendations.push({
              resourceId: resource.id,
              resourceType: "EBS",
              issue: `EBS volume '${volume.volumeId}' uses gp2 type which is more expensive than gp3 (${sizeGb} GB)`,
              recommendation: "Migrate from gp2 to gp3 for up to 20% cost savings with better IOPS/throughput performance",
              estimatedSavings: monthlyCost * 0.2,
            });
          }

          if (volume.volumeType === "io1" && (volume.iops || 0) < 3000) {
            recommendations.push({
              resourceId: resource.id,
              resourceType: "EBS",
              issue: `EBS volume '${volume.volumeId}' uses io1 with low IOPS (${volume.iops})`,
              recommendation: "Consider using io2 or gp3 for better cost efficiency if high IOPS is not required",
              estimatedSavings: 50,
            });
          }

          if (!volume.encrypted) {
            recommendations.push({
              resourceId: resource.id,
              resourceType: "EBS",
              issue: `EBS volume '${volume.volumeId}' is not encrypted`,
              recommendation: "Enable encryption for the volume to meet security compliance requirements - no additional cost",
              estimatedSavings: 0,
            });
          }

          recommendations.push({
            resourceId: resource.id,
            resourceType: "EBS",
            issue: `EBS volume '${volume.volumeId}' is attached and in-use (type: ${volume.volumeType || "unknown"}, size: ${sizeGb}GB)`,
            recommendation: "Monitor volume metrics with CloudWatch - consider gp3 for cost optimization if not already using",
            estimatedSavings: monthlyCost * 0.05,
          });
        }
        break;

      case "creating":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EBS",
          issue: `EBS volume '${volume.volumeId}' is being created`,
          recommendation: "Volume is initializing. No action needed - wait for it to become available",
          estimatedSavings: 0,
        });
        break;

      case "deleting":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EBS",
          issue: `EBS volume '${volume.volumeId}' is being deleted`,
          recommendation: "Volume is in the process of deletion. Ensure data backup if needed before it's gone",
          estimatedSavings: 0,
        });
        break;

      case "deleted":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EBS",
          issue: `EBS volume '${volume.volumeId}' has been deleted and is no longer billing`,
          recommendation: "Volume is deleted. No action required - ensure no resources depend on this volume",
          estimatedSavings: 0,
        });
        break;

      case "error":
        recommendations.push({
          resourceId: resource.id,
          resourceType: "EBS",
          issue: `EBS volume '${volume.volumeId}' is in error state`,
          recommendation: "Investigate the volume error - may need to be recreated or restored from snapshot",
          estimatedSavings: 0,
        });
        break;
    }
  }

  return recommendations;
}