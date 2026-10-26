# Despensa — estoque de doações em espécie na Área do Vicentino (26/10/2026)

## Origem

Planilha `Inventario_Despensa_Vicentinos.ods` (26/10/2026), levantamento feito
a partir de 11 fotos da despensa: 44 itens, quantidades **estimadas**, colunas
de conferência física e de validade ainda vazias. Pedido: uma página nova na
Área do Vicentino para esses bens em espécie (o dinheiro já está no Financeiro).

## Decisões do usuário

- Escopo: bens em espécie — cestas, alimentos, higiene/limpeza, utensílios.
- Controle: estoque com movimentações (saldo = soma; histórico; conferência).
- Escrita: tesoureiro e administrador (`pode_gerir_estoque()`); leitura: todo
  confrade ativo.
- Carga: importar marcando "estimado"; fora os itens 42 e 43 (material da
  Conferência) e o 44 (engradados possivelmente de terceiros); a linha 9
  (arroz/açúcar misturados) vira item provisório + "Arroz 1 kg" com saldo 0.

## Plano e critérios de aceitação

- [x] 1. `fix(area)`: textos da Área sem contagem fixa (commit `dd3b704`).
- [x] 2. Migration 028 `estoque_itens` + `pode_gerir_estoque()`.
- [x] 3. Migration 029 `estoque_movimentos` + gatilho de saldo +
      `vw_estoque_saldos` (`security_invoker`) + `conferir_item_estoque()`.
- [x] 4. `supabase/gerar_carga_estoque.py` → migration 030 + pytest.
- [x] 5. Verificação de RLS — **trocada** de `verificar-rls-estoque.mjs` para
      `supabase/verificar-estoque.sql` (ver Desvios).
- [x] 6. `app/estoque.html` + card, 2× `DESTINOS`, texto do hub.
- [x] 7. Playwright local (contas descartáveis, limpeza conferida).
- [x] 8. Commit, push, conferência no ar.

## Desvios do plano (e por quê)

- **Verificação de RLS em SQL, não em Node.** O `.mjs` precisaria de contas de
  teste com senha nas variáveis de ambiente — que não existem, e as seções
  sairiam "puladas". O `.sql` roda como postgres, simula cada perfil por
  `set local role` + `request.jwt.claims` e desfaz tudo com um erro
  proposital: prova mais, sem conta e sem rastro.
- **Migration 031 a mais.** O Security Advisor apontou a função de gatilho
  executável por `authenticated` (o `revoke from public, anon` da 029 não a
  alcança no Supabase). Corrigido em migration nova porque a 029 já estava
  aplicada.
- **Conferência como RPC** (`conferir_item_estoque`), não como duas chamadas
  da tela: ajuste e "deixa de ser estimado" na mesma transação, com o item
  travado — se outro movimento entrar no meio, o ajuste continua certo.
- **Movimento imutável** por grant de COLUNA (só `removido_em/por`), conforme
  a lição de 22/09.

## Revisão (26/10/2026)

**Resultado.** Página `estoque.html` ("Despensa") no ar, com 42 itens
carregados da planilha (27 cestas), todos marcados "estimado" até a
conferência física.

**Evidências.**

| Verificação | Comando | Resultado |
|---|---|---|
| Migrações sem aplicar (dry-run em produção, carga aplicada 2×) | `db query --linked -f` com `begin;` + 028–030 + 030 + verificação | 34/34 OK; `to_regclass` nulo depois |
| Controle negativo do arnês | duas expectativas erradas de propósito | 32/34, as 2 FALHAS certas |
| Banco de produção depois do push (e de novo depois da 031) | `supabase db query --linked -f supabase/verificar-estoque.sql` | 34/34 OK |
| Privilégio da função de gatilho | `has_function_privilege(...)` | `false` para authenticated |
| Regras da carga | `python -m pytest tests/ -q` | 47 passed (10 da carga) |
| E2E (gestor e confrade comum, desktop e celular) | Playwright, servidor local | 35/35 OK; varredura: 0 contas, 0 itens de teste, 42 itens, 41 movimentos |

**Riscos residuais.**
- Os números são estimativas de fotos até alguém conferir item a item.
- A linha 9 (arroz/açúcar) precisa ser separada na conferência — o item
  provisório explica como.
- Itens 42–44 ficaram fora; se os engradados (44) forem da Conferência,
  cadastrar à mão.

**Próximos passos possíveis** (não feitos, exigem decisão):
- Sugerir na ata semanal as saídas da semana — a ata conta cestas em **kg**,
  o estoque em unidades.
- Gerar a intervenção `doacao_material` do Prontuário a partir de uma
  saída para família.
- Ligar compra de cesta ao lançamento financeiro (`des_cestas_basicas`).

## Achados fora do escopo

1. **A Área se contradiz sobre quantas ferramentas tem**: "seis" em
   `app/area-vicentino.html:543, 629, 784` e "sete" em `:794` e
   `app/assets/area-vicentino.js:11, 116`. Trivial → corrigir em commit
   próprio `fix(area)`.
   → **corrigido** em `dd3b704`, trocando o número por "todas" (número fixo
   envelhece a cada módulo novo).
2. **Proteção contra senha vazada desligada no Supabase Auth** (Security
   Advisor: `auth_leaked_password_protection`). Anterior a esta tarefa; é
   configuração do painel (Authentication → Policies/Passwords), não código.
   Recomendado ligar — **apenas registrado e reportado**, não alterado.
