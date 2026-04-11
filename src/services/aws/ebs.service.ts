import { EC2Client, DescribeVolumesCommand } from "@aws-sdk/client-ec2";
import type { DescribeVolumesCommandOutput } from "@aws-sdk/client-ec2";

export interface EBSVolume {
  volumeId: string;
  state: string;
  attachmentStatus: string;
  volumeType?: string;
  size?: number;
  iops?: number;
  encrypted?: boolean;
  kmsKeyId?: string;
  createTime?: Date;
  availabilityZone?: string;
  tags?: Record<string, string>;
}

export async function fetchEBSVolumes(client: EC2Client): Promise<EBSVolume[]> {
  const volumes: EBSVolume[] = [];

  let nextToken: string | undefined;
  do {
    const command = new DescribeVolumesCommand({
      MaxResults: 100,
      NextToken: nextToken,
    });

    const response: DescribeVolumesCommandOutput = await client.send(command);

    for (const volume of response.Volumes || []) {
      if (volume.VolumeId) {
        const attachment = volume.Attachments?.[0];
        
        const tagMap: Record<string, string> = {};
        for (const tag of volume.Tags || []) {
          if (tag.Key && tag.Value) {
            tagMap[tag.Key] = tag.Value;
          }
        }

        volumes.push({
          volumeId: volume.VolumeId,
          state: volume.State || "unknown",
          attachmentStatus: attachment?.State || "detached",
          volumeType: volume.VolumeType,
          size: volume.Size,
          iops: volume.Iops,
          encrypted: volume.Encrypted,
          kmsKeyId: volume.KmsKeyId,
          createTime: volume.CreateTime,
          availabilityZone: volume.AvailabilityZone,
          tags: tagMap,
        });
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return volumes;
}