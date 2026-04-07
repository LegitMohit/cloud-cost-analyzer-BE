import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import type { GetMetricStatisticsCommandInput } from "@aws-sdk/client-cloudwatch";

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
}

export interface EC2MetricOptions {
  instanceId: string;
  metricName: string;
  startTime: Date;
  endTime: Date;
  period?: number;
  statistics?: ("SampleCount" | "Average" | "Sum" | "Maximum" | "Minimum")[];
}

export async function getEC2Metric(
  client: CloudWatchClient,
  options: EC2MetricOptions
): Promise<MetricDataPoint[]> {
  const params: GetMetricStatisticsCommandInput = {
    Namespace: "AWS/EC2",
    MetricName: options.metricName,
    Dimensions: [
      {
        Name: "InstanceId",
        Value: options.instanceId,
      },
    ],
    StartTime: options.startTime,
    EndTime: options.endTime,
    Period: options.period || 3600,
    Statistics: options.statistics || ["Average"],
  };

  const command = new GetMetricStatisticsCommand(params);
  const response = await client.send(command);

  const dataPoints: MetricDataPoint[] = [];
  for (const dp of response.Datapoints || []) {
    if (dp.Timestamp && dp.Average !== undefined) {
      dataPoints.push({
        timestamp: dp.Timestamp,
        value: dp.Average,
      });
    }
  }

  return dataPoints;
}

export async function getEBSVolumeMetrics(
  client: CloudWatchClient,
  volumeId: string,
  startTime: Date,
  endTime: Date
): Promise<MetricDataPoint[]> {
  const params: GetMetricStatisticsCommandInput = {
    Namespace: "AWS/EBS",
    MetricName: "VolumeWriteBytes",
    Dimensions: [
      {
        Name: "VolumeId",
        Value: volumeId,
      },
    ],
    StartTime: startTime,
    EndTime: endTime,
    Period: 3600,
    Statistics: ["Sum"],
  };

  const command = new GetMetricStatisticsCommand(params);
  const response = await client.send(command);

  const dataPoints: MetricDataPoint[] = [];
  for (const dp of response.Datapoints || []) {
    if (dp.Timestamp && dp.Sum !== undefined) {
      dataPoints.push({
        timestamp: dp.Timestamp,
        value: dp.Sum,
      });
    }
  }

  return dataPoints;
}