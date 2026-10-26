#!/usr/bin/env node
import { construirApp } from './app';
import { carregarArquivoEnv, lerAmbiente } from './config/ambiente';

// Ponto de entrada: sobe o servidor na porta do ambiente e cuida do graceful shutdown.
async function principal(): Promise<void> {
  carregarArquivoEnv();
  const ambiente = lerAmbiente();
  const app = await construirApp({ ambiente });

  let desligando = false;
  const desligar = async (sinal: string) => {
    if (desligando) return;
    desligando = true;
    app.log.info({ sinal }, 'desligando: parando de aceitar conexões e aguardando requisições em andamento');
   
    const forcar = setTimeout(() => {
      app.log.error('tempo de desligamento esgotado, encerrando à força');
      process.exit(1);
    }, ambiente.tempoDesligamentoMs);
    forcar.unref();
    try {
      await app.close(); 
      app.log.info('desligado');
      process.exit(0);
    } catch (e) {
      app.log.error({ err: e }, 'erro ao desligar');
      process.exit(1);
    }
  };

  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sinal, () => void desligar(sinal));
  process.on('unhandledRejection', (e) => { app.log.error({ err: e }, 'promise rejeitada sem tratamento'); void desligar('unhandledRejection'); });

  await app.listen({ port: ambiente.porta, host: ambiente.host });
  app.log.info(`documentação em http://localhost:${ambiente.porta}/docs`);
}

principal().catch((e) => {
  console.error(`[CRITICO] falha ao iniciar: ${(e as Error).message}`);
  process.exit(1);
});
