# greencode — Documentação da Atividade 2

Evolução do greencode (AV1) de uma CLI com arquivos cifrados para um **servidor monolítico HTTP**:
Node.js + TypeScript + **Fastify** + **Prisma ORM** + **PostgreSQL**, autenticação **JWT** e senhas com **bcrypt**.

## 1. Execução

Pré-requisitos: Node.js ≥ 22 e Docker (Docker Desktop no Windows 10+; Docker Engine no Ubuntu 24.04+ e derivados).
Também funciona com um PostgreSQL instalado direto: é só ajustar a `DATABASE_URL`.

```bash
cp .env.example .env        # no Windows (cmd): copy .env.example .env
npm install
npm run db:up               # sobe o PostgreSQL 16 (docker compose), porta 5433
npm run db:migrate          # aplica as migrações versionadas
npm run db:seed             # massa de dados de desenvolvimento
npm run build
npm start                   # http://localhost:3000  — documentação em /docs
```

| Script | O que faz |
|---|---|
| `npm run dev` | servidor com recarga automática (tsx watch) |
| `npm test` | testes unitários do domínio (sem banco) |
| `npm run test:e2e` | recria o schema `teste` e roda a jornada completa da API contra o PostgreSQL |
| `npm run db:migrate:dev` | cria uma nova migração a partir de mudanças no `schema.prisma` |
| `npm run db:reset` | apaga e recria o banco de desenvolvimento (pede confirmação) |

Variáveis de ambiente (`.env.example`): `DATABASE_URL`, `DATABASE_URL_TESTE`, `PORT`, `HOST`, `JWT_SECRET` (mínimo 32
caracteres; em produção o servidor recusa o segredo de exemplo), `JWT_EXPIRA_EM` (padrão `30m`), `BCRYPT_CUSTO`
(padrão 12), `LOG_LEVEL`, `TEMPO_DESLIGAMENTO_MS`.

Usuários criados pelo seed: `admin` (senha em `SEED_SENHA_ADMIN`) e `cadastro`, `almox`, `auditor` (senha em `SEED_SENHA_PADRAO`).
São só para desenvolvimento.

## 2. Arquitetura em camadas (Controller → Service → Repository)

```
src/
├── server.ts            porta configurável, graceful shutdown (SIGINT/SIGTERM/SIGBREAK)
├── app.ts               composição: Prisma → repositórios → serviços → controllers → rotas
├── config/ambiente.ts   leitura e validação das variáveis de ambiente
├── rotas/               tabela de rotas + JSON Schemas (validação e OpenAPI)
├── controllers/         HTTP ↔ serviço: params/body/query, ator do JWT, status HTTP
├── servicos/            regra de negócio: validações, máquina de estados, cálculos, transações
├── repositorios/        Prisma Client (única camada que conhece o banco) + Unidade de Trabalho
├── dominio/             modelo OO da AV1: papéis, equipamentos, validadores, erros, datas
└── plugins/             JWT + autorização por papel; tratamento global de erros
prisma/
├── schema.prisma        modelos e relacionamentos
├── migrations/          SQL versionado (inclui CHECKs e triggers)
└── seed.ts              massa de dados (passa pelos serviços)
```

- **Controllers** não têm regra: pegam a requisição já validada pelo JSON Schema, extraem o ator do token e chamam o serviço.
- **Serviços** concentram tudo que é negócio. Não sabem que existe HTTP: o mesmo serviço é usado pelo seed e serviria
  a uma CLI ou a um consumidor de mensageria.
- **Repositórios** encapsulam o Prisma. A `UnidadeDeTrabalho` entrega um conjunto de repositórios amarrado a uma
  transação (`prisma.$transaction`), e o serviço só diz *o que* é atômico.
- **Domínio** é o mesmo modelo orientado a objetos da AV1, sem dependência de framework:
  `PapelUsuario` (4 subclasses), `Equipamento` (6 subclasses) + `FabricaEquipamento`, `Validador<T>` e suas especializações.
  A depreciação agora é usada de verdade: o detalhe do equipamento e o relatório calculam o valor residual de forma
  polimórfica, com o coeficiente vindo dos parâmetros globais.

## 3. Modelo relacional

