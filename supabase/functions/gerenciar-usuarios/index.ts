// ============================================================================
// gerenciar-usuarios — única porta de escrita privilegiada de contas.
// ----------------------------------------------------------------------------
// Criar usuário e redefinir senha de terceiro são operações da Admin API do
// Supabase: exigem a chave `service_role`, que nunca pode chegar ao
// navegador. Esta function é o intermediário — igual em espírito a
// enviar-pedido (../enviar-pedido/index.ts), mas ao contrário dela é
// AUTENTICADA (verify_jwt = true em supabase/config.toml): só usuário logado
// chega até aqui, e mesmo assim o código confere de novo, com o JWT do
// chamador, se quem pediu é `public.admins` — antes de tocar em qualquer
// chave de serviço.
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
  // (verify_jwt = true); aqui confere-se especificamente is_admin(), com um
  // client montado sobre o JWT do próprio chamador — a mesma RLS que vale
  // para o resto do site, não uma checagem paralela.
  const autorizacao = req.headers.get("authorization");
  if (!autorizacao) {
    return responder({ ok: false, erro: "sem_sessao" }, 401, origem);
  }

  const comoChamador = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ehAdmin, error: erroAdmin } = await comoChamador.rpc("is_admin");
  if (erroAdmin || !ehAdmin) {
    return responder({ ok: false, erro: "acesso_negado" }, 403, origem);
  }

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(await req.text() || "{}");
  } catch {
    return responder({ ok: false, erro: "json_invalido" }, 400, origem);
  }

  const servico = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const acao = dados.acao;

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
      .select("user_id, nome_completo, papel, ativo");
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
    const tambemAdmin = dados.tambem_admin === true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
      .insert({ user_id: userId, nome_completo: nome, papel, ativo: true });

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

  return responder({ ok: false, erro: "acao_desconhecida" }, 400, origem);
});
