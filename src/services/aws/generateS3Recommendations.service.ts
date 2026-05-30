import { prisma } from "@cloud_cost_analyzer/db";
import type { AWSClients } from "./awsClient.js";
import { fetchS3Buckets, getBucketDetails } from "./s3.service.js";

export interface RecommendationInput {
  resourceId: string;
  resourceType: string;
  issue: string;
  recommendation: string;
  estimatedSavings: number;
}

export async function generateS3Recommendations(clients: AWSClients, awsAccountId: string): Promise<RecommendationInput[]> {
  const recommendations: RecommendationInput[] = [];
  const buckets = await fetchS3Buckets(clients.s3);
  const dbResources = await prisma.resource.findMany({
    where: { awsAccountId, resourceType: "S3" },
  });
  const resourceMap = new Map(dbResources.map((r: { resourceId: string; id: string }) => [r.resourceId, r]));

  for (const bucket of buckets) {
    const resource = resourceMap.get(bucket.bucketName);
    if (!resource) continue;

    try {
      const details = await getBucketDetails(clients.s3, bucket.bucketName);

      if (details.incompleteUploads > 0) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' has ${details.incompleteUploads} incomplete multipart upload(s)`,
          recommendation: "Use S3 Inventory and lifecycle rules to clean up incomplete multipart uploads",
          estimatedSavings: details.incompleteUploads * 5,
        });
      }

      if (!details.encryptionEnabled) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' does not have encryption enabled`,
          recommendation: "Enable S3 bucket encryption (SSE-S3 or SSE-KMS) to meet security compliance - no additional cost",
          estimatedSavings: 0,
        });
      }

      if (!details.versioningEnabled) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' does not have versioning enabled`,
          recommendation: "Enable versioning for data protection against accidental deletion - costs based on storage",
          estimatedSavings: 0,
        });
      }

      if (!details.lifecycleEnabled) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' does not have lifecycle policies configured`,
          recommendation: "Configure lifecycle policies to transition objects to cheaper storage classes (IA, Glacier)",
          estimatedSavings: 20,
        });
      }

      if (details.versioningEnabled && details.oldVersions > 50) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' has ${details.oldVersions} old object versions`,
          recommendation: "Configure lifecycle to expire non-current versions to reduce storage costs",
          estimatedSavings: details.oldVersions * 0.5,
        });
      }

      if (details.versioningEnabled && !details.lifecycleEnabled) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' has versioning but no lifecycle policy`,
          recommendation: "Add lifecycle rule to delete old versions or move to Glacier to save costs",
          estimatedSavings: 15,
        });
      }

      if (!details.policyEnabled && bucket.bucketName.includes("private")) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' appears to be private but has no bucket policy`,
          recommendation: "Add bucket policy to explicitly deny public access and ensure proper access controls",
          estimatedSavings: 0,
        });
      }

      if (details.encryptionEnabled && !details.policyEnabled) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' has encryption but no bucket policy`,
          recommendation: "Add bucket policy to control access and prevent accidental public exposure",
          estimatedSavings: 0,
        });
      }

      if (recommendations.filter(r => r.resourceId === resource.id).length === 0) {
        recommendations.push({
          resourceId: resource.id,
          resourceType: "S3",
          issue: `S3 bucket '${bucket.bucketName}' is properly configured (versioning: ${details.versioningEnabled}, encryption: ${details.encryptionEnabled}, lifecycle: ${details.lifecycleEnabled})`,
          recommendation: "Bucket is well-configured. Continue monitoring with CloudWatch and Cost Explorer",
          estimatedSavings: 0,
        });
      }
    } catch (e) {
      console.error(`[S3] Error analyzing bucket ${bucket.bucketName}:`, e);
      recommendations.push({
        resourceId: resource.id,
        resourceType: "S3",
        issue: `S3 bucket '${bucket.bucketName}' could not be fully analyzed`,
        recommendation: "Verify bucket permissions and try again - may need additional IAM access",
        estimatedSavings: 0,
      });
    }
  }

  return recommendations;
}