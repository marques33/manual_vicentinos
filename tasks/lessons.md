# Lições

Erro repetido é falha de sistema, não acidente. Cada entrada registra o que
aconteceu, a causa raiz e a regra preventiva — a regra é a parte que importa.

---

## 2026-08-02 · Apliquei migrações no projeto Supabase errado

**O que aconteceu.** Recebi uma string de conexão e apliquei nela as 4 migrações do mural e
dos pedidos de oração. Só depois, ao receber a chave `anon`, notei que o `ref` dentro do
payload do JWT (`cqkymbseyrebmsufimni`) não era o mesmo do usuário do banco
(`postgres.nvnaxawszomhjqrmziqi`). Eram dois projetos diferentes, ambos vazios. Precisei
desfazer tudo no projeto errado e recomeçar no certo.

**Causa raiz.** Tratei "recebi uma credencial" como "recebi a credencial certa". As duas
informações — banco e chave — chegaram em mensagens diferentes, e não existe nada no fluxo
que force a comparação entre elas. Agi na primeira que chegou, sem esperar a segunda que
permitiria conferir.

**Por que era perigoso.** Se eu tivesse colado a chave sem conferir, o site subiria
apontando para um projeto sem as tabelas. A API responde **404 na tabela**, não erro de
autenticação, e o front cai no estado "nenhuma divulgação no momento" — que é uma tela
legítima. O resultado seria um site que parece funcionar e nunca mostra nada. Falha
silenciosa é a pior categoria: não dispara alarme e não chega como bug report.

**Regras preventivas.**
1. **Identificador de projeto se confere, não se presume.** Em Supabase, decodificar o
   payload do JWT (`base64url` do segmento do meio) e comparar o `ref` com o do usuário do
   banco (`postgres.<ref>`) e com a URL do projeto. São três lugares onde o mesmo `ref`
   aparece; se um divergir, parar.
2. **Credencial que chega em partes se junta antes de agir.** Quando a tarefa depende de
   duas credenciais que vêm em mensagens separadas, esperar as duas e cruzá-las antes de
   escrever qualquer coisa. A pressa de aplicar a primeira não economiza nada — custou uma
   instalação inteira e uma limpeza.
3. **Preferir a checagem que falha alto.** Antes de dar por instalado, fazer uma requisição
   real com a chave real contra a tabela real. `404` na tabela e `401` na chave contam
   histórias completamente diferentes, e as duas parecem "não funcionou".
4. Vale para qualquer serviço com múltiplos ambientes/projetos (Vercel, Render, Firebase):
   antes de aplicar, confirmar que o alvo é o que se pensa que é.

---

## 2026-08-02 · Um teste de segurança que dizia "protegido" sem saber

**O que aconteceu.** `verificar-rls.mjs` reportou 14 verificações "OK" enquanto usava uma
chave `anon` inválida. Cada operação proibida era de fato recusada — mas por causa da chave,
não da RLS. O relatório afirmava exatamente o oposto do que tinha provado.

**Causa raiz.** O script comprovava apenas negativas. Uma negativa não distingue "bem
protegido" de "nem cheguei a entrar". Eu tinha escrito no próprio script um aviso sobre isso
(a seção do par negado/permitido) e ainda assim deixei o corpo dele passar sem uma
conferência de entrada.

**Regra preventiva.** Todo teste que comprova **ausência** de acesso precisa, antes, provar
que o canal funciona — uma leitura que **tem** que dar certo. Sem essa âncora, o resultado
"tudo negado" é indistinguível de "tudo quebrado", e a mensagem honesta não seria "protegido"
e sim "não sei". Quando não der para provar o lado positivo, o script deve dizer que não
provou, nunca reportar sucesso.

**Corolário.** Não deixar valor lido por ferramenta ficar "bonito" no fonte. Quebrei a chave
em três literais concatenados para o `ref` ficar legível em diff; o extrator leu só o
primeiro pedaço. Legibilidade que quebra parsing custa mais do que entrega.

---

## 2026-08-02 · CHECK com `is null or ...` tem dois caminhos

**O que aconteceu.** A coluna `mural_posts.link_externo` tinha
`check (link_externo is null or link_externo ~ '^https://[^[:space:]]{4,300}$')`. O Postgres
limita repetição em regex a 255 (RE_DUP_MAX) e recusa a expressão inteira com
`invalid repetition count(s)`. Resultado: nenhum cartaz com link podia ser inserido. Só
apareceu ao cadastrar o primeiro cartaz real.

