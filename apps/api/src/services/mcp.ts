/**
 * MCP layer for ORQ8.
 *
 * Agents discover and invoke external tools through a per-company MCP server
 * registry. Execution NEVER bypasses the ORQ8 security model: every tool maps
 * to the existing connector-action chain (canAgentUseCapability -> approval
 * -> provider call -> connector_outcome -> audit). There is no parallel
 * permission system and no raw credential access for agents.
 *
 * Only providers with a real connector are executable (github | gmail |
 * linear). A custom server can be registered and discovered, but invoking its
 * tools returns a structured `transport_unsupported` outcome rather than
 * pretending to speak an MCP protocol we do not implement.
 */
import { eq, and, inArray } from 'drizzle-orm';
import {
  mcpServers,
  mcpTools,
  type Db,
  type McpServer,
  type NewMcpServer,
  type McpTool,
  type NewMcpTool,
} from '@orq8/db';
import {
  ConnectorActionError,
  ConnectorActionContext,
  ConnectorActionResult,
  GITHUB_CAPABILITIES,
  githubListRepositories,
  githubListIssues,
  githubReadFile,
  githubCreateIssue,
  githubCommentOnIssue,
  githubCreatePullRequest,
} from './connector-actions.js';
import { dispatchGmailAction } from './connector-gmail.js';
import { dispatchLinearAction } from './connector-linear.js';
import { canAgentUseCapability } from './integrations.js';
import { appendAudit } from './audit.js';

export const MCP_PROVIDERS = ['github', 'gmail', 'linear'] as const;
export type McpProvider = (typeof MCP_PROVIDERS)[number];

export interface McpToolCatalogEntry {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredCapability: string;
  requiresApproval: boolean;
  supportsDryRun: boolean;
  idempotent: boolean;
  inputSchema: Record<string, unknown>;
  provider: McpProvider;
  action: string;
}

