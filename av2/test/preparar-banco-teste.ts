// Recria o schema de teste do zero e aplica as migrações. Só roda contra um schema com "test" no nome,
// pra nunca apagar o banco de desenvolvimento por engano.
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import { carregarArquivoEnv } from '../src/config/ambiente';

carregarArquivoEnv();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) throw new Error('DATABASE_URL_TESTE não definida (veja .env.example).');
  const schema = new URL(url).searchParams.get('schema') ?? 'public';
  if (!/test/i.test(schema) || !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Recusado: o schema de teste precisa conter "test" no nome (recebido "${schema}").`);
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }

  const cli = require.resolve('prisma/build/index.js');
  const r = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('prisma migrate deploy falhou no schema de teste.');
}

main().catch((e) => {
  console.error(`[ERRO] ${(e as Error).message}`);
  process.exit(1);
});
