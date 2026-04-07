import { EC2Client, DescribeVolumesCommand } from "@aws-sdk/client-ec2";
import type { DescribeVolumesCommandOutput } from "@aws-sdk/client-ec2";

export interface EBSVolume {
  volumeId: string;
  state: string;
  attachmentStatus: string;
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
        volumes.push({
          volumeId: volume.VolumeId,
          state: volume.State || "unknown",
          attachmentStatus: attachment?.State || "detached",
        });
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return volumes;
}