/** Real, executable tool catalog for connector-backed MCP servers. */
const CONNECTOR_TOOL_CATALOG: Record<McpProvider, McpToolCatalogEntry[]> = {
  github: [
    {
      name: 'list_repositories', description: 'List repositories the connected GitHub account can see.',
      riskLevel: 'low', requiredCapability: GITHUB_CAPABILITIES.readRepositories, requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { visibility: { type: 'string', enum: ['all', 'public', 'private'] } },
      provider: 'github', action: 'list_repositories',
    },
    {
      name: 'list_issues', description: 'List issues in a repository.',
      riskLevel: 'low', requiredCapability: GITHUB_CAPABILITIES.readIssues, requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] } },
      provider: 'github', action: 'list_issues',
    },
    {
      name: 'read_file', description: 'Read a file from a repository branch.',
      riskLevel: 'low', requiredCapability: GITHUB_CAPABILITIES.readFiles, requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, branch: { type: 'string' } },
      provider: 'github', action: 'read_file',
    },
    {
      name: 'create_issue', description: 'Create an issue in a repository. External write — approval-gated by policy.',
      riskLevel: 'medium', requiredCapability: GITHUB_CAPABILITIES.createIssues, requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array' } },
      provider: 'github', action: 'create_issue',
    },
    {
      name: 'comment_on_issue', description: 'Comment on an existing GitHub issue.',
      riskLevel: 'medium', requiredCapability: GITHUB_CAPABILITIES.commentOnIssues, requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, issueNumber: { type: 'number' }, body: { type: 'string' } },
      provider: 'github', action: 'comment_on_issue',
    },
    {
      name: 'create_pull_request', description: 'Open a pull request between two branches.',
      riskLevel: 'high', requiredCapability: GITHUB_CAPABILITIES.createPullRequests, requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' } },
      provider: 'github', action: 'create_pull_request',
    },
  ],
  gmail: [
    {
      name: 'search', description: 'Search the connected Gmail inbox.',
      riskLevel: 'low', requiredCapability: 'gmail.search', requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { query: { type: 'string' }, maxResults: { type: 'number' } },
      provider: 'gmail', action: 'search',
    },
    {
      name: 'create_draft', description: 'Create a Gmail draft. Nothing is sent.',
      riskLevel: 'medium', requiredCapability: 'gmail.create_draft', requiresApproval: false,
      supportsDryRun: false, idempotent: false, inputSchema: { to: { type: 'array' }, cc: { type: 'array' }, subject: { type: 'string' }, body: { type: 'string' }, inReplyToMessageId: { type: 'string' } },
      provider: 'gmail', action: 'create_draft',
    },
    {
      name: 'send_draft', description: 'Send a Gmail draft externally. High-risk — requires approval.',
      riskLevel: 'high', requiredCapability: 'gmail.send', requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { draftId: { type: 'string' } },
      provider: 'gmail', action: 'send_draft',
    },
  ],
  linear: [
    {
      name: 'list_issues', description: 'List Linear issues for a team.',
      riskLevel: 'low', requiredCapability: 'linear.read', requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { teamId: { type: 'string' }, limit: { type: 'number' } },
      provider: 'linear', action: 'list_issues',
    },
    {
      name: 'get_issue', description: 'Get a single Linear issue.',
      riskLevel: 'low', requiredCapability: 'linear.read', requiresApproval: false,
      supportsDryRun: true, idempotent: true, inputSchema: { issueId: { type: 'string' } },
      provider: 'linear', action: 'get_issue',
    },
    {
      name: 'create_issue', description: 'Create a Linear issue.',
      riskLevel: 'medium', requiredCapability: 'linear.create', requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { teamId: { type: 'string' }, teamName: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number' } },
      provider: 'linear', action: 'create_issue',
    },
    {
      name: 'update_issue', description: 'Update a Linear issue.',
      riskLevel: 'medium', requiredCapability: 'linear.update', requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { issueId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number' }, stateId: { type: 'string' } },
      provider: 'linear', action: 'update_issue',
    },
    {
      name: 'archive_issue', description: 'Archive a Linear issue.',
      riskLevel: 'high', requiredCapability: 'linear.update', requiresApproval: true,
      supportsDryRun: false, idempotent: false, inputSchema: { issueId: { type: 'string' } },
      provider: 'linear', action: 'archive_issue',
    },
  ],
};

export function getConnectorToolCatalog(provider: string): McpToolCatalogEntry[] {
  return CONNECTOR_TOOL_CATALOG[provider as McpProvider] ?? [];
}

// ─── Server registry ────────────────────────────────────────────────────────

export async function listMcpServers(db: Db, orgId: string): Promise<McpServer[]> {
  return db.select().from(mcpServers).where(eq(mcpServers.orgId, orgId)).orderBy(mcpServers.name);
}

export async function getMcpServer(db: Db, orgId: string, id: string): Promise<McpServer | undefined> {
  const rows = await db.select().from(mcpServers).where(and(eq(mcpServers.id, id), eq(mcpServers.orgId, orgId))).limit(1);
  return rows[0];
}

export async function getMcpServerByProvider(db: Db, orgId: string, provider: string): Promise<McpServer | undefined> {
  const rows = await db.select().from(mcpServers).where(and(eq(mcpServers.orgId, orgId), eq(mcpServers.provider, provider))).limit(1);
  return rows[0];
}

/**
 * Register (or return) a connector-backed MCP server. One server per provider
 * per org; the provider's real tool catalog is seeded as MCP tools. Idempotent.
 */
export async function registerMcpServer(
  db: Db,
  data: { orgId: string; name: string; description?: string; provider: string; riskLevel?: string; allowedAgents?: string[] },
): Promise<McpServer> {
  const existing = await getMcpServerByProvider(db, data.orgId, data.provider);
  if (existing) return existing;

  const isConnector = (MCP_PROVIDERS as readonly string[]).includes(data.provider);
  const rows = await db
    .insert(mcpServers)
    .values({
      orgId: data.orgId,
      name: data.name,
      description: data.description ?? null,
      provider: data.provider,
      transport: isConnector ? 'connector' : 'streamable_http',
      status: isConnector ? 'unconfigured' : 'unconfigured',
      riskLevel: data.riskLevel ?? 'medium',
      allowedAgents: data.allowedAgents ?? [],
    })
    .returning();
  const server = rows[0];
  if (!server) throw new Error('registerMcpServer returned no row');

  if (isConnector) {
    for (const tool of getConnectorToolCatalog(data.provider)) {
      await db.insert(mcpTools).values({
        orgId: data.orgId,
        serverId: server.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        riskLevel: tool.riskLevel,
        requiredCapability: tool.requiredCapability,
        requiresApproval: tool.requiresApproval,
        supportsDryRun: tool.supportsDryRun,
        idempotent: tool.idempotent,
      });
    }
  }

  await appendAudit(db, {
    orgId: data.orgId,
    actorType: 'user',
    action: 'mcp.server_registered',
    outcome: 'success',
    resultRef: JSON.stringify({ provider: data.provider, toolCount: isConnector ? getConnectorToolCatalog(data.provider).length : 0 }),
  });
  return server;
}

export async function updateMcpServer(
  db: Db,
  orgId: string,
  id: string,
  updates: Partial<Pick<McpServer, 'name' | 'description' | 'status' | 'riskLevel' | 'allowedAgents' | 'enabled' | 'endpoint' | 'credentialRef'>>,
): Promise<McpServer | undefined> {
  const rows = await db
    .update(mcpServers)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(mcpServers.id, id), eq(mcpServers.orgId, orgId)))
    .returning();
  return rows[0];
}

