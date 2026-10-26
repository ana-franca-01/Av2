import fastifyJwt from '@fastify/jwt';
import { FastifyInstance } from 'fastify';
import { Papel } from '@prisma/client';
import { ErroPermissao } from '../dominio/erros';
import { PapelUsuario, Permissao } from '../dominio/papeis';
import { Repositorios } from '../repositorios/repositorios';

declare module 'fastify' {
  interface FastifyContextConfig {
    publica?: boolean;
    permissao?: Permissao;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; papel: Papel };
    user: { sub: string; papel: Papel };
  }
}

export function registrarAutenticacao(app: FastifyInstance, opts: { segredo: string; expiraEm: string; repos: Repositorios }): void {
  app.register(fastifyJwt, {
    secret: opts.segredo,
    sign: { algorithm: 'HS256', expiresIn: opts.expiraEm, iss: 'greencode' },
    verify: { algorithms: ['HS256'], allowedIss: 'greencode' },
  });

  app.addHook('onRequest', async (req) => {
    const cfg = req.routeOptions.config;
    if (cfg.publica || !req.routeOptions.url) return; 
    await req.jwtVerify();
    if (cfg.permissao && !PapelUsuario.porNome(req.user.papel).pode(cfg.permissao)) {
      opts.repos.auditoria.registrar(req.user.sub, 'ACESSO_NEGADO', `${req.method} ${req.routeOptions.url} exige ${cfg.permissao}`)
        .catch((e) => req.log.warn({ err: e }, 'falha ao auditar acesso negado'));
      throw new ErroPermissao(`Seu papel (${req.user.papel}) não tem a permissão "${cfg.permissao}".`);
    }
  });
}
