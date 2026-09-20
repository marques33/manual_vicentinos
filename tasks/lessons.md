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

---

## 2026-09-15 · `type_text` simulado corrompe SQL longo em editor Monaco com IntelliSense

**O que aconteceu.** Ao aplicar migrations no SQL Editor do Supabase via automação de
navegador, usei `type_text` (digitação simulada tecla a tecla) para inserir uma migration
de ~700 caracteres. O resultado ficou com trechos de autocomplete inseridos no meio do
texto (`aguid`, `discovery_cached_at`, `authentication_method`, etc.) e indentação
crescente linha a linha — o IntelliSense do editor aceitava sugestões e auto-indentava
durante a digitação simulada, sem qualquer erro reportado pela ferramenta.

**Por que doeu.** Nada indicava falha — a chamada retornou sucesso, e só percebi ao
conferir `model.getValue()` e notar que o comprimento não batia com o esperado.
Se eu não tivesse conferido, teria rodado SQL corrompido contra um banco de produção.

**Regras preventivas.**
1. **Nunca usar digitação simulada (`type_text`/`press_key` em sequência) para inserir
   código longo em editores com autocomplete (Monaco, CodeMirror).** Preferir
   `evaluate_script` chamando a API do editor diretamente (`model.setValue(texto)`), que
   insere o conteúdo como um bloco, sem passar pelo pipeline de teclas.
2. **Texto longo passado por `evaluate_script` corre risco de perda de caractere na
   transcrição** (uma string de 6408 caracteres perdeu 1 char duas vezes seguidas ao ser
   colada inteira). Girar em base64 e dividir em blocos pequenos (~800 chars), conferindo
   o comprimento acumulado a cada bloco antes do próximo, torna o erro imediatamente
   visível em vez de silencioso.
3. **Sempre conferir o conteúdo final** (comprimento em bytes decodificados vs. o
   arquivo de origem, início e fim do texto) antes de executar/rodar qualquer coisa que
   dependa dele.

---

## 2026-09-15 · CTE com INSERT e leitura da própria escrita no mesmo statement

**O que aconteceu.** Testei uma função (`calcular_elegibilidade_pessoa`) logo após criar
a fixture de teste num único `WITH ... AS (INSERT ... RETURNING ...) SELECT
funcao(id) FROM cte`. A função (que lê a tabela diretamente, não via CTE) devolveu
"registro não encontrado" mesmo com o INSERT no mesmo comando.

**Causa raiz.** Todas as sub-declarações de um `WITH` em PostgreSQL compartilham o mesmo
snapshot MVCC do início do comando. Uma função chamada na consulta principal que lê a
tabela por fora da cadeia de CTEs não enxerga a escrita feita por uma CTE anterior dentro
do mesmo statement.

**Regra preventiva.** Para testar uma função/consulta contra dado recém-inserido, rodar o
INSERT e a chamada da função em **statements separados** (duas execuções), nunca no mesmo
`WITH`. Vale para qualquer teste manual via SQL Editor, não só para este caso.

---

## 2026-09-15 · CLI autenticada não implica acesso ao projeto que se quer usar

**O que aconteceu.** Antes de aplicar migrations, `supabase migration list` devolveu 403.
`supabase projects list` mostrou 3 projetos de uma conta (`aprovados`, `financial`,
`claude-memory`) — nenhum era o projeto `vicentinos` que este repositório usa. A mesma CLI
tinha aplicado migrations com sucesso neste projeto em 03/08; a conta logada mudou entre
sessões (provavelmente por uso da máquina em outro projeto/cliente).

**Regra preventiva.** "CLI logada" não é o mesmo fato que "CLI logada na conta certa".
Antes de qualquer `db push`/`migration list`, se o comando falhar com 403, checar
`supabase projects list` e confirmar que o projeto alvo aparece — não presumir que a
sessão de uma tarefa anterior continua válida. Nesta máquina, múltiplos projetos Supabase
de contextos diferentes competem pela mesma sessão da CLI.