**Causa raiz.** Todos os testes anteriores usavam `link_externo` nulo. O `is null or` faz
curto-circuito e a regex nunca era avaliada — o caminho defeituoso nunca foi executado.

**Regras preventivas.**
1. Constraint com alternativa (`is null or`, `case`, `or`) tem mais de um caminho: o teste
   precisa passar por **todos**, inclusive o "campo preenchido".
2. Em regex do Postgres, repetição limitada vai até 255. Teto de tamanho pertence ao
   `char_length`, não à chave de repetição.
3. Fixture de teste tem que satisfazer as **outras** constraints, senão o erro que aparece
   não é o que se está investigando (perdi uma rodada com `titulo` de 1 caractere batendo
   num CHECK diferente e parecendo falha do link).

---

**Também aprendido nesta tarefa (menor).** A porta 8000 desta máquina está ocupada por um
servidor `waitress` que redireciona para https, o que faz o Playwright falhar com
`ERR_TIMED_OUT` — um erro que não sugere "porta ocupada". Servir a partir de uma porta livre
escolhida pelo sistema (`porta 0`) dentro do próprio script de verificação elimina a classe
inteira de problema.

---

## 2026-08-03 · "A ferramenta não está instalada" também é uma afirmação que precisa de prova

**O que aconteceu.** O plano registrou, como fato, que *a CLI do Supabase não está instalada
nesta máquina*, e por causa disso empurrou para o usuário quatro passos manuais no painel:
colar dois arquivos `.ts` no editor web, marcar *Verify JWT* desligado e criar o segredo à
mão. A CLI estava instalada — versão 2.111.0, já autenticada — e o serviço inteiro subiu com
dois comandos (`supabase secrets set`, `supabase functions deploy`).

**Causa raiz.** Afirmei a ausência de uma ferramenta sem executar a checagem que custa um
segundo (`supabase --version`). Ausência foi tratada como default; presença, como algo que
precisaria de prova. É o inverso do certo: o custo de checar é ~0 e o custo de errar é
transferir trabalho manual, propenso a erro, para o usuário.

**Agravante.** Copiar `.ts` no editor do painel não é equivalente ao deploy: perde o
`config.toml` (`verify_jwt = false`), perde o versionamento e não deixa evidência
verificável. O caminho manual não era só mais chato — era pior.

**Regras preventivas.**
1. Antes de escrever "X não está instalado / não está disponível", **rodar o comando de
   versão**. Sem saída do terminal, a frase não entra em documento nenhum.
2. Antes de propor procedimento manual no painel de um serviço, checar se existe CLI ou API
   oficial para o mesmo passo. Painel é o último recurso, não o primeiro.
3. Anotação de ambiente (o que existe na máquina) **envelhece**: reconfirmar no início da
   tarefa que a usa, não confiar no que ficou escrito em sessão anterior.
4. `WARNING: Docker is not running` no `functions deploy` **não é erro** — a CLI envia os
   arquivos pela API. Ler a última linha antes de concluir que falhou.

---

## Dado institucional não se deduz — se pergunta (03/08/2026)

**O que aconteceu.** O site foi construído inteiro sobre um fato errado: a Conferência foi
batizada de *Nossa Senhora de Fátima* em ~50 lugares (títulos, metas, JSON-LD, cabeçalho,
rodapé, corpo, pacote de Instagram). O nome real é *Nossa Senhora do Carmo*; *Fátima* é o
Conselho Particular ao qual ela se subordina. O usuário só percebeu ao ver a página pronta.

**Causa raiz.** O nome foi *inferido* a partir do material disponível, provavelmente
confundindo o Conselho com a Conferência, e nunca foi confirmado. Depois, propagou-se por
cópia: cada página nova herdou o erro da anterior, e o pacote de redes sociais herdou de
todas. Um dado não verificado, replicado, vira "consenso" dentro do próprio repositório.

**Por que doeu.** Erro de identidade é o mais caro de todos os erros de conteúdo: aparece em
`<title>`, canonical, Open Graph e Schema.org — ou seja, é o que o Google indexa e o que
aparece quando alguém compartilha o link. Corrigir depois exige reindexação.

