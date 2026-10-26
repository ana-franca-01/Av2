import { ErroConflito, ErroNaoEncontrado, ErroNegocio, ErroValidacao } from '../dominio/erros';
import { PAPEIS, Papel, normalizarEnum } from '../dominio/tipos';
import { UnidadeDeTrabalho } from '../repositorios/repositorios';
import { usuarioDTO } from './apresentacao';
import { AutenticacaoServico } from './autenticacao.servico';
import { Ator, conferirVersao } from './comum';

const ALIAS_PAPEL: Record<string, Papel> = {
  ADMINISTRADOR: 'ADMIN', OPERADOR_CADASTRO: 'CADASTRO', GESTOR_ALMOXARIFADO: 'ALMOXARIFADO',
};

export class UsuarioServico {
  constructor(private readonly uow: UnidadeDeTrabalho, private readonly auth: AutenticacaoServico) {}

  async listar() { return (await this.uow.leitura.usuarios.listar()).map(usuarioDTO); }

  async criar(ator: Ator, d: { nome: string; papel: string; senha: string }) {
    const nome = d.nome.trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]{2,31}$/.test(nome)) {
      throw new ErroValidacao('Nome de usuário: 3-32 caracteres (minúsculas, dígitos, . _ -), iniciando por letra.');
    }
    const bruto = d.papel.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const papel = normalizarEnum(ALIAS_PAPEL[bruto] ?? bruto, PAPEIS, 'Papel');
    this.auth.validarNovaSenha(d.senha, nome);
    const senhaHash = await this.auth.gerarHash(d.senha);
    return this.uow.executar(async (r) => {
      if (await r.usuarios.buscarPorNome(nome)) throw new ErroConflito(`Usuário "${nome}" já existe.`);
      const u = await r.usuarios.criar({ nome, papel, senhaHash });
      await r.auditoria.registrar(ator.nome, 'USUARIO_CRIAR', `Usuário ${nome} (${papel}) criado`);
      return usuarioDTO(u);
    });
  }

  async alterarAtivo(ator: Ator, nomeAlvo: string, ativo: boolean, versao?: number) {
    return this.uow.executar(async (r) => {
      const u = await r.usuarios.buscarPorNome(nomeAlvo.trim().toLowerCase());
      if (!u) throw new ErroNaoEncontrado('Usuário não encontrado.');
      conferirVersao(versao, u.versao, 'Usuário');
      if (!ativo) {
        if (u.nome === ator.nome) throw new ErroNegocio('Você não pode desativar a própria conta.');
        if (u.papel === 'ADMIN' && u.ativo && (await r.usuarios.contarAdminsAtivos()) <= 1) {
          throw new ErroNegocio('Não é possível desativar o último administrador ativo.');
        }
      }
      const salvo = await r.usuarios.atualizar(u.id, u.versao, { ativo });
      await r.auditoria.registrar(ator.nome, ativo ? 'USUARIO_REATIVAR' : 'USUARIO_DESATIVAR', `Usuário ${u.nome} ${ativo ? 'reativado' : 'desativado'}`);
      return usuarioDTO(salvo);
    });
  }

  async redefinirSenha(ator: Ator, nomeAlvo: string, senha: string) {
    const nome = nomeAlvo.trim().toLowerCase();
    this.auth.validarNovaSenha(senha, nome);
    const senhaHash = await this.auth.gerarHash(senha);
    return this.uow.executar(async (r) => {
      const u = await r.usuarios.buscarPorNome(nome);
      if (!u) throw new ErroNaoEncontrado('Usuário não encontrado.');
      const salvo = await r.usuarios.atualizar(u.id, u.versao, { senhaHash, falhasLogin: 0, bloqueadoAte: null });
      await r.auditoria.registrar(ator.nome, 'USUARIO_REDEFINIR', `Senha de ${u.nome} redefinida`);
      return usuarioDTO(salvo);
    });
  }
}
