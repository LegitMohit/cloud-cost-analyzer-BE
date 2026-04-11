import { S3Client, ListBucketsCommand, GetBucketVersioningCommand, GetBucketEncryptionCommand, GetBucketPolicyCommand, GetBucketLifecycleConfigurationCommand, ListMultipartUploadsCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import type { ListBucketsCommandOutput } from "@aws-sdk/client-s3";

export interface S3Bucket {
  bucketName: string;
  versioningEnabled?: boolean;
  encryptionEnabled?: boolean;
  policyEnabled?: boolean;
  lifecycleEnabled?: boolean;
  creationDate?: Date;
  region?: string;
}

export async function fetchS3Buckets(client: S3Client): Promise<S3Bucket[]> {
  const command = new ListBucketsCommand({});
  const response: ListBucketsCommandOutput = await client.send(command);

  const buckets: S3Bucket[] = [];
  for (const bucket of response.Buckets || []) {
    if (bucket.Name) {
      buckets.push({
        bucketName: bucket.Name,
        creationDate: bucket.CreationDate,
      });
    }
  }

  return buckets;
}

export async function getBucketDetails(client: S3Client, bucketName: string): Promise<{
  versioningEnabled: boolean;
  encryptionEnabled: boolean;
  policyEnabled: boolean;
  lifecycleEnabled: boolean;
  incompleteUploads: number;
  oldVersions: number;
}> {
  let versioningEnabled = false;
  let encryptionEnabled = false;
  let policyEnabled = false;
  let lifecycleEnabled = false;
  let incompleteUploads = 0;
  let oldVersions = 0;

  try {
    const versioningCmd = new GetBucketVersioningCommand({ Bucket: bucketName });
    const versioningRes = await client.send(versioningCmd);
    versioningEnabled = versioningRes.Status === "Enabled";
  } catch { }

  try {
    const encryptionCmd = new GetBucketEncryptionCommand({ Bucket: bucketName });
    const encryptionRes = await client.send(encryptionCmd);
    encryptionEnabled = !!encryptionRes.ServerSideEncryptionConfiguration;
  } catch { }

  try {
    const policyCmd = new GetBucketPolicyCommand({ Bucket: bucketName });
    const policyRes = await client.send(policyCmd);
    policyEnabled = !!policyRes.Policy;
  } catch { }

  try {
    const lifecycleCmd = new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName });
    const lifecycleRes = await client.send(lifecycleCmd);
    lifecycleEnabled = !!lifecycleRes.Rules?.length;
  } catch { }

  try {
    const multipartCmd = new ListMultipartUploadsCommand({ Bucket: bucketName });
    const multipartRes = await client.send(multipartCmd);
    incompleteUploads = multipartRes.Uploads?.length || 0;
  } catch { }

  if (versioningEnabled) {
    try {
      const versionsCmd = new ListObjectVersionsCommand({ Bucket: bucketName, MaxKeys: 1000 });
      const versionsRes = await client.send(versionsCmd);
      oldVersions = (versionsRes.Versions?.length || 0) - (versionsRes.DeleteMarkers?.length || 0);
    } catch { }
  }

  return {
    versioningEnabled,
    encryptionEnabled,
    policyEnabled,
    lifecycleEnabled,
    incompleteUploads,
    oldVersions,
  };
}