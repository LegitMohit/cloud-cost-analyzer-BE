import { ChatGroq } from "@langchain/groq";
import { env } from "@cloud_cost_analyzer/env/server";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { prisma } from "@cloud_cost_analyzer/db";

type PageType = "recommendations" | "costs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RecommendationData {
  id: string;
  issue: string;
  recommendation: string;
  estimatedSavings: number;
  resourceId: string;
  resourceType: string;
  resourceIdentifier: string;
  awsAccountUsername: string;
}

interface CostAnalysisData {
  totalCost: number;
  serviceBreakdown: Array<{
    serviceName: string;
    cost: number;
  }>;
  awsAccountUsername?: string;
}

interface ChatContext {
  pageType: PageType;
  accountId?: string;
  userId?: string;
  recommendations?: RecommendationData[];
  costData?: CostAnalysisData;
}

interface UserAccounts {
  id: string;
  awsAccountUsername: string;
  region: string;
}

const userHistories = new Map<string, ChatMessage[]>();

const OUT_OF_SCOPE_MESSAGE = "I'm sorry, but I'm specifically designed to help with AWS cost analysis, cloud cost optimization, and recommendations. I don't have information about other topics. Please feel free to ask me anything related to your AWS costs, spending patterns, or cost-saving recommendations!";

const NO_DATA_MESSAGE = "I don't have any data to answer your question. Please fetch your cost data or recommendations first, then ask me questions about them.";

function getSystemPrompt(pageType: PageType): string {
  const basePrompt = "You are a helpful AI assistant for a cloud cost analyzer application. ";
  const scopeRestriction = ` IMPORTANT: You must only answer questions related to AWS cloud costs, cost analysis, cost optimization, AWS services, spending patterns, recommendations, or cloud infrastructure. If the user asks about anything unrelated (like general knowledge, other topics, personal questions, etc.), respond with: "${OUT_OF_SCOPE_MESSAGE}" Do not answer off-topic questions.`;

  if (pageType === "recommendations") {
    return basePrompt + `You are currently on the recommendations page where users can generate and view AWS cost optimization recommendations. Help users understand their recommendations, potential savings, and how to implement them. Be concise but thorough. ${scopeRestriction}`;
  } else if (pageType === "costs") {
    return basePrompt + `You are currently on the costs page where users can view their AWS cost analysis. Help users understand their spending patterns, service breakdowns, and cost optimization strategies. Be concise but thorough. ${scopeRestriction}`;
  }
  return basePrompt + "Help users with their cloud cost management questions." + scopeRestriction;
}

function convertToLangChainMessages(messages: ChatMessage[]): (HumanMessage | AIMessage)[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return new HumanMessage(msg.content);
    }
    return new AIMessage(msg.content);
  });
}

const model = new ChatGroq({
  model: env.GROQ_MODEL,
  apiKey: env.GROQ_API_KEY,
  temperature: 0.7,
  maxRetries: 2,
});

export async function sendMessage(userId: string, message: string, context: ChatContext): Promise<string> {
  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId)!;

  const hasRecommendations = context.recommendations && context.recommendations.length > 0;
  const hasCostData = context.costData;

  let costDataInfo = "";
  let recommendationsInfo = "";

  if (hasRecommendations) {
    const recs = context.recommendations!.slice(0, 5);
    recommendationsInfo = `\n\nYour recommendations:\n${recs.map((r, i) => 
      `${i + 1}. Issue: ${r.issue}\n   Recommendation: ${r.recommendation}\n   Estimated savings: $${r.estimatedSavings}/month`
    ).join('\n')}`;
  }

  if (hasCostData) {
    const cd = context.costData!;
    let costInfo = `\n\nYour cost analysis:\nTotal Cost: $${cd.totalCost}`;
    if (cd.awsAccountUsername) {
      costInfo += `\nAccount: ${cd.awsAccountUsername}`;
    }
    if (cd.serviceBreakdown && cd.serviceBreakdown.length > 0) {
      costInfo += `\nServices:\n${cd.serviceBreakdown.map(s => `  - ${s.serviceName}: $${s.cost}`).join('\n')}`;
    }
    costDataInfo = costInfo;
  }

  const lowerMessage = message.toLowerCase();
  const asksAboutData = 
    lowerMessage.includes('cost') || 
    lowerMessage.includes('recommendation') || 
    lowerMessage.includes('saving') ||
    lowerMessage.includes('spending') ||
    lowerMessage.includes('analyze') ||
    lowerMessage.includes('summarize');

  if (asksAboutData && !hasRecommendations && !hasCostData) {
    return NO_DATA_MESSAGE;
  }

  const systemPrompt = getSystemPrompt(context.pageType);
  const augmentedSystemPrompt = systemPrompt + costDataInfo + recommendationsInfo;
  const systemMessage = new SystemMessage(augmentedSystemPrompt);

  const allMessages = [
    systemMessage,
    ...convertToLangChainMessages(history),
    new HumanMessage(message),
  ];

  try {
    const response = await model.invoke(allMessages);
    const responseText = response.content as string;

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: responseText });

    return responseText;
  } catch (error) {
    console.error("Chatbot error:", error);
    throw new Error("Failed to get response from AI assistant");
  }
}

export function clearHistory(userId: string): void {
  userHistories.delete(userId);
}

export function getHistory(userId: string): ChatMessage[] {
  return userHistories.get(userId) || [];
}

export async function getUserAccounts(userId: string): Promise<UserAccounts[]> {
  try {
    const accounts = await prisma.awsAccount.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        awsAccountUsername: true,
        region: true,
      },
    });
    return accounts;
  } catch (error) {
    console.error("Failed to get user accounts:", error);
    return [];
  }
}