---

## 2026-09-16 · `hidden` que não escondia nada (cascata CSS: origem vence especificidade)

**O que aconteceu.** Na Fase 2 (Dashboard de Efetividade), escondi um card admin-only com o
atributo `hidden` e revelei via JS (`el.hidden = false`) — o mesmo padrão já usado em
`admin.html` pra aba "Usuários". Testando ao vivo com conta confrade comum, o card apareceu
mesmo assim. `el.hidden` no DOM estava `true`; visualmente, visível.

**Causa raiz.** `area-vicentino.html` tem `.area-card { display: flex; ... }` no próprio
`<style>`. O `[hidden] { display: none }` do user-agent e a classe `.area-card` têm a
*mesma* especificidade (0,1,0) — mas isso não decide o empate: a cascata resolve por
**origem** antes de especificidade, e origem "autor" sempre vence origem "user agent",
não importa a ordem ou a especificidade. `prontuario.css` (usado por `prontuario.html`,
`admin.html`, etc.) tem uma regra explícita `[hidden] { display: none !important; }` que
mascarava esse problema em todas as páginas que já usavam o padrão — só notei porque esta
página nova não carrega `prontuario.css`.

**Regra preventiva.**
1. `hidden` só é garantidamente visual se a página tiver `[hidden] { display: none
   !important; }` no próprio CSS (como `prontuario.css` já tem) — ou se nenhuma regra do
   autor definir `display` para aquele elemento/classe.
2. Ao adicionar `hidden` num elemento cuja classe já tem `display` explícito no CSS da
   página, checar isso ANTES de confiar no padrão — não presumir que funciona só porque
   funcionou em outra página com outro stylesheet.
3. Verificação ao vivo (não só leitura de código) foi o que pegou isso — reforça: gate de
   acesso em UI sempre se testa logado como a conta que DEVE ser barrada, não só como a
   que deve passar.
4. Bug irmão no mesmo commit: a função que revela o elemento só era chamada num dos dois
   caminhos de login (sessão restaurada), não no login interativo — os dois fluxos que
   levam ao mesmo estado de tela têm código duplicado (`mostrarHub` em dois lugares) e
   davam pra divergir silenciosamente. Ao adicionar comportamento condicionado à sessão,
   checar TODOS os pontos de entrada que levam à mesma tela, não só o mais óbvio.

---

## 2026-09-16 · `taskkill /IM python.exe` matou processos de fora da tarefa

**O que aconteceu.** Pra derrubar um servidor HTTP local de verificação (`python -m
http.server`, lançado em background com `&`), rodei `taskkill //F //IM python.exe` — mata
por nome de imagem, não por PID. Derrubou os 9 processos python.exe da máquina, não só o
que eu tinha subido. Sem saber o que mais rodava, não dá pra saber o que foi perdido.

**Causa raiz.** Não capturei o PID no momento em que lancei o processo em segundo plano
(`(comando &)` no Bash não expõe o PID do subshell de forma óbvia), e recorri a matar por
nome como atalho — sem considerar que "nome do processo" não é "processo que eu lancei"
numa máquina onde o usuário pode ter outros scripts Python rodando.

**Regra preventiva.**
1. Nunca `taskkill /IM <nome>` nem `pkill -f <padrão amplo>` para encerrar algo que eu
   mesmo lancei — isso é uma ação destrutiva de raio de alcance amplo (mesma categoria que
   `rm -rf`, `git reset --hard`) e as instruções globais já pedem cautela nelas.
2. Ao lançar processo em background para verificação, capturar o PID de verdade: `comando
   & PID=$!` (bash) e guardar `$PID` pra matar depois com `kill $PID`, ou usar
   `run_in_background` do próprio Bash tool e encerrar pelo mecanismo do harness, não por
   `taskkill`/`pkill` manual.
