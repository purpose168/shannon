import { defineQuery } from '@temporalio/workflow';

// === 类型定义 ===

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId?: string; // 由客户端添加，用于审计关联
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
}

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number; // 墙钟时间（结束 - 开始）
  totalTurns: number;
  agentCount: number;
}

export interface PipelineState {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  summary: PipelineSummary | null;
}

// 由 getProgress 查询返回的扩展状态（包含计算字段）
export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
}

// 单个漏洞→利用管道的结果
export interface VulnExploitPipelineResult {
  vulnType: string;
  vulnMetrics: AgentMetrics | null;
  exploitMetrics: AgentMetrics | null;
  exploitDecision: {
    shouldExploit: boolean;
    vulnerabilityCount: number;
  } | null;
  error: string | null;
}

// === 查询定义 ===

export const getProgress = defineQuery<PipelineProgress>('getProgress');