| Modelo | Relacionamentos e restrições principais |
|---|---|
| `Organizacao` | 1—0..1 `Contrato`, 1—N `Lote`; `cnpj` **UNIQUE** + CHECK de formato; código `BR001` por sequência |
| `Contrato` | `organizacao_id` **UNIQUE** (garante o "contrato opcional"); `clausulas` em **JSONB**; CHECK `fim >= inicio`, prazo 1..3650 |
| `Lote` | N—1 `Organizacao`, 1—N `Equipamento`; **UNIQUE (organizacao_id, nota_fiscal)**; CHECK NF numérica |
| `Equipamento` | N—1 `Lote`, 1—N `Movimentacao`; `codigo_barras_interno` **UNIQUE** + CHECK `GC\d{9}`; `serie` UNIQUE |
| `Movimentacao` | N—1 `Equipamento`; id sequencial (a ordem do histórico); **imutável por trigger** |
| `Usuario`, `Parametro`, `Auditoria` | contas e papéis; alíquotas/depreciação; trilha de auditoria (imutável) |

Todas as FKs usam `ON DELETE RESTRICT`: nada some em cascata. Todo modelo mutável tem a coluna `versao`.

**Integridade no banco (migração `regras_integridade`)**, a última barreira se algo escapar da camada de serviço:
- CHECK `ck_equipamentos_triagem`: equipamento que passou da triagem precisa ter classe, responsável e data de triagem.
  É a regra "só vai para desmonte após triagem completa" garantida pelo próprio PostgreSQL.
- Trigger `trg_equipamento_transicao`: replica a máquina de estados (`RECEBIDO → EM_TRIAGEM → TRIADO → EM_DESMONTE →
  RECICLADO | REUTILIZADO | DESCARTADO`) e bloqueia mudança em status final, mesmo por SQL manual.
- Triggers `trg_movimentacoes_imutavel` / `trg_auditoria_imutavel`: bloqueiam UPDATE/DELETE. Fazem o papel do
  journal encadeado da AV1.
- Sequências `seq_*_codigo` geram os códigos legíveis sem corrida (a AV1 fazia "max + 1" em memória).

## 4. API

Documentação interativa (OpenAPI 3 / Swagger UI) em **`/docs`**; JSON em `/docs/json`.

| Método e rota | Permissão | Descrição |
|---|---|---|
| `POST /auth/login` | pública | usuário + senha → `{ token }` (JWT) |
| `GET /auth/me` · `PUT /auth/senha` | autenticado | perfil; troca da própria senha |
| `GET/POST /usuarios` · `PATCH /usuarios/:nome/ativo` · `PUT /usuarios/:nome/senha` | `usuario:gerir` | gestão de contas |
| `GET /parametros` · `PUT /parametros/:chave` | `param:ler` / `param:gerir` | alíquotas e depreciação |
| `GET/POST /organizacoes` · `GET/PATCH /organizacoes/:codigo` | `org:ler` / `org:escrever` | cadastro |
| `PUT /organizacoes/:codigo/contrato` | `org:escrever` | cria ou substitui o contrato (com cláusulas) |
| `GET/POST /lotes` · `GET /lotes/:codigo` | `lote:ler` / `lote:escrever` | lote, opcionalmente com `equipamentos[]` |
| `POST /lotes/:codigo/equipamentos` · `POST /equipamentos` | `equip:escrever` | registro de equipamento |
| `GET /equipamentos` (filtros) · `GET /equipamentos/:codigo` · `GET /equipamentos/barras/:barras` | `equip:ler` | consulta + avaliação financeira |
| `POST /equipamentos/:codigo/status` · `/triagem` · `/estado` | `equip:escrever` | ciclo de vida |
| `GET /equipamentos/:codigo/movimentacoes` | `equip:ler` | rastreabilidade |
| `GET /relatorios/resumo` · `GET /relatorios/auditoria` | `relatorio:ler` / `auditoria:ler` | relatórios |
| `GET /health` | pública | servidor + banco |

Listagens são paginadas (`?pagina=1&tamanho=20`, máx. 100) e devolvem `{ itens, total, pagina, tamanho }`.

**Erros** têm sempre o formato `{ "erro": "<código>", "mensagem": "...", "detalhes"?: ... }`:

| HTTP | Código | Quando |
|---|---|---|
| 400 | `GC-VAL` | JSON Schema ou validação de domínio (CNPJ, datas, senha fraca, justificativa ausente…) |
| 401 | `GC-AUTH` | credenciais inválidas (mensagem genérica) ou token ausente/expirado |
| 403 | `GC-PERM` | papel sem a permissão da rota (a tentativa é auditada como `ACESSO_NEGADO`) |
| 404 | `GC-404` | recurso ou rota inexistente |
| 409 | `GC-CONF` / `GC-VERSAO` | unicidade violada / versão desatualizada (concorrência otimista) |
| 422 | `GC-NEG` / `GC-INTEGRIDADE` | regra de negócio (sem contrato vigente, status final…) / barreira do banco |
| 429 | `GC-BLOQ` | conta bloqueada por 5 falhas de login seguidas (5 minutos) |
| 500 | `GC-SYS` | erro inesperado: detalhe só no log, nunca na resposta |

