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

const connectSchema = z.object({
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  region: z.string().min(1),
});

const costQuerySchema = z.object({
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
    const { accessKey, secretKey, region } = connectSchema.parse(req.body);

    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const userId = decoded.id;

    const clients = createAWSClients({ accessKey, secretKey, region });

    const isValid = await validateAWSCredentials(clients.ec2);
    if (isValid!== true) {
      res.status(401).json({
        success: false,
        error: {
          message: isValid as string
          // message: "Invalid AWS credentials. Please check your Access Key, Secret Key, and Region."
        },
      });
      return;
    }

    const encryptedSecretKey = encrypt(secretKey);

    const awsAccountUsername = await getAWSAccountUsername(clients.sts);

    const [ec2Instances, ebsVolumes, s3Buckets, rdsInstances] = await Promise.all([
      fetchEC2Instances(clients.ec2),
      fetchEBSVolumes(clients.ec2),
      fetchS3Buckets(clients.s3),
      fetchRDSInstances(clients.rds),
    ]);

    const awsAccount = await prisma.awsAccount.create({
      data: {
        userId,
        awsAccountUsername,
        accessKey,
        secretKey: encryptedSecretKey,
        region,
      },
    });

    const resources = [];

    for (const instance of ec2Instances) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "EC2",
        resourceId: instance.instanceId,
        status: instance.state,
        estimatedCost: 0,
      });
    }

    for (const volume of ebsVolumes) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "EBS",
        resourceId: volume.volumeId,
        status: volume.attachmentStatus,
        estimatedCost: 0,
      });
    }

    for (const bucket of s3Buckets) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "S3",
        resourceId: bucket.bucketName,
        status: "active",
        estimatedCost: 0,
      });
    }

    for (const dbInstance of rdsInstances) {
      resources.push({
        awsAccountId: awsAccount.id,
        resourceType: "RDS",
        resourceId: dbInstance.dbInstanceIdentifier,
        status: dbInstance.status,
        estimatedCost: 0,
      });
    }

    await prisma.resource.createMany({
      data: resources,
    });

    console.info(`AWS account connected for user ${userId}: ${resources.length} resources fetched`);

    res.status(201).json({
      message: "AWS account connected successfully",
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
      where: { userId },
    });

    if (awsAccounts.length === 0) {
      res.status(200).json({ resources: [] });
      return;
    }

    const accountIds = awsAccounts.map((account) => account.id);

    const resources = await prisma.resource.findMany({
      where: { awsAccountId: { in: accountIds } },
    });

    res.status(200).json({ resources });
  } catch (error) {
    console.error("Get AWS resources error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function getAWSClientForUser(userId: string) {
  const awsAccount = await prisma.awsAccount.findFirst({
    where: { userId },
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

    const { startDate, endDate, granularity } = costQuerySchema.parse(req.body);

    const clients = await getAWSClientForUser(userId);
    if (!clients) {
      res.status(400).json({ error: "No AWS account connected" });
      return;
    }
    console.info(`Fetching cost data for user ${userId} from ${startDate} to ${endDate} with granularity ${granularity}`);
    const costData = await getCostAndUsage(clients.costExplorer, {
      startDate,
      endDate,
      granularity,
    });

    res.status(200).json(costData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error("Get cost data error:", error);
    res.status(500).json({ error: "Get cost data error" });
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