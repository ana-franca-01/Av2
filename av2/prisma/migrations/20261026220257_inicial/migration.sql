-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'CADASTRO', 'ALMOXARIFADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "TipoOrganizacao" AS ENUM ('VAREJO', 'HOSPITAL', 'UNIVERSIDADE', 'BANCO', 'INDUSTRIA', 'GOVERNO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoEquipamento" AS ENUM ('COMPUTADOR', 'SERVIDOR', 'MONITOR', 'TELECOM', 'PERIFERICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('EXCELENTE', 'BOM', 'REGULAR', 'RUIM', 'SUCATA');

-- CreateEnum
CREATE TYPE "StatusEquipamento" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'TRIADO', 'EM_DESMONTE', 'REUTILIZADO', 'RECICLADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "ClasseTriagem" AS ENUM ('REUTILIZAVEL', 'RECICLAVEL', 'DESCARTE_SEGURO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('REGISTRO', 'STATUS', 'ESTADO', 'TRIAGEM');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(32) NOT NULL,
    "papel" "Papel" NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "falhas_login" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros" (
    "chave" VARCHAR(60) NOT NULL,
    "valor" DECIMAL(9,4) NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "atualizado_por" VARCHAR(32) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "parametros_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "cnpj" CHAR(14) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "tipo" "TipoOrganizacao" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" VARCHAR(32) NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "organizacao_id" UUID NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "prazo_armazenamento_dias" INTEGER NOT NULL,
    "descricao" VARCHAR(500) NOT NULL DEFAULT '',
    "clausulas" JSONB NOT NULL DEFAULT '[]',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "organizacao_id" UUID NOT NULL,
    "nota_fiscal" VARCHAR(9) NOT NULL,
    "transportadora" VARCHAR(60) NOT NULL,
    "data_entrada" DATE NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" VARCHAR(32) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "codigo_barras_interno" CHAR(11) NOT NULL,
    "lote_id" UUID NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "descricao" VARCHAR(120) NOT NULL,
    "serie" VARCHAR(40),
    "estado" "EstadoFisico" NOT NULL DEFAULT 'BOM',
    "status" "StatusEquipamento" NOT NULL DEFAULT 'RECEBIDO',
    "valor_aquisicao" DECIMAL(14,2),
    "ano_fabricacao" INTEGER,
    "triagem_classe" "ClasseTriagem",
    "triagem_responsavel" VARCHAR(32),
    "triagem_em" TIMESTAMPTZ(3),
    "triagem_observacao" VARCHAR(500),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" VARCHAR(32) NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" BIGSERIAL NOT NULL,
    "equipamento_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator" VARCHAR(32) NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "status_de" "StatusEquipamento",
    "status_para" "StatusEquipamento" NOT NULL,
    "estado_de" "EstadoFisico",
    "estado_para" "EstadoFisico" NOT NULL,
    "justificativa" VARCHAR(500),
    "observacao" VARCHAR(500),

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator" VARCHAR(32) NOT NULL,
    "operacao" VARCHAR(40) NOT NULL,
    "resumo" VARCHAR(500) NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nome_key" ON "usuarios"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_codigo_key" ON "organizacoes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_cnpj_key" ON "organizacoes"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_numero_key" ON "contratos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_organizacao_id_key" ON "contratos"("organizacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_codigo_key" ON "lotes"("codigo");

-- CreateIndex
CREATE INDEX "lotes_data_entrada_idx" ON "lotes"("data_entrada");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_organizacao_id_nota_fiscal_key" ON "lotes"("organizacao_id", "nota_fiscal");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigo_key" ON "equipamentos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigo_barras_interno_key" ON "equipamentos"("codigo_barras_interno");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_serie_key" ON "equipamentos"("serie");

-- CreateIndex
CREATE INDEX "equipamentos_lote_id_idx" ON "equipamentos"("lote_id");

-- CreateIndex
CREATE INDEX "equipamentos_status_idx" ON "equipamentos"("status");

-- CreateIndex
CREATE INDEX "movimentacoes_equipamento_id_ts_idx" ON "movimentacoes"("equipamento_id", "ts");

-- CreateIndex
CREATE INDEX "auditoria_ts_idx" ON "auditoria"("ts");

-- CreateIndex
CREATE INDEX "auditoria_ator_idx" ON "auditoria"("ator");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