## 5. Autenticação e autorização

- `POST /auth/login` confere o hash **bcrypt** (custo 12, configurável) e assina um **JWT HS256** com `sub` (usuário),
  `papel`, `iss` e expiração de **30 min**, o mesmo tempo de sessão da AV1.
- Um hook global `onRequest` valida o token em toda rota não pública e injeta `req.user`. Cada rota declara a permissão
  em `config.permissao`, e o hook pergunta a `PapelUsuario.porNome(papel).pode(permissao)`: é o mesmo polimorfismo
  que montava o menu da CLI.
- Proteções que vieram da AV1: mensagem de erro genérica, custo de bcrypt pago mesmo para usuário inexistente
  (evita descobrir nomes pelo tempo de resposta), bloqueio após 5 falhas. O contador agora fica **no banco**, para
  valer entre requisições e instâncias.
- Senhas: mínimo de 10 caracteres com maiúscula, minúscula, dígito e símbolo, sem conter o nome de usuário e com no
  máximo 72 bytes (o bcrypt ignora o que passa disso). Os logs mascaram `authorization` e campos de senha.

**Biblioteca bcrypt:** usei `bcryptjs` (implementação em JS puro, mesmo algoritmo e formato `$2b$`), não o pacote
nativo `bcrypt`. O nativo precisa compilar C++ (node-gyp, Python, Build Tools) ou baixar binário pré-compilado, o que
costuma quebrar a instalação no Windows. O custo é ser um pouco mais lento por hash, o que não pesa num endpoint de login.

## 6. Transações e concorrência

**Operações transacionais** (tudo ou nada, via `UnidadeDeTrabalho.executar` → `prisma.$transaction`):

| Operação | O que fica atômico |
|---|---|
| Criar lote com equipamentos | lote + N equipamentos + N movimentações + auditoria. Se o item 37 falha, nada fica, e a resposta diz qual item quebrou |
| Mudar status / triar / mudar estado | update do equipamento (com versão) + movimentação + auditoria |
| Criar organização, contrato, usuário, parâmetro | escrita + auditoria |
| Login falho | contador/bloqueio + auditoria |

**Versionamento otimista:** toda escrita é `UPDATE ... WHERE id = ? AND versao = ?` com `versao = versao + 1`. Se
nenhuma linha casar, outra requisição gravou antes e a resposta é **409 `GC-VERSAO`**. O cliente pode mandar `versao`
no corpo (a que ele leu); sem ela, a checagem continua valendo contra a versão lida dentro da transação. O teste e2e
dispara 3 requisições simultâneas sobre a mesma versão: só uma grava, as outras recebem 409 e nenhuma movimentação
sai duplicada.

O isolamento usado é `READ COMMITTED` (padrão do PostgreSQL). Com versão otimista + UNIQUE + triggers, não precisei de
`SERIALIZABLE`, que obrigaria a repetir transações abortadas por conflito de serialização.

## 7. Migração dos dados da CLI

Não migrei os arquivos `.dat` da AV1: são dados de teste cifrados com uma chave local, e sem `master.json` nem dá
para abri-los. No lugar, o `prisma/seed.ts` cria uma massa representativa: 4 usuários (um por papel), 4 organizações
(três com contrato e uma sem, inclusive um **CNPJ alfanumérico**), 3 lotes com datas relativas a hoje (dentro da janela
de 90 dias) e 7 equipamentos espalhados por `RECEBIDO`, `EM_TRIAGEM`, `TRIADO`, `REUTILIZADO`, `RECICLADO` e
`DESCARTADO`, com triagem que exige justificativa.

O seed **chama os serviços** em vez de inserir direto. Assim ele também prova que as regras da AV1 foram
transportadas: se alguma regra estiver quebrada, o seed falha. Ele não roda duas vezes num banco que já tem usuários.

## 8. Compatibilidade (Windows 10+, Ubuntu 24.04+ e derivados)

- Node ≥ 22 nas três plataformas. Nenhuma dependência nativa para compilar (`bcryptjs`; o Prisma baixa o engine pronto).
- `binaryTargets = ["native", "windows", "debian-openssl-3.0.x"]`: o client gerado já inclui o engine do Windows e
  do Ubuntu 24.04 (OpenSSL 3), então dá para empacotar numa máquina e distribuir para a outra.
- Scripts npm sem comando de shell específico (nada de `rm -rf` ou `VAR=x cmd`); o preparo do banco de teste chama o
  CLI do Prisma via `process.execPath` em vez de `npx`.