3. Se não for possível isolar o PID com segurança, perguntar ao usuário antes de matar por
   nome — nunca assumir que "só eu" rodo processos com aquele nome na máquina dele.

---

## 2026-09-19 · `head` num script com limpeza mata o script antes da limpeza

**O que aconteceu.** Rodei o QA do Playwright com `node qa.mjs 2>&1 | head -8` só
para conferir rapidamente que ele tinha passado a apontar para produção. O `head`
fechou o pipe, o `node` levou SIGPIPE e morreu no meio — **antes do bloco
`finally` que apaga a massa de teste**. Ficaram no banco de produção uma conta de
auth, uma linha em `confrades` e uma em `admins`, todas com privilégio de
administrador. Só apareceram porque rodei uma varredura de sobras depois.

**Causa raiz.** Tratei o script como se fosse só uma fonte de texto para ler. Ele
não é: ele tem **responsabilidade transacional** — cria estado remoto e é o único
que sabe desfazê-lo. Interromper a saída de um programa assim é interromper a
transação dele.

**Por que doeu.** A sobra era uma conta **administradora** num projeto de
produção, o pior tipo de resíduo para esquecer. E a falha é silenciosa: o
`head` devolve status 0 e a saída visível parecia normal, terminando em
"PASSOU" — nada indicava que o programa tinha sido morto.

**Regras preventivas.**
1. **Script que cria estado remoto nunca vai para um pipe que fecha cedo**
   (`head`, `tail`, `grep -q`, `| head -n`). Redirecionar para arquivo
   (`> saida.txt 2>&1`) e ler o arquivo depois. O custo é zero.
2. **Se o script tem `finally` de limpeza, a saída dele é indivisível.** Ver o
   começo não vale o risco de perder o fim.
3. **Depois de qualquer execução que cria massa de teste, rodar uma varredura de
   sobras independente** — consultando o banco por prefixo/marca, não confiando
   no relatório do próprio script que pode ter morrido antes de escrevê-lo.
4. Marcar toda massa de teste com um prefixo reconhecível (`qa-`, `QA-`) existe
   justamente para que a varredura do item 3 seja possível.

---

## 2026-09-19 · `str.replace()` que não casa devolve o texto intacto e diz "ok"

**O que aconteceu.** Alterei o script de QA por um patch em Python
(`s.replace(velho, novo, 1)`) para que ele aceitasse apontar para produção. O
patch **não casou** (havia diferença de escape no trecho procurado), o `replace`
devolveu a string original sem erro, o script imprimiu `ok` e eu rodei o QA
"contra produção" — que na verdade continuou rodando contra `127.0.0.1`. Quase
reportei ao usuário uma verificação de produção que nunca aconteceu.

**Causa raiz.** `replace` não tem modo estrito: "não encontrei" e "substituí" têm
exatamente a mesma cara. Imprimir `ok` no fim do script provava apenas que o
Python chegou ao fim, não que a edição existiu.

**O que salvou.** A saída do próprio QA dizia `servindo ... em
http://127.0.0.1:51930` em vez de `QA contra PRODUÇÃO`. Conferir a **evidência
do efeito** (o alvo que o programa imprimiu) e não a **confirmação do executor**
(`ok`) foi o que pegou.

**Regras preventivas.**
1. **Patch programático se verifica depois, no arquivo** — `grep` pelo texto
   novo, ou `assert velho in s` **antes** do replace. Um `replace` sem asserção
   é uma edição que pode não ter acontecido.
2. **Preferir a ferramenta de edição do harness** (Edit) a `sed`/`replace` em
   script: ela falha alto quando o alvo não existe. Foi como a correção acabou
   sendo feita.
3. **Corolário geral, que vale para além deste caso:** ao afirmar "verifiquei em
   X", a prova é a saída dizer X — não o comando ter sido escrito com X. Mesma
   família do erro de 02/08 (projeto Supabase errado) e do teste de RLS que
   reportou "protegido" com chave inválida.