**Regras preventivas.**
1. **Nome próprio de instituição, data de fundação, hierarquia e vínculo são fatos de
   entrada, não de dedução.** Se o usuário não forneceu, perguntar antes de escrever — e
   nunca inferir a partir de um nome parecido no contexto (paróquia, conselho, padroeiro e
   conferência podem ter nomes distintos e frequentemente têm).
2. **Fato institucional mora em um lugar só.** Espalhar a mesma string por 6 HTML é convidar
   a divergência. Se voltar a crescer, extrair para um bloco único (partial/JS) — hoje o
   controle é o script de substituição + varredura de sobras.
3. **Ao corrigir um fato replicado, varrer o repositório inteiro** (`grep -rn`), não só o
   arquivo que o usuário apontou — e listar explicitamente o que ficou de fora e por quê.
4. **Substituição em massa precisa de padrão ancorado.** Trocar "Nossa Senhora de Fátima" às
   cegas teria destruído as referências legítimas ao Conselho Particular. Os padrões foram
   ancorados em "Conferência ..." e a varredura final imprimiu as sobras para conferência
   manual.

---

## Histórico de migração vazio: `db push` reexecuta tudo (03/08/2026)

**O que aconteceu.** Ao aplicar a migração 005 (anexo do mural), `supabase db push --dry-run`
listou as **cinco** migrações para subir — inclusive as quatro de 02/08, que já estavam
aplicadas no banco. As tabelas existiam (`admins`, `mural_posts`, `pedidos_oracao`,
`private.rate_limit`), mas `supabase migration list` mostrava `remote` vazio nas cinco.

**Causa raiz.** As quatro primeiras foram aplicadas **fora da CLI** (pelo editor SQL do
painel). O banco ficou com o schema certo e o histórico
(`supabase_migrations.schema_migrations`) vazio — a CLI não tinha como saber que já tinham
rodado.

**Por que doeu (ou doeria).** Um `db push` cego teria reexecutado as quatro. As três
primeiras são idempotentes (`create table if not exists`, `drop policy if exists`), mas a 004
agenda job no `pg_cron`: reexecutar duplicaria o agendamento de purga em produção. "É só
rodar de novo, é idempotente" é uma aposta, não uma verificação.

**Regras preventivas.**
1. **Antes de qualquer `db push`, rodar `supabase migration list`** e comparar `local` com
   `remote`. Divergência não é detalhe: é sinal de que o banco e o repositório contam
   histórias diferentes.
2. **Migração já aplicada por fora se conserta com `supabase migration repair --status
   applied <versão>`** — que só carimba o histórico, sem reexecutar SQL. Nunca "empurrar de
   novo e torcer".
3. **Confirmar o estado real antes de carimbar.** Carimbar como aplicada uma migração que
   *não* rodou deixa o banco permanentemente atrás do repositório, e o erro só aparece
   quando alguém usa a coluna que não existe. Aqui a conferência foi
   `supabase inspect db table-stats`: as quatro tabelas estavam lá.
4. **`--dry-run` primeiro, sempre.** Foi ele que revelou o problema antes de qualquer
   escrita.

---

## RLS nega antes do CHECK — teste de constraint precisa de outra chave (03/08/2026)

**O que aconteceu.** O plano previa provar o CHECK de `anexo_url` "por fora, pela chave anon",
no mesmo formato das provas de RLS já feitas. Não funciona: a chave `anon` não tem política de
INSERT em `mural_posts`, então o PostgREST devolve 401 **antes** de o Postgres avaliar a
restrição. O teste passaria com o CHECK escrito errado — ou sem CHECK nenhum.

**Causa raiz.** Confundir duas camadas que negam pelo mesmo canal. RLS decide *se a linha pode
ser escrita*; CHECK decide *se o valor é válido*. Um 401 não distingue as duas.

**Regra preventiva.** **Cada camada se prova com um sujeito que passa pelas anteriores.** Para
testar CHECK, escrever com quem a RLS já deixa passar (moderador autenticado ou, na falta de
senha, a chave de serviço). Um teste cuja negativa viria de qualquer jeito não é evidência.
Corolário do que já estava escrito em `verificar-rls.mjs`: toda negativa precisa do par
positivo que prova que a operação passaria se fosse legítima.