- `.env` lido com `process.loadEnvFile` (nativo), sem dotenv.
- Graceful shutdown: `SIGINT` (Ctrl+C nos dois sistemas), `SIGTERM` (systemd/Docker) e `SIGBREAK` (Ctrl+Break no
  Windows). O servidor para de aceitar conexões, espera as requisições em andamento, fecha o Prisma e encerra. Se
  passar de `TEMPO_DESLIGAMENTO_MS` (10 s), encerra à força.

## 9. Decisões, trade-offs e alternativas rejeitadas

| Decisão | Por quê | Alternativa rejeitada |
|---|---|---|
| **Fastify** | validação nativa por JSON Schema (o mesmo schema vira OpenAPI), hooks para auth, erros estruturados, melhor desempenho | Express: validação e docs exigiriam bibliotecas extras (joi/zod + swagger-jsdoc) |
| **Monólito em camadas** | um deploy, depuração simples, transações locais ACID entre organização/lote/equipamento | Microsserviços: transações distribuídas (saga) sem necessidade nesse estágio |
| **Prisma 6** | schema declarativo, client tipado, migrações versionadas | Prisma 7: muda a configuração (driver adapters, `prisma.config.ts`) e ainda é recente; TypeORM/Knex: menos segurança de tipos |
| **PostgreSQL** | ACID, JSONB (cláusulas), triggers/CHECK, sequências, UUID | MySQL: CHECK e JSON menos maduros para esse uso |
| **JWT stateless, 30 min** | escala horizontal sem sessão compartilhada | Sessão no servidor (Redis): mais infraestrutura. **Trade-off:** desativar um usuário não derruba um token já emitido; ele vale até expirar (no máximo 30 min). Uma lista de revogação ou refresh tokens curtos resolveriam numa próxima etapa |
| **Versão otimista** | sem lock longo, conflito raro nesse domínio | Lock pessimista (`SELECT FOR UPDATE`): serializa tudo e arrisca deadlock |
| **Auditoria em tabela imutável** | fica na mesma transação da operação, consultável por SQL | Journal encadeado por hash da AV1: o banco já dá durabilidade (WAL do PostgreSQL); a imutabilidade agora vem de trigger. Perde-se a prova criptográfica contra quem tem acesso de superusuário ao banco |
| **Códigos legíveis + UUID** | `BR001`/`EQ-000001` para pessoas, UUID como chave interna | Expor só o UUID: ruim para operação de almoxarifado |
| **Composição manual de dependências** | dependências visíveis em `app.ts`, sem "mágica" | Container de DI (tsyringe/awilix): exagero para este tamanho |

**Limites do monólito.** O ponto de pressão mais provável é o processamento de lotes grandes, que trava uma conexão
durante a transação (por isso o limite de 500 equipamentos por requisição) e disputa recursos com as consultas. Se o
volume crescer, o caminho natural é extrair a ingestão de lotes para um worker com fila, mantendo o resto do monólito.
As camadas já isolam isso: `LoteServico` não depende de HTTP.

## 10. Cenários testados

`npm test` cobre o domínio (CNPJ numérico e alfanumérico, janela de 90 dias, máquina de estados, justificativa, senha,
papéis, depreciação, código de barras). `npm run test:e2e` roda contra PostgreSQL real:

| Cenário | Resposta do sistema |
|---|---|
| Sem token / token adulterado | 401 |
| Papel sem permissão | 403 + `ACESSO_NEGADO` na auditoria |
| 5 senhas erradas | mensagem genérica, depois 429 mesmo com a senha certa; admin redefine e destrava |
| Desativar o último admin | 422 |
| CNPJ com DV errado / duplicado | 400 / 409 |
| Lote sem contrato vigente; data futura ou > 90 dias | 422; 400 |
| Lote com equipamento inválido no meio | 409 indicando o item; **nenhum** registro persistido (rollback) |
| NF repetida na mesma organização | 409 (UNIQUE composto) |
| Pular etapa / triar fora de `EM_TRIAGEM` / queda de 2+ sem justificativa | 400 / 422 / 400 |
| Alterar equipamento em status final | 422 |
| Versão desatualizada | 409 `GC-VERSAO` |
| 3 requisições simultâneas na mesma versão | 1 grava, as outras 409, histórico sem duplicata |
| `UPDATE`/`DELETE` direto em movimentações/auditoria | recusado pelo trigger |
| Pular status ou "triar" sem dados por SQL direto | recusado por trigger / CHECK |
| Corpo fora do JSON Schema | 400 `GC-VAL` |