export async function deleteMcpServer(db: Db, orgId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.orgId, orgId)))
    .returning({ id: mcpServers.id });
  return rows.length > 0;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

export async function listMcpTools(db: Db, serverId: string): Promise<McpTool[]> {
  return db.select().from(mcpTools).where(eq(mcpTools.serverId, serverId)).orderBy(mcpTools.name);
}

export async function getMcpTool(db: Db, orgId: string, id: string): Promise<McpTool | undefined> {
  const rows = await db.select().from(mcpTools).where(and(eq(mcpTools.id, id), eq(mcpTools.orgId, orgId))).limit(1);
  return rows[0];
}

/**
 * Discover tools an agent may invoke: server enabled + tool enabled +
 * server-level agent allowlist + agent capability match. This is the
 * server-side gate; the executing connector chain re-checks everything.
 */
export async function discoverMcpTools(
  db: Db,
  orgId: string,
  agentId: string,
  agentCapabilities: string[],
): Promise<Array<McpTool & { serverName: string; provider: string; serverStatus: string; requiresApproval: boolean }>> {
  const servers = await listMcpServers(db, orgId);
  const enabledServers = servers.filter((s) => s.enabled);
  if (enabledServers.length === 0) return [];

  const serverIds = enabledServers.map((s) => s.id);
  const tools = await db.select().from(mcpTools).where(and(eq(mcpTools.orgId, orgId), inArray(mcpTools.serverId, serverIds)));
  const serverById = new Map(enabledServers.map((s) => [s.id, s]));

  const out: Array<McpTool & { serverName: string; provider: string; serverStatus: string; requiresApproval: boolean }> = [];
  for (const tool of tools) {
    const server = serverById.get(tool.serverId);
    if (!server || !tool.enabled) continue;

    const allowlist = (server.allowedAgents as string[] | null) ?? [];
    if (allowlist.length > 0 && !allowlist.includes(agentId)) continue;

    if (tool.requiredCapability && !agentCapabilities.includes(tool.requiredCapability)) continue;

    out.push({ ...tool, serverName: server.name, provider: server.provider, serverStatus: server.status, requiresApproval: tool.requiresApproval });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Static permission check — used by the discovery API and the agent context. */
export async function checkMcpToolPermission(
  db: Db,
  orgId: string,
  agentId: string,
  toolId: string,
  agentCapabilities: string[],
): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
  const tool = await getMcpTool(db, orgId, toolId);
  if (!tool) return { allowed: false, requiresApproval: false, reason: 'tool_not_found' };
  const server = await getMcpServer(db, orgId, tool.serverId);
  if (!server || !server.enabled) return { allowed: false, requiresApproval: false, reason: 'server_disabled' };
  if (!tool.enabled) return { allowed: false, requiresApproval: false, reason: 'tool_disabled' };

  const allowlist = (server.allowedAgents as string[] | null) ?? [];
  if (allowlist.length > 0 && !allowlist.includes(agentId)) {
    return { allowed: false, requiresApproval: false, reason: 'agent_not_allowed' };
  }
  if (tool.requiredCapability && !agentCapabilities.includes(tool.requiredCapability)) {
    return { allowed: false, requiresApproval: false, reason: 'capability_denied' };
  }
  return { allowed: true, requiresApproval: tool.requiresApproval };
}

/**
 * Execute an MCP tool. The tool must map to a connector-backed provider;
 * execution dispatches to the existing connector-action chain which performs
 * capability checks, approval gating, outcome recording and audit. Custom
 * (non-connector) servers return a structured error — they are discoverable
 * but not executable until a real transport client exists.
 */
export async function executeMcpTool(
  db: Db,
  ctx: ConnectorActionContext,
  toolId: string,
  params: Record<string, unknown>,
  agentCapabilities: string[],
): Promise<ConnectorActionResult<unknown> | { status: 'error'; code: string; message: string }> {
  const tool = await getMcpTool(db, ctx.orgId, toolId);
  if (!tool) {
    return { status: 'error', code: 'tool_not_found', message: 'MCP tool not found in this organization' };
  }
  const server = await getMcpServer(db, ctx.orgId, tool.serverId);
  if (!server || !server.enabled || !tool.enabled) {
    return { status: 'error', code: 'server_disabled', message: 'MCP server or tool is disabled' };
  }

  const permission = await checkMcpToolPermission(db, ctx.orgId, ctx.agentId, toolId, agentCapabilities);
  if (!permission.allowed) {
    return { status: 'error', code: permission.reason ?? 'capability_denied', message: 'Agent is not permitted to use this tool' };
  }
  if (permission.requiresApproval) {
    return { status: 'error', code: 'approval_required', message: 'This tool requires approval before execution' };
  }

  // Re-check through the capability model (the connector chain is authoritative).
  if (server.provider !== 'custom' && tool.requiredCapability) {
    const { allowed } = await canAgentUseCapability(db, ctx.orgId, ctx.agentId, server.provider, tool.requiredCapability);
    if (!allowed) {
      return { status: 'error', code: 'capability_denied', message: `Agent lacks capability ${tool.requiredCapability} on ${server.provider}` };
    }
  }

  try {
    switch (server.provider) {
      case 'github':
        return await dispatchGithubTool(tool.name, db, ctx, params);
      case 'gmail':
        return await dispatchGmailAction(db, ctx, mapGmailAction(tool.name), params);
      case 'linear':
        return await dispatchLinearAction(db, ctx, mapLinearAction(tool.name), params);
      default:
        return {
          status: 'error',
          code: 'transport_unsupported',
          message: `MCP server '${server.provider}' has no executable transport client; register a connector-backed server (github | gmail | linear) instead`,
        };
    }
  } catch (err) {
    if (err instanceof ConnectorActionError) {
      return { status: 'error', code: err.code, message: err.message };
    }
    return { status: 'error', code: 'provider_error', message: err instanceof Error ? err.message : 'Unknown MCP execution error' };
  }
}

async function dispatchGithubTool(
  name: string,
  db: Db,
  ctx: ConnectorActionContext,
  params: Record<string, unknown>,
): Promise<ConnectorActionResult<unknown>> {
  switch (name) {
    case 'list_repositories':
      return githubListRepositories(db, ctx, { visibility: params.visibility === undefined ? undefined : String(params.visibility) as 'all' | 'public' | 'private' });
    case 'list_issues':
      return githubListIssues(db, ctx, {
        owner: String(params.owner ?? ''), repo: String(params.repo ?? ''),
        state: params.state === undefined ? undefined : String(params.state) as 'open' | 'closed' | 'all',
      });
    case 'read_file':
      return githubReadFile(db, ctx, {
        owner: String(params.owner ?? ''), repo: String(params.repo ?? ''), path: String(params.path ?? ''),
        ref: params.branch === undefined ? undefined : String(params.branch),
      });
    case 'create_issue':
      return githubCreateIssue(db, ctx, {
        owner: String(params.owner ?? ''), repo: String(params.repo ?? ''), title: String(params.title ?? ''),
        body: params.body === undefined ? undefined : String(params.body),
        labels: Array.isArray(params.labels) ? params.labels.map(String) : undefined,
      });
    case 'comment_on_issue':
      return githubCommentOnIssue(db, ctx, {
        owner: String(params.owner ?? ''), repo: String(params.repo ?? ''), issueNumber: Number(params.issueNumber ?? 0), body: String(params.body ?? ''),
      });
    case 'create_pull_request':
      return githubCreatePullRequest(db, ctx, {
        owner: String(params.owner ?? ''), repo: String(params.repo ?? ''), title: String(params.title ?? ''),
        head: String(params.head ?? ''), base: String(params.base ?? ''), body: params.body === undefined ? undefined : String(params.body),
      });
    default:
      throw new ConnectorActionError(`Unknown GitHub MCP tool: ${name}`, 'invalid_params');
  }
}

function mapGmailAction(name: string): 'create_draft' | 'send_draft' | 'search' {
  if (name === 'send_draft') return 'send_draft';
  if (name === 'create_draft') return 'create_draft';
  return 'search';
}

function mapLinearAction(name: string): 'create_issue' | 'get_issue' | 'update_issue' | 'archive_issue' | 'list_issues' {
  switch (name) {
    case 'create_issue': return 'create_issue';
    case 'get_issue': return 'get_issue';
    case 'update_issue': return 'update_issue';
    case 'archive_issue': return 'archive_issue';
    default: return 'list_issues';
  }
}