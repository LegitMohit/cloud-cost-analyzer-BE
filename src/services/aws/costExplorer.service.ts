import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import type { GetCostAndUsageCommandInput, GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";

export interface CostData {
  startDate: string;
  endDate: string;
  totalCost: number;
  serviceBreakdown: ServiceCost[];
}

export interface ServiceCost {
  serviceName: string;
  cost: number;
}

export interface CostQueryOptions {
  startDate: string;
  endDate: string;
  granularity?: "DAILY" | "MONTHLY" | "HOURLY";
  metrics?: string[];
}

export async function getCostAndUsage(
  client: CostExplorerClient,
  options: CostQueryOptions
): Promise<CostData> {
  const formatDateForAWS = (date: string): string => {
    return date;
  };

  const params: GetCostAndUsageCommandInput = {
    TimePeriod: {
      Start: formatDateForAWS(options.startDate),
      End: formatDateForAWS(options.endDate),
    },
    Granularity: options.granularity || "DAILY",

    Metrics: options.metrics || ["UnblendedCost"],
    GroupBy: [
      {
        Type: "DIMENSION",
        Key: "SERVICE",
      },
    ],
  };

  const command = new GetCostAndUsageCommand(params);
  const response: GetCostAndUsageCommandOutput = await client.send(command);

  const serviceCosts: ServiceCost[] = [];
  let totalCost = 0;

  for (const result of response.ResultsByTime || []) {
    for (const group of result.Groups || []) {
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");
      totalCost += cost;
      serviceCosts.push({
        serviceName: group.Keys?.[0] || "Unknown",
        cost,
      });
    }
  }

  return {
    startDate: options.startDate,
    endDate: options.endDate,
    totalCost,
    serviceBreakdown: serviceCosts,
  };
}

export async function getMonthlyForecast(
  client: CostExplorerClient,
  month: string
): Promise<number> {
  const params: GetCostAndUsageCommandInput = {
    TimePeriod: {
      Start: `${month}-01`,
      End: month,
    },
    Granularity: "MONTHLY",
    Metrics: ["ForecastedAmount"],
  };

  const command = new GetCostAndUsageCommand(params);
  const response = await client.send(command);

  const forecastAmount = parseFloat(
    response.ResultsByTime?.[0]?.Total?.ForecastedAmount?.Amount || "0"
  );

  return forecastAmount;
}