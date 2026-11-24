import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { Router } from 'express';
import { z } from 'zod';
import { defaultProfile } from '../shared/model.js';
import type { Service } from './service.js';

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function createMcpServer(service: Service) {
  const server = new McpServer(
    { name: 'infotransport', version: '1.0.0' },
    {
      instructions:
        'InfoTransport expose en lecture seule les transports suivis par ce site. ' +
        'Les blocs sont regroupés en profils (list_profiles) ; get_dashboard et get_traffic lisent le profil par défaut sauf argument profile. ' +
        'Utiliser get_dashboard pour les prochains départs et get_traffic pour les perturbations. ' +
        'Toujours tenir compte de mode (demo = données fictives), now, paused, du status de chaque bloc ' +
        'et de trafficKnown (false = trafic inconnu, pas absence de perturbations). ' +
        'Les données proviennent du cache du site : aucune consultation MCP ne force de collecte PRIM ; ' +
        'le site ne les collecte que lorsqu’une de ses pages est affichée, elles peuvent donc être anciennes (status stale ou empty). ' +
        'La recherche du catalogue ne fournit pas de départs pour les arrêts non suivis.',
    },
  );
  const profileInput = z.object({
    profile: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Identifiant issu de list_profiles. Profil par défaut si absent.'),
  });
  const profileDashboard = (profile?: string) =>
    service.dashboard(new Date(), {
      profile: profile ?? defaultProfile(service.config).id,
    });
  server.registerTool(
    'list_profiles',
    {
      description:
        'Lister les profils de stations (identifiant, nom, position éventuelle) et le profil par défaut.',
      inputSchema: z.object({}),
      annotations,
    },
    async () =>
      result({
        defaultProfileId: defaultProfile(service.config).id,
        profiles: service.config.profiles.map(({ id, name, location, blocks }) => ({
          id,
          name,
          location,
          blocks: blocks.length,
        })),
      }),
  );
  server.registerTool(
    'get_dashboard',
    {
      description:
        'Lire les prochains départs, directions, voies, incidents et états des blocs d’un profil.',
      inputSchema: profileInput,
      annotations,
    },
    async ({ profile }) => result(profileDashboard(profile)),
  );
  server.registerTool(
    'get_traffic',
    {
      description:
        'Lire les perturbations des blocs d’un profil, avec le mode et la disponibilité du trafic.',
      inputSchema: profileInput,
      annotations,
    },
    async ({ profile }) => {
      const dashboard = profileDashboard(profile);
      return result({
        mode: dashboard.mode,
        now: dashboard.now,
        paused: dashboard.paused,
        blocks: dashboard.blocks.map(({ profileId, block, status, trafficKnown, incidents }) => ({
          profileId,
          block,
          status,
          trafficKnown,
          incidents,
        })),
      });
    },
  );
  server.registerTool(
    'search_stops',
    {
      description: 'Rechercher jusqu’à 20 arrêts par nom, commune ou code dans le catalogue local.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(100) }),
      annotations,
    },
    async ({ query }) => result({ stops: await service.search(query) }),
  );
  server.registerTool(
    'get_stop_lines',
    {
      description:
        'Lister les lignes d’un arrêt du catalogue, avec son monitoringRef issu de search_stops.',
      inputSchema: z.object({
        monitoringRef: z.string().regex(/^STIF:Stop(?:Area:SP|Point:Q):\d+:$/),
      }),
      annotations,
    },
    async ({ monitoringRef }) =>
      result({ monitoringRef, lines: service.catalog.lines(monitoringRef) }),
  );
  server.registerTool(
    'get_status',
    {
      description:
        'Lire le mode, les budgets PRIM, les dates de collecte et les erreurs du service.',
      inputSchema: z.object({}),
      annotations,
    },
    async () => result(service.diagnostics()),
  );
  for (const [name, read] of [
    ['dashboard', () => service.dashboard()],
    ['status', () => service.diagnostics()],
  ] as const) {
    server.registerResource(
      name,
      `infotransport://${name}`,
      {
        description: name === 'dashboard' ? 'Tableau de départs du site' : 'État du service',
        mimeType: 'application/json',
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(read()) }],
      }),
    );
  }
  return server;
}

export function createMcpRouter(service: Service) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const handler = toNodeHandler(
    createMcpHandler(() => createMcpServer(service), { responseMode: 'json' }),
  );
  router.post('/', async (req, res, next) => {
    try {
      await handler(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) next(error);
    }
  });
  router.all('/', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method not allowed. Use POST for stateless MCP.' },
    });
  });
  return router;
}
