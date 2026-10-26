import { existsSync } from 'fs';
import path from 'path';

// Configuração por variável de ambiente. O .env é opcional (em produção as variáveis vêm do sistema);
// process.loadEnvFile é nativo do Node >= 22, então não precisa de dotenv.

export interface Ambiente {
  producao: boolean;
  porta: number;
  host: string;
  databaseUrl: string;
  jwtSegredo: string;
  jwtExpiraEm: string;
  bcryptCusto: number;
  logLevel: string;
  tempoDesligamentoMs: number;
}

export function carregarArquivoEnv(arquivo = path.resolve(process.cwd(), '.env')): void {
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}

function inteiro(nome: string, padrao: number, min: number, max: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome} inválido: "${bruto}" (esperado inteiro entre ${min} e ${max}).`);
  return n;
}

export function lerAmbiente(): Ambiente {
  const producao = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL não definida (veja .env.example).');
  const jwtSegredo = process.env.JWT_SECRET ?? '';
  // HS256 com segredo curto é quebrável por força bruta offline
  if (jwtSegredo.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
  if (producao && /troque|desenvolvimento/i.test(jwtSegredo)) throw new Error('JWT_SECRET de desenvolvimento não pode ser usado em produção.');
  return {
    producao,
    porta: inteiro('PORT', 3000, 1, 65535),
    host: process.env.HOST || '0.0.0.0',
    databaseUrl,
    jwtSegredo,
    jwtExpiraEm: process.env.JWT_EXPIRA_EM || '30m',
    bcryptCusto: inteiro('BCRYPT_CUSTO', 12, 4, 15),
    logLevel: process.env.LOG_LEVEL || 'info',
    tempoDesligamentoMs: inteiro('TEMPO_DESLIGAMENTO_MS', 10_000, 1_000, 120_000),
  };
}
