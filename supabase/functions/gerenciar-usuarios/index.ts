// ============================================================================
// gerenciar-usuarios — única porta de escrita privilegiada de contas.
// ----------------------------------------------------------------------------
// Criar usuário e redefinir senha de terceiro são operações da Admin API do
// Supabase: exigem a chave `service_role`, que nunca pode chegar ao
// navegador. Esta function é o intermediário — igual em espírito a
// enviar-pedido (../enviar-pedido/index.ts), mas ao contrário dela é
// AUTENTICADA (verify_jwt = true em supabase/config.toml): só usuário logado
// chega até aqui, e mesmo assim o código confere de novo, com o JWT do
// chamador, QUE PAPEL ele tem — antes de tocar em qualquer chave de serviço.
//
// O portão é por ação (ver "2 · O portão, POR AÇÃO" abaixo):
//
//   listar, criar_usuario, redefinir_senha, atualizar_confrade → is_admin()
//   atualizar_meu_email                                        → is_membro_area()
//
// A última é a única que um confrade comum alcança, e ela age sobre o usuário
// do PRÓPRIO JWT — nunca sobre um `user_id` vindo do corpo da requisição.
//
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são injetadas
// pela plataforma; nenhum secret extra é necessário.
//
// Implantação:  npx supabase functions deploy gerenciar-usuarios
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENS_PADRAO = [
  "https://manual-vicentinos.vercel.app",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const PAPEIS_VALIDOS = [
  "vicentino", "presidente", "vice_presidente",
  "tesoureiro", "secretario", "confrade_espiritual", "administrador",
];

// Condição do associado na Sociedade (migração 026). Diferente de PAPEIS,
// que é função na Conferência: uma consócia pode ser tesoureira.
const CATEGORIAS_VALIDAS = ["confrade", "consocia", "aspirante"];

const origensPermitidas = (Deno.env.get("ORIGENS_PERMITIDAS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ORIGENS = origensPermitidas.length ? origensPermitidas : ORIGENS_PADRAO;

function cabecalhosCors(origem: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    // supabase-js (sb.functions.invoke, usado em admin.html) manda mais
    // cabeçalhos do que um fetch cru — inclui os que ela usa, senão o
    // preflight falha e o navegador nem tenta a requisição de verdade.
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function responder(corpo: Record<string, unknown>, status: number, origem: string | null): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(origem), "content-type": "application/json; charset=utf-8" },
  });
}

function normalizarTexto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

// Deliberadamente frouxo: só recusa o que não é endereço nenhum. Validar e-mail
// por regex "de verdade" rejeita endereços válidos e não prova entrega de
// qualquer forma — quem diz a palavra final é o GoTrue, e o erro dele vira
// `email_ja_cadastrado` ou `falha_trocar_email` logo abaixo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Troca o e-mail de acesso de uma conta.
 *
 * Usada pelas DUAS pontas — o administrador corrigindo o cadastro de alguém e o
 * confrade corrigindo o próprio. Uma função só porque as regras são as mesmas e
 * duas cópias divergiriam justamente no `email_confirm`.
 *
 * `email_confirm: true` marca o novo endereço como já confirmado, e é o que
 * torna a troca possível NESTE projeto: não há SMTP próprio e
 * `mailer_autoconfirm` é false, então o fluxo padrão mandaria uma mensagem de
 * confirmação pelo mailer default do Supabase (~2/hora, explicitamente
 * não-produção) que na prática não chega. Sem isto a conta ficaria pendurada
 * entre o e-mail antigo e um novo nunca confirmado.
 *
 * @returns null quando deu certo, ou o código de erro para a resposta.
 */
