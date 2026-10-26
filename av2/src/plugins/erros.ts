import { Prisma } from '@prisma/client';
import { FastifyError, FastifyInstance } from 'fastify';
import { ErroGreencode } from '../dominio/erros';


interface Resposta { status: number; erro: string; mensagem: string; detalhes?: unknown }

function traduzirPrisma(e: unknown): Resposta | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': return { status: 409, erro: 'GC-CONF', mensagem: 'Registro duplicado: viola restrição de unicidade.', detalhes: { campos: e.meta?.target } };
      case 'P2025': return { status: 404, erro: 'GC-404', mensagem: 'Registro não encontrado.' };
      case 'P2003': return { status: 409, erro: 'GC-CONF', mensagem: 'Operação viola integridade referencial.' };
      case 'P2034': return { status: 409, erro: 'GC-VERSAO', mensagem: 'Conflito de concorrência na transação. Tente novamente.' };
    }
  }
  const msg = e instanceof Error ? e.message : '';
  if (/GC-TRANSICAO|GC-IMUTAVEL|check constraint|violates check/i.test(msg)) {
    const m = /GC-[A-Z]+: ([^\n"]+)/.exec(msg);
    return { status: 422, erro: 'GC-INTEGRIDADE', mensagem: m ? m[1].trim() : 'Operação rejeitada por regra de integridade do banco.' };
  }
  return null;
}

export function registrarTratamentoErros(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    let r: Resposta;
    if (err instanceof ErroGreencode) {
      r = { status: err.statusHttp, erro: err.codigo, mensagem: err.message, detalhes: err.detalhes };
    } else if ((err as FastifyError).validation) {
      r = { status: 400, erro: 'GC-VAL', mensagem: `Requisição inválida: ${err.message}`, detalhes: (err as FastifyError).validation };
    } else if ((err as FastifyError).code?.startsWith('FST_JWT')) {
      r = { status: 401, erro: 'GC-AUTH', mensagem: 'Token ausente, inválido ou expirado. Faça login novamente.' };
    } else {
      const p = traduzirPrisma(err);
      const sc = (err as FastifyError).statusCode;
      if (p) r = p;
      else if (sc && sc >= 400 && sc < 500) r = { status: sc, erro: 'GC-REQ', mensagem: err.message };
      else r = { status: 500, erro: 'GC-SYS', mensagem: 'Erro interno. A operação não foi concluída.' };
    }
    if (r.status >= 500) req.log.error({ err }, 'erro não tratado');
    else req.log.info({ codigo: r.erro, status: r.status }, r.mensagem);
    reply.status(r.status).send({ erro: r.erro, mensagem: r.mensagem, ...(r.detalhes !== undefined ? { detalhes: r.detalhes } : {}) });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ erro: 'GC-404', mensagem: `Rota ${req.method} ${req.url} não existe.` });
  });
}
