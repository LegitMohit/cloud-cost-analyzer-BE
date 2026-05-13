import type { Request, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "@cloud_cost_analyzer/db";
import { env } from "@cloud_cost_analyzer/env/server";
import { encrypt } from "../utils/encryption.js";
import { createAWSClients, validateAWSCredentials, getAWSAccountUsername } from "../services/aws/awsClient.js";
import { fetchEC2Instances } from "../services/aws/ec2.service.js";
import { fetchEBSVolumes } from "../services/aws/ebs.service.js";
import { fetchS3Buckets } from "../services/aws/s3.service.js";
import { fetchRDSInstances } from "../services/aws/rds.service.js";
import { getCostAndUsage, getMonthlyForecast } from "../services/aws/costExplorer.service.js";
import { analyzeAndSaveRecommendations, getRecommendationsByAccount } from "../services/aws/recommendation.service.js";

const connectSchema = z.object({
  accessKey: z.string().min(1),
  secretKey: z.string().optional(),
  region: z.string().min(1),
});

const costQuerySchema = z.object({
  accountId: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  granularity: z.enum(["DAILY", "MONTHLY", "HOURLY"]).optional(),
});

const forecastQuerySchema = z.object({
  month: z.string().min(1),
});

const JWT_SECRET = env.JWT_SECRET;

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export const connectAWS = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = connectSchema.parse(req.body);
    const { accessKey, secretKey: providedSecretKey, region } = parsed;

    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const existingAccount = await prisma.awsAccount.findFirst({
      where: {
        userId,
        accessKey,
      },
    });

    let secretKey: string;
    let clients: any;

    if (existingAccount) {
      const { decrypt } = await import("../utils/encryption.js");
      secretKey = decrypt(existingAccount.secretKey);
      clients = createAWSClients({ accessKey, secretKey, region: existingAccount.region });
    } else {
      if (!providedSecretKey) {
        res.status(400).json({ error: "Secret key is required for new connections" });
        return;
      }
      secretKey = providedSecretKey;
      clients = createAWSClients({ accessKey, secretKey, region });
    }

    const isValid = await validateAWSCredentials(clients.ec2);
    if (isValid !== true) {
      res.status(401).json({
        success: false,
        error: {
          message: isValid as string
        },
      });
      return;
    }

    const encryptedSecretKey = encrypt(secretKey);

    const awsAccountUsername = await getAWSAccountUsername(clients.sts);

    let awsAccount;

    if (existingAccount) {
      awsAccount = await prisma.awsAccount.update({
        where: { id: existingAccount.id },
        data: {
          secretKey: encryptedSecretKey,
          region: existingAccount.region,
          awsAccountUsername,
          status: "ACTIVE",
        },
      });

      const existingResources = await prisma.resource.findMany({
        where: { awsAccountId: awsAccount.id },
        select: { id: true },
      });
      const resourceIds = existingResources.map(r => r.id);

      if (resourceIds.length > 0) {
        await prisma.recommendation.deleteMany({
          where: { resourceId: { in: resourceIds } },
        });
      }

      await prisma.resource.deleteMany({
        where: { awsAccountId: awsAccount.id },
      });
    } else {
      awsAccount = await prisma.awsAccount.create({
        data: {
          userId,
          awsAccountUsername,
          accessKey,
          secretKey: encryptedSecretKey,
          region,
        },
      });
    }

    const [ec2Instances, ebsVolumes, s3Buckets, rdsInstances] = await Promise.all([
      fetchEC2Instances(clients.ec2),
      fetchEBSVolumes(clients.ec2),
      fetchS3Buckets(clients.s3),
      fetchRDSInstances(clients.rds),
    ]);

    const resources = [];

    for (const instance of ec2Instances) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "EC2",
        resourceId: instance.instanceId,
        resourceStatus: instance.state,
        estimatedCost: 0,
      });
    }

    for (const volume of ebsVolumes) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "EBS",
        resourceId: volume.volumeId,
        resourceStatus: volume.attachmentStatus,
        estimatedCost: 0,
      });
    }

    for (const bucket of s3Buckets) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "S3",
        resourceId: bucket.bucketName,
        resourceStatus: "active",
        estimatedCost: 0,
      });
    }

    for (const dbInstance of rdsInstances) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "RDS",
        resourceId: dbInstance.dbInstanceIdentifier,
        resourceStatus: dbInstance.status,
        estimatedCost: 0,
      });
    }

    await prisma.resource.createMany({
      data: resources,
    });

    const message = existingAccount
      ? "AWS account reconnected successfully"
      : "AWS account connected successfully";

    console.info(`${message} for user ${userId}: ${resources.length} resources fetched`);

    res.status(201).json({
      message,
      resourcesFetched: resources.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error("AWS connect error:", error);

    const err = error as any;
    const statusCode = err?.$metadata?.httpStatusCode || 500;
    const message =
      err?.Error?.Message || err?.message || "Internal Server Error";
    const code = err?.Code || "UnknownError";

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
};

export const getAWSResources = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const awsAccounts = await prisma.awsAccount.findMany({
      where: { userId, status: "ACTIVE" },
    });

    if (awsAccounts.length === 0) {
      res.status(200).json({ resources: [] });
      return;
    }

    const accountIds = awsAccounts.map((account) => account.id);
    const accountMap = new Map(awsAccounts.map((a) => [a.id, a.awsAccountUsername]));

    const resources = await prisma.resource.findMany({
      where: { awsAccountId: { in: accountIds }, status: "ACTIVE" },
    });

    const resourcesWithAccount = resources.map((r) => ({
      ...r,
      awsAccountUsername: accountMap.get(r.awsAccountId) || "Unknown",
    }));

    res.status(200).json({ resources: resourcesWithAccount });
  } catch (error) {
    console.error("Get AWS resources error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getConnectedAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const accounts = await prisma.awsAccount.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        awsAccountUsername: true,
        accessKey: true,
        region: true,
        createdAt: true,
        status: true,
      },
    });

    res.status(200).json({ accounts });
  } catch (error) {
    console.error("Get connected accounts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function getAWSClientForUser(userId: string, accountId?: string) {
  const whereCondition: any = { userId, status: "ACTIVE" };
  if (accountId) {
    whereCondition.id = accountId;
  }

  const awsAccount = await prisma.awsAccount.findFirst({
    where: whereCondition,
  });

  if (!awsAccount) {
    return null;
  }

  const { decrypt } = await import("../utils/encryption.js");
  const decryptedSecretKey = decrypt(awsAccount.secretKey);

  return createAWSClients({
    accessKey: awsAccount.accessKey,
    secretKey: decryptedSecretKey,
    region: awsAccount.region,
  });
}

export const getCostData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }


    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    let { accountId, startDate, endDate, granularity } = costQuerySchema.parse(req.body);

    const clients = await getAWSClientForUser(userId, accountId);
    if (!clients) {
      res.status(400).json({ error: "No AWS account connected" });
      return;
    }

    let awsAccountUsername: string | undefined;
    if (accountId) {
      const awsAccount = await prisma.awsAccount.findUnique({
        where: { id: accountId, userId },
        select: { awsAccountUsername: true },
      });
      awsAccountUsername = awsAccount?.awsAccountUsername;
    } else {
      const firstAccount = await prisma.awsAccount.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { awsAccountUsername: true },
      });
      awsAccountUsername = firstAccount?.awsAccountUsername;
    }

    console.info(`Fetching cost data for user ${userId} from ${startDate} to ${endDate} with granularity ${granularity}`);
    if (granularity=== "HOURLY") {
      startDate = `${startDate}T00:00:00Z`;
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      endDate = `${endDate}T${hours}:${minutes}:${seconds}Z`;
      console.info(`startDate=${startDate}\nendDate=${endDate}`);
    }
    const costData = await getCostAndUsage(clients.costExplorer, {
      startDate,
      endDate,
      granularity,
    }, awsAccountUsername);

    res.status(200).json(costData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    
    console.error("Get cost data error:", error);

    const err = error as any;
    const message = err?.message || err?.Error?.Message || "Get cost data error";
    const code = err?.Code || "UnknownError";

    res.status(500).json({
      error: {
        code,
        message,
      },
    });
  }
};