async function trocarEmail(userId: string, email: string): Promise<string | null> {
  // `fetch` no endpoint do GoTrue, e NÃO servico.auth.admin.updateUserById().
  //
  // Não é preferência: o SDK achata a resposta de erro. Medido em 22/09/2026
  // contra o projeto, o endpoint devolve, para e-mail já em uso,
  //
  //     500 {"code":"23505",
  //          "message":"duplicate key value violates unique constraint
  //                     \"users_email_partial_key\"",
  //          "detail":"Key (email)=(...) already exists."}
  //
  // e pelo SDK não sobrou nada que distinguisse isso de uma falha qualquer —
  // a tela dizia "não foi possível trocar o e-mail" quando a resposta certa
  // era "já existe uma conta com este e-mail". Foi o defeito que
  // verificar-cadastro-confrades.mjs pegou. Com o corpo cru, o código 23505 é
  // um sinal exato.
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });

  if (r.ok) return null;

  const texto = await r.text();
  let corpo: Record<string, unknown> = {};
  try { corpo = JSON.parse(texto); } catch { /* resposta não-JSON */ }

  const error = {
    code: String(corpo.code ?? ""),
    message: [corpo.message, corpo.msg, corpo.error_description, corpo.detail]
      .filter(Boolean).join(" | ") || texto.slice(0, 300),
  };

  // E-mail já em uso por outra conta. Reconhecer isto é o que separa "escolha
  // outro endereço" de "deu erro, tente de novo" na tela.
  //
  // 23505 é violação de UNIQUE no Postgres — aqui, sempre o índice de e-mail.
  // As frases ficam como rede: o GoTrue relata o mesmo fato de formas
  // diferentes conforme o endpoint (criar diz "has already been registered").
  const alvo = error.message.toLowerCase();
  if (
    error.code === "23505" ||
    alvo.includes("duplicate key") ||
    alvo.includes("already been registered") ||
    alvo.includes("already exists")
  ) {
    return "email_ja_cadastrado";
  }
  console.error(`troca de e-mail falhou (${r.status} · ${error.code}):`, error.message);
  return "falha_trocar_email";
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const origem = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
  }
  if (req.method !== "POST") {
    return responder({ ok: false, erro: "metodo" }, 405, origem);
  }

  // 1 · Quem está chamando? O JWT já foi validado pela plataforma
  // (verify_jwt = true); aqui confere-se o PAPEL, com um client montado sobre o
  // JWT do próprio chamador — a mesma RLS que vale para o resto do site, não
  // uma checagem paralela.
  const autorizacao = req.headers.get("authorization");
  if (!autorizacao) {
    return responder({ ok: false, erro: "sem_sessao" }, 401, origem);
  }

  const comoChamador = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(await req.text() || "{}");
  } catch {
    return responder({ ok: false, erro: "json_invalido" }, 400, origem);
  }

  const acao = dados.acao;

  // -------------------------------------------------------------------------
  // 2 · O portão, POR AÇÃO.
  //
  // Até a versão anterior desta function havia um portão só, `is_admin()`,
  // antes de ler a ação — toda operação era de administrador. O autosserviço
  // muda isso: um confrade comum corrige o PRÓPRIO e-mail.
  //
  // A lista é de permissão explícita, e não uma exceção dentro do `if`: ação
  // que não estiver em ACOES_DO_PROPRIO_USUARIO cai no portão de administrador,
  // inclusive uma ação desconhecida ou uma acrescentada no futuro por quem não
  // leu este comentário. O padrão seguro é o de sempre; a exceção é que precisa
  // ser escrita.
  // -------------------------------------------------------------------------
  const ACOES_DO_PROPRIO_USUARIO = new Set(["atualizar_meu_email"]);

  if (ACOES_DO_PROPRIO_USUARIO.has(acao as string)) {
    // Membro da Área, e não admin: is_membro_area() = is_admin() OR
    // is_confrade_ativo() (migração 016). Exigir algum vínculo importa porque
    // `disable_signup` está ligado no projeto — sem isto, qualquer conta criada
    // pela API pública chegaria aqui.
    const { data: ehMembro, error: erroMembro } = await comoChamador.rpc("is_membro_area");
    if (erroMembro || !ehMembro) {
      return responder({ ok: false, erro: "acesso_negado" }, 403, origem);
    }
  } else {
    const { data: ehAdmin, error: erroAdmin } = await comoChamador.rpc("is_admin");
    if (erroAdmin || !ehAdmin) {
      return responder({ ok: false, erro: "acesso_negado" }, 403, origem);
    }
  }

  const servico = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------------------------------------------------------------------
  // listar — junta auth.users (só o service client enxerga e-mail) com as
  // duas tabelas de autorização. Nem confrades nem admins guardam e-mail.
  // ---------------------------------------------------------------------
  if (acao === "listar") {
    const { data: listaAuth, error: erroAuth } = await servico.auth.admin.listUsers({ perPage: 200 });
    if (erroAuth) {
      console.error("listUsers falhou:", erroAuth.message);
      return responder({ ok: false, erro: "indisponivel" }, 503, origem);
    }

    const { data: confrades } = await servico.from("confrades")
      .select("user_id, nome_completo, papel, categoria, ativo");
    const { data: admins } = await servico.from("admins").select("user_id, nome");

    const confradePorId = new Map((confrades ?? []).map((c) => [c.user_id, c]));
    const adminPorId = new Map((admins ?? []).map((a) => [a.user_id, a]));

    const usuarios = listaAuth.users.map((u) => {
      const confrade = confradePorId.get(u.id);
      const admin = adminPorId.get(u.id);
      return {
        user_id: u.id,
        email: u.email,
        nome: confrade?.nome_completo || admin?.nome || u.email,
        papel: confrade?.papel ?? null,
        categoria: confrade?.categoria ?? null,
        confrade_ativo: confrade?.ativo ?? false,
        admin: !!admin,
      };
    });

    return responder({ ok: true, usuarios }, 200, origem);
  }

  // ---------------------------------------------------------------------
  // criar_usuario
  // ---------------------------------------------------------------------
  if (acao === "criar_usuario") {
    const email = normalizarTexto(dados.email, 200);
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    const nome = normalizarTexto(dados.nome, 150);
    const papel = normalizarTexto(dados.papel, 40) || "vicentino";
    const categoria = normalizarTexto(dados.categoria, 20) || "confrade";
    const tambemAdmin = dados.tambem_admin === true;

    if (!EMAIL.test(email)) {
      return responder({ ok: false, erro: "email_invalido" }, 400, origem);
    }
    if (senha.length < 8) {
      return responder({ ok: false, erro: "senha_curta" }, 400, origem);
    }
    if (nome.length < 3) {
      return responder({ ok: false, erro: "nome_invalido" }, 400, origem);
    }
    if (!PAPEIS_VALIDOS.includes(papel)) {
      return responder({ ok: false, erro: "papel_invalido" }, 400, origem);
    }
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return responder({ ok: false, erro: "categoria_invalida" }, 400, origem);
    }

    const { data: criado, error: erroCriar } = await servico.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (erroCriar || !criado?.user) {
      const duplicado = (erroCriar?.message ?? "").toLowerCase().includes("already been registered");
      return responder(
        { ok: false, erro: duplicado ? "email_ja_cadastrado" : "falha_criar_usuario" },
        duplicado ? 409 : 500,
        origem,
      );
    }
    const userId = criado.user.id;

    const { error: erroConfrade } = await servico.from("confrades")
      .insert({ user_id: userId, nome_completo: nome, papel, categoria, ativo: true });

    const { error: erroAdminInsert } = tambemAdmin
      ? await servico.from("admins").insert({ user_id: userId, nome })
      : { error: null };

    if (erroConfrade || erroAdminInsert) {
      console.error("falha ao gravar confrade/admin, revertendo usuário:",
        erroConfrade?.message, erroAdminInsert?.message);
      await servico.auth.admin.deleteUser(userId);
      return responder({ ok: false, erro: "falha_gravar_perfil" }, 500, origem);
    }

    return responder({ ok: true, user_id: userId }, 200, origem);
  }

  // ---------------------------------------------------------------------
  // redefinir_senha
  // ---------------------------------------------------------------------
  if (acao === "redefinir_senha") {
    const userId = normalizarTexto(dados.user_id, 40);
    const senha = typeof dados.senha === "string" ? dados.senha : "";

    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return responder({ ok: false, erro: "user_id_invalido" }, 400, origem);
    }
    if (senha.length < 8) {
      return responder({ ok: false, erro: "senha_curta" }, 400, origem);
    }

    const { error: erroSenha } = await servico.auth.admin.updateUserById(userId, { password: senha });
    if (erroSenha) {
      console.error("updateUserById falhou:", erroSenha.message);
      return responder({ ok: false, erro: "falha_redefinir" }, 500, origem);
    }
    return responder({ ok: true }, 200, origem);
  }

  // ---------------------------------------------------------------------
  // atualizar_confrade — o administrador corrige o cadastro de alguém
  //
  // Um caminho só para os quatro campos editáveis (nome, papel, categoria e
  // e-mail), e não uma ação por campo: cada ação nova seria uma segunda
  // validação do mesmo `user_id`, livre para divergir da primeira.
  //
  // Os três primeiros vivem em `public.confrades`; o e-mail vive em
  // `auth.users` e só a service_role o alcança — por isso a edição inteira
  // passa por aqui, e não por um UPDATE do cliente.
  //
  // Campo ausente do corpo NÃO é apagado: só entra no patch o que veio. É o
  // que deixa a tela mandar `{categoria}` sozinho sem zerar o papel.
  // ---------------------------------------------------------------------
  if (acao === "atualizar_confrade") {
    const userId = normalizarTexto(dados.user_id, 40);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return responder({ ok: false, erro: "user_id_invalido" }, 400, origem);
    }

    const patch: Record<string, string> = {};

    if (dados.nome !== undefined) {
      const nome = normalizarTexto(dados.nome, 150);
      if (nome.length < 3) {
        return responder({ ok: false, erro: "nome_invalido" }, 400, origem);
      }
      patch.nome_completo = nome;
    }
    if (dados.papel !== undefined) {
      const papel = normalizarTexto(dados.papel, 40);
      if (!PAPEIS_VALIDOS.includes(papel)) {
        return responder({ ok: false, erro: "papel_invalido" }, 400, origem);
      }
      patch.papel = papel;
    }
    if (dados.categoria !== undefined) {
      const categoria = normalizarTexto(dados.categoria, 20);
      if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        return responder({ ok: false, erro: "categoria_invalida" }, 400, origem);
      }
      patch.categoria = categoria;
    }

    const email = dados.email === undefined ? "" : normalizarTexto(dados.email, 200);
    if (dados.email !== undefined && !EMAIL.test(email)) {
      return responder({ ok: false, erro: "email_invalido" }, 400, origem);
    }

    if (!Object.keys(patch).length && !email) {
      return responder({ ok: false, erro: "nada_a_atualizar" }, 400, origem);
    }

    // O e-mail PRIMEIRO, de propósito: é o que pode falhar por duplicidade, e
    // falhar depois de já ter gravado o nome deixaria o cadastro meio alterado
    // com a tela dizendo que nada deu certo.
    if (email) {
      const erro = await trocarEmail(userId, email);
      if (erro) return responder({ ok: false, erro }, erro === "email_ja_cadastrado" ? 409 : 500, origem);
    }

    if (Object.keys(patch).length) {
      const { data: alterado, error: erroPatch } = await servico.from("confrades")
        .update(patch).eq("user_id", userId).select("user_id");

      if (erroPatch) {
        console.error("update de confrade falhou:", erroPatch.message);
        return responder({ ok: false, erro: "falha_atualizar" }, 500, origem);
      }
      // UPDATE que não alcança linha nenhuma não é erro no Postgres — e aqui
      // significa user_id que não é confrade. Responder "ok" esconderia isso.
      if (!alterado?.length) {
        return responder({ ok: false, erro: "confrade_nao_encontrado" }, 404, origem);
      }
    }

    return responder({ ok: true }, 200, origem);
  }

  // ---------------------------------------------------------------------
  // atualizar_meu_email — o confrade corrige o PRÓPRIO e-mail de acesso
  //
  // A única ação desta function que não é de administrador.
  //
  // REGRA INEGOCIÁVEL: o usuário-alvo sai do JWT (`getUser()`), NUNCA do corpo
  // da requisição. Não há senha nem confirmação por e-mail neste fluxo, então
  // um `user_id` vindo do corpo seria a permissão para qualquer confrade trocar
  // o e-mail de acesso de qualquer outro. Se um dia esta ação precisar de um
  // alvo diferente, ela deixa de ser autosserviço e sai de
  // ACOES_DO_PROPRIO_USUARIO.
  //
  // `email_confirm: true` porque o projeto não tem SMTP próprio e
  // `mailer_autoconfirm` é false: o fluxo padrão (sb.auth.updateUser) mandaria
  // uma confirmação pelo mailer default do Supabase (~2/hora, não-produção) que
  // não chegaria, e o confrade ficaria esperando um e-mail que nunca vem.
  //
  // O preço, aceito com o usuário: ninguém prova a posse do novo endereço, e um
  // erro de digitação tranca o confrade fora. É recuperável — o administrador
  // corrige pelo `atualizar_confrade` acima, que é a outra metade deste pedido.
  // ---------------------------------------------------------------------
  if (acao === "atualizar_meu_email") {
    const { data: eu, error: erroEu } = await comoChamador.auth.getUser();
    if (erroEu || !eu?.user?.id) {
      return responder({ ok: false, erro: "sem_sessao" }, 401, origem);
    }

    const email = normalizarTexto(dados.email, 200);
    if (!EMAIL.test(email)) {
      return responder({ ok: false, erro: "email_invalido" }, 400, origem);
    }
    if (email.toLowerCase() === (eu.user.email ?? "").toLowerCase()) {
      return responder({ ok: false, erro: "email_igual_ao_atual" }, 400, origem);
    }

    const erro = await trocarEmail(eu.user.id, email);
    if (erro) return responder({ ok: false, erro }, erro === "email_ja_cadastrado" ? 409 : 500, origem);

    return responder({ ok: true, email }, 200, origem);
  }

  return responder({ ok: false, erro: "acao_desconhecida" }, 400, origem);
});
