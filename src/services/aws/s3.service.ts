import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import type { ListBucketsCommandOutput } from "@aws-sdk/client-s3";

export interface S3Bucket {
  bucketName: string;
}

export async function fetchS3Buckets(client: S3Client): Promise<S3Bucket[]> {
  const command = new ListBucketsCommand({});
  const response: ListBucketsCommandOutput = await client.send(command);

  const buckets: S3Bucket[] = [];
  for (const bucket of response.Buckets || []) {
    if (bucket.Name) {
      buckets.push({
        bucketName: bucket.Name,
      });
    }
  }

  return buckets;
}