export const getForecast = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const { month } = forecastQuerySchema.parse(req.query);

    const clients = await getAWSClientForUser(userId);
    if (!clients) {
      res.status(400).json({ error: "No AWS account connected" });
      return;
    }

    const forecast = await getMonthlyForecast(clients.costExplorer, month);

    res.status(200).json({ forecast });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error("Get forecast error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const recommendationQuerySchema = z.object({
  accountId: z.string().optional(),
});

export const generateRecommendations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const { accountId } = recommendationQuerySchema.parse(req.body);

    const whereCondition: any = { userId, status: "ACTIVE" };
    if (accountId) {
      whereCondition.id = accountId;
    }

    const awsAccounts = await prisma.awsAccount.findMany({
      where: whereCondition,
    });

    if (awsAccounts.length === 0) {
      res.status(400).json({ error: "No AWS account connected" });
      return;
    }

    let totalRecommendations = 0;
    for (const account of awsAccounts) {
      const count = await analyzeAndSaveRecommendations(account.id);
      totalRecommendations += count;
    }

    const recommendations = await getRecommendationsByAccount(userId, accountId);

    res.status(200).json({
      success: true,
      message: `Generated ${totalRecommendations} recommendations`,
      totalRecommendations,
      recommendations,
    });
  } catch (error) {
    console.error("Generate recommendations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getRecommendations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const { accountId } = recommendationQuerySchema.parse(req.query);

    if (accountId) {
      const awsAccount = await prisma.awsAccount.findFirst({
        where: { id: accountId, userId },
      });
      if (!awsAccount || awsAccount.status === "INACTIVE") {
        res.status(400).json({ error: "No AWS account connected" });
        return;
      }
    }

    const recommendations = await getRecommendationsByAccount(userId, accountId);

    const totalSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);

    res.status(200).json({
      recommendations,
      totalSavings,
      count: recommendations.length,
    });
  } catch (error) {
    console.error("Get recommendations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteAWSAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;
    const { id } = req.params;

    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: "Invalid account ID" });
      return;
    }

    const account = await prisma.awsAccount.findFirst({
      where: { id, userId },
    });

    if (!account || account.status === "INACTIVE") {
      res.status(400).json({ error: "No AWS account found" });
      return;
    }

    await prisma.$transaction([
      prisma.recommendation.updateMany({
        where: {
          resource: {
            awsAccountId: id,
          },
        },
        data: { status: "INACTIVE" },
      }),
      prisma.resource.updateMany({
        where: { awsAccountId: id },
        data: { status: "INACTIVE" },
      }),
      prisma.awsAccount.update({
        where: { id },
        data: { status: "INACTIVE" },
      }),
    ]);

    console.info(`AWS account deleted (soft delete): ${account.awsAccountUsername} (ID: ${id})`);
    res.status(200).json({ message: "AWS account deleted successfully" });
  } catch (error) {
    console.error("Delete AWS account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};