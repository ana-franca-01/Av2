import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Fastify, { FastifyInstance } from 'fastify';
import { Ambiente } from './config/ambiente';
import {
  AutenticacaoController, EquipamentoController, LoteController, OrganizacaoController,
  ParametroController, RelatorioController, UsuarioController,
} from './controllers/controllers';
import { registrarAutenticacao } from './plugins/autenticacao';
import { registrarTratamentoErros } from './plugins/erros';
import { UnidadeDeTrabalho } from './repositorios/repositorios';
import { registrarRotas } from './rotas/rotas';
import { AutenticacaoServico } from './servicos/autenticacao.servico';
import { Relogio } from './servicos/comum';
import { EquipamentoServico } from './servicos/equipamento.servico';
import { LoteServico } from './servicos/lote.servico';
import { OrganizacaoServico } from './servicos/organizacao.servico';
import { ParametroServico } from './servicos/parametro.servico';
import { RelatorioServico } from './servicos/relatorio.servico';
import { UsuarioServico } from './servicos/usuario.servico';

const VERSAO = '2.0.0';

export interface OpcoesApp {
  ambiente: Ambiente;
  prisma?: PrismaClient;
  relogio?: Relogio;
  logger?: boolean;
}

export async function construirApp(opts: OpcoesApp): Promise<FastifyInstance> {
  const { ambiente } = opts;
  const relogio = opts.relogio ?? (() => new Date());
  const prisma = opts.prisma ?? new PrismaClient({ datasourceUrl: ambiente.databaseUrl });

  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: ambiente.logLevel,
      redact: ['req.headers.authorization', 'req.body.senha', 'req.body.senhaAtual', 'req.body.novaSenha'],
    },
    bodyLimit: 2 * 1024 * 1024,
    forceCloseConnections: 'idle',
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array', useDefaults: true, allErrors: false } },
  });

  const uow = new UnidadeDeTrabalho(prisma);
  const auth = new AutenticacaoServico(uow, ambiente.bcryptCusto, relogio);
  const params = new ParametroServico(uow);
  const equipamentos = new EquipamentoServico(uow, params, relogio);
  const servicos = {
    usuarios: new UsuarioServico(uow, auth),
    organizacoes: new OrganizacaoServico(uow),
    lotes: new LoteServico(uow, equipamentos, relogio),
    relatorios: new RelatorioServico(uow, params, relogio),
  };

  registrarTratamentoErros(app);

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'greencode API', version: VERSAO, description: 'Logística reversa de eletrônicos — AV2 (monólito Fastify + Prisma).' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
  });
  app.addHook('onRoute', (r) => {
    if (r.url.startsWith('/docs')) r.config = { ...(r.config ?? {}), publica: true };
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list' } });

  registrarAutenticacao(app, { segredo: ambiente.jwtSegredo, expiraEm: ambiente.jwtExpiraEm, repos: uow.leitura });

  app.get('/health', { config: { publica: true }, schema: { tags: ['Sistema'], summary: 'Saúde do servidor e do banco' } }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', versao: VERSAO, banco: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'degradado', versao: VERSAO, banco: 'indisponível' });
    }
  });

  registrarRotas(app, {
    auth: new AutenticacaoController(auth),
    usuarios: new UsuarioController(servicos.usuarios),
    parametros: new ParametroController(params),
    organizacoes: new OrganizacaoController(servicos.organizacoes),
    lotes: new LoteController(servicos.lotes, equipamentos),
    equipamentos: new EquipamentoController(equipamentos),
    relatorios: new RelatorioController(servicos.relatorios),
  });

  
  if (!opts.prisma) app.addHook('onClose', async () => { await prisma.$disconnect(); });

  return app;
}
