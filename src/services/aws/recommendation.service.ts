import { prisma } from "@cloud_cost_analyzer/db";
import type { AWSClients } from "./awsClient.js";
import { createAWSClients } from "./awsClient.js";
import { generateEC2Recommendations } from "./generateEC2Recommendations.service.js";
import { generateEBSRecommendations } from "./generateEBSRecommendations.service.js";
import { generateRDSRecommendations } from "./generateRDSRecommendations.service.js";
import { generateS3Recommendations } from "./generateS3Recommendations.service.js";

async function getAWSClients(awsAccountId: string): Promise<AWSClients | null> {
  const awsAccount = await prisma.awsAccount.findUnique({
    where: { id: awsAccountId },
  });

  if (!awsAccount) return null;

  const { decrypt } = await import("../../utils/encryption.js");
  const decryptedSecretKey = decrypt(awsAccount.secretKey);
  return createAWSClients({
    accessKey: awsAccount.accessKey,
    secretKey: decryptedSecretKey,
    region: awsAccount.region,
  });
}

export async function analyzeAndSaveRecommendations(awsAccountId: string): Promise<number> {
  const clients = await getAWSClients(awsAccountId);
  if (!clients) throw new Error("AWS account not found");

  await prisma.recommendation.deleteMany({
    where: { resource: { awsAccountId } },
  });

  const allRecommendations: any[] = [];

  let ec2Recs: any[] = [];
  let ebsRecs: any[] = [];
  let rdsRecs: any[] = [];
  let s3Recs: any[] = [];

  try {
    ec2Recs = await generateEC2Recommendations(clients, awsAccountId);
    console.log(`[Recommendations] EC2: ${ec2Recs.length} recommendations generated`);
  } catch (e) {
    console.error("[Recommendations] EC2 error:", e);
  }

  try {
    ebsRecs = await generateEBSRecommendations(clients, awsAccountId);
    console.log(`[Recommendations] EBS: ${ebsRecs.length} recommendations generated`);
  } catch (e) {
    console.error("[Recommendations] EBS error:", e);
  }

  try {
    rdsRecs = await generateRDSRecommendations(clients, awsAccountId);
    console.log(`[Recommendations] RDS: ${rdsRecs.length} recommendations generated`);
  } catch (e) {
    console.error("[Recommendations] RDS error:", e);
  }

  try {
    s3Recs = await generateS3Recommendations(clients, awsAccountId);
    console.log(`[Recommendations] S3: ${s3Recs.length} recommendations generated`);
  } catch (e) {
    console.error("[Recommendations] S3 error:", e);
  }

  allRecommendations.push(...ec2Recs, ...ebsRecs, ...rdsRecs, ...s3Recs);

  console.log(`[Recommendations] Total: ${allRecommendations.length} recommendations`);

  for (const rec of allRecommendations) {
    await prisma.recommendation.create({
      data: {
        resourceId: rec.resourceId,
        issue: rec.issue,
        recommendation: rec.recommendation,
        estimatedSavings: rec.estimatedSavings,
      },
    });
  }

  return allRecommendations.length;
}

export async function getRecommendationsByAccount(userId: string, accountId?: string): Promise<any[]> {
  const whereCondition: any = { userId };
  if (accountId) {
    whereCondition.id = accountId;
  }

  const awsAccounts = await prisma.awsAccount.findMany({
    where: whereCondition,
  });

  if (awsAccounts.length === 0) return [];

  const accountIds = awsAccounts.map(a => a.id);

  const recommendations = await prisma.recommendation.findMany({
    where: {
      resource: { awsAccountId: { in: accountIds } },
      status: "ACTIVE",
    },
    include: {
      resource: {
        include: {
          awsAccount: { select: { awsAccountUsername: true } },
        },
      },
    },
    orderBy: { estimatedSavings: "desc" },
  });

  return recommendations.map(r => ({
    id: r.id,
    issue: r.issue,
    recommendation: r.recommendation,
    estimatedSavings: r.estimatedSavings,
    resourceId: r.resourceId,
    resourceType: r.resource?.resourceType,
    resourceIdentifier: r.resource?.resourceId,
    awsAccountUsername: r.resource?.awsAccount?.awsAccountUsername,
  }));
}