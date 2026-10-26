import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ErroAutenticacao, ErroBloqueio, ErroNaoEncontrado, ErroValidacao } from '../dominio/erros';
import { ValidadorSenha } from '../dominio/validadores';
import { UnidadeDeTrabalho } from '../repositorios/repositorios';
import { usuarioDTO } from './apresentacao';
import { Ator, Relogio } from './comum';

export const MAX_FALHAS_LOGIN = 5;
export const BLOQUEIO_LOGIN_MS = 5 * 60 * 1000;


export class AutenticacaoServico {
  private readonly vSenha = new ValidadorSenha();
  private hashFicticio?: Promise<string>;

  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly custoBcrypt: number,
    private readonly relogio: Relogio = () => new Date(),
  ) {}

  gerarHash(senha: string): Promise<string> { return bcrypt.hash(senha, this.custoBcrypt); }

  validarNovaSenha(senha: string, usuario: string): void { this.vSenha.exigir({ senha, usuario }); }

  private compararFicticio(senha: string): Promise<boolean> {
    this.hashFicticio ??= bcrypt.hash(randomBytes(16).toString('hex'), this.custoBcrypt);
    return this.hashFicticio.then((h) => bcrypt.compare(senha, h)).then(() => false);
  }

  async login(nomeInformado: string, senha: string): Promise<Ator> {
    const nome = nomeInformado.trim().toLowerCase();
    const r = this.uow.leitura;
    const u = await r.usuarios.buscarPorNome(nome);
    const agora = this.relogio();

    if (u?.bloqueadoAte && u.bloqueadoAte > agora) {
      const min = Math.ceil((u.bloqueadoAte.getTime() - agora.getTime()) / 60_000);
      throw new ErroBloqueio(`Conta temporariamente bloqueada. Tente novamente em ${min} min.`);
    }

    const ok = u ? await bcrypt.compare(senha, u.senhaHash) : await this.compararFicticio(senha);
    if (!u) throw new ErroAutenticacao();

    if (!ok || !u.ativo) {
      const bloquear = u.falhasLogin + 1 >= MAX_FALHAS_LOGIN;
      await this.uow.executar(async (tx) => {
        await tx.usuarios.registrarFalha(u.id, bloquear ? new Date(agora.getTime() + BLOQUEIO_LOGIN_MS) : null);
        await tx.auditoria.registrar(nome, bloquear ? 'LOGIN_BLOQUEADO' : 'LOGIN_FALHA',
          bloquear ? `Conta bloqueada por ${BLOQUEIO_LOGIN_MS / 60_000} min após ${MAX_FALHAS_LOGIN} falhas` : 'Credenciais inválidas');
      });
      throw new ErroAutenticacao(); 
    }

    await this.uow.executar(async (tx) => {
      if (u.falhasLogin > 0 || u.bloqueadoAte) await tx.usuarios.limparFalhas(u.id);
      await tx.auditoria.registrar(nome, 'LOGIN', 'Login efetuado');
    });
    return { nome: u.nome, papel: u.papel };
  }

  async alterarPropriaSenha(ator: Ator, atual: string, nova: string) {
    const u = await this.uow.leitura.usuarios.buscarPorNome(ator.nome);
    if (!u) throw new ErroNaoEncontrado('Usuário não encontrado.');
    if (!(await bcrypt.compare(atual, u.senhaHash))) throw new ErroValidacao('Senha atual incorreta.');
    this.validarNovaSenha(nova, u.nome);
    const senhaHash = await this.gerarHash(nova);
    const salvo = await this.uow.executar(async (tx) => {
      const r = await tx.usuarios.atualizar(u.id, u.versao, { senhaHash });
      await tx.auditoria.registrar(ator.nome, 'SENHA_ALTERAR', 'Senha alterada pelo próprio usuário');
      return r;
    });
    return usuarioDTO(salvo);
  }

  async perfil(ator: Ator) {
    const u = await this.uow.leitura.usuarios.buscarPorNome(ator.nome);
    if (!u) throw new ErroNaoEncontrado('Usuário não encontrado.');
    return usuarioDTO(u);
  }
}
