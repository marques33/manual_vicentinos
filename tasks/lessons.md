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

---

## 2026-09-20 · Correção de acento em massa inverteu o sentido de uma frase

**O que aconteceu.** Um script de restauração de acentos trocou `divida` por
`dívida` em dois arquivos. A frase era a que ensina a calcular a renda por
pessoa: *"some toda a renda da família e **divida** pelo número de pessoas"*.
Virou *"e **dívida** pelo número de pessoas"* — o verbo dividir virou o
substantivo débito, exatamente na instrução que alguém precisa seguir para
saber se tem direito ao Bolsa Família e ao BPC.

**Causa raiz.** O script tratou acentuação como transformação de texto, quando
em português ela é **distintiva**: `divida`/`dívida`, `e`/`é`, `esta`/`está`,
`secretaria`/`secretária`, `publica`/`pública`, `medica`/`médica` são pares em
que o acento muda a classe da palavra. Uma tabela "sem acento → com acento"
não tem como decidir entre eles sem olhar a frase.

**Por que passou.** O diff tinha 1.400 linhas quase todas legítimas. Duas
linhas erradas no meio disso não saltam aos olhos de ninguém — e o resultado
continua sendo português bem formado, então nenhuma revisão ortográfica
acusaria.

**Regras preventivas.**
1. **Separar o que é tipografia do que é conteúdo antes de revisar.** Normalizar
   os dois lados do diff (tirar acento, unificar travessão e espaço) e comparar:
   o que fica igual é tipografia e pode passar em bloco; o que fica diferente é
   conteúdo e exige leitura. Foi isso que reduziu 1.400 linhas a 25 para ler.
2. **Manter uma lista de pares mínimos perigosos** e varrer por ela depois de
   qualquer passe de acentuação, olhando o contexto de cada ocorrência.
3. **Só aplicar automaticamente o par cuja forma sem acento não é palavra
   válida** (`nao`, `populacao`, `voce`, `numero`). Onde as duas formas existem,
   a decisão é de quem lê a frase — o script apenas lista.
4. **Citação de lei se confere na fonte, não no acento.** "assistência jurídica
   integral **é** gratuita" só foi pego porque o texto do Art. 5º, LXXIV foi
   buscado no Planalto: o oficial é "integral **e** gratuita", e o verbo é
   "prestará", não "prestara".
5. Substituição sensível à caixa deixa `Núcleo`, `População` e `Cobranças`
   para trás — 41 ocorrências neste caso. Casar sem distinguir caixa e reaplicá-la
   na saída.

---

## 2026-09-20 · `git add '*.md'` levou 40 MB de arquivo de terceiro para o commit

**O que aconteceu.** Para commitar 54 arquivos de conteúdo, rodei
`git add -- '*.md'`. O glob não distingue arquivo **rastreado e modificado** de
arquivo **novo e não rastreado**: entraram junto 15 `.md` de `biblioteca/` (um
vade mecum de terceiro, 40 MB), 3 de `build/` (gerados) e 6 skills. Só percebi
porque o commit dizia "78 arquivos" onde eu esperava 54.

**Causa raiz.** Pensei no glob como filtro de *quais arquivos me interessam* e
esqueci que ele também decide *o que passa a ser versionado*. `biblioteca/` e
`build/` não estão no `.gitignore` — estavam apenas fora do índice, e essa
distinção é invisível quando se olha só o padrão.

**Por que doeu (ou doeria).** Blob grande no histórico do git é praticamente
irreversível: some do commit mas continua no pack, e todo mundo que clonar
baixa. E é conteúdo licenciado de terceiro, que não deveria ir para um
repositório público.

**Regras preventivas.**
1. **Para commitar alterações, usar `git add -u`**, que só encena arquivos já
   rastreados. `git add <glob>` é para adicionar coisa nova, e aí o que entra
   se escolhe um a um.
2. **Conferir a contagem antes de commitar.** `git diff --cached --name-only |
   wc -l` comparado com o número esperado teria pego isso antes do commit, não
   depois.
3. **`git diff --cached --name-status | grep '^A'` antes de qualquer commit de
   manutenção**: num commit que só corrige texto existente, arquivo com status
   `A` é sinal de erro de escopo.
4. Diretório grande que não deve ser versionado merece entrada no `.gitignore`
   — "nunca foi adicionado" não é proteção nenhuma.

---

## 2026-09-20 · Script de "correcao" automatica de texto quase inverteu a instrucao de renda

**O que aconteceu.** O `/review` pegou `fix_textual.py` antes do primeiro commit. O script
reescreve markdown **in-place** e fazia duas coisas erradas ao mesmo tempo.

A primeira: `ROOT.rglob("*.md")` excluindo so `build/`. Isso alcancava 92 arquivos, nao os
53 do manual. Entre eles `biblioteca/` (vade mecum, CF/88, ECA — fontes legais primarias,
**nao rastreadas pelo git**, logo sem baseline para recuperar) e `.claude/skills/`, onde a
`vicentino-section-writer` tem o exemplo `"Voce" -> "voce"`: aplicar o dicionario reescreve
os dois lados da seta e apaga a propria instrucao. O script se destruia.

A segunda, pior: o dicionario troca palavra por palavra, sem contexto. `divida` -> `divida`
esta certo em "pagar a divida" e **errado** em "some toda a renda da familia e divida pelo
numero de pessoas" — que e a instrucao de renda per capita do Bolsa Familia
(`02-bolsa-familia.md:17`) e do BPC/LOAS (`03-bpc-loas.md:40`). Duas ocorrencias vivas. A
frase viraria "debito pelo numero de pessoas" para quem mais precisa dela estar certa.

**Causa raiz.** Um dicionario `sem_acento -> com_acento` presume que a forma sem acento nao
e uma palavra. Em portugues isso e falso para uma classe inteira: `divida`/`divida`,
`previa`/`previa`, `faca`/`faca`, `carne`/`carne`, `esta`/`esta`, `marco`/`marco`. O autor
percebeu o problema — existe o conjunto `DANGEROUS` com quatro dessas — mas trata-lo por
lista manual e censo, e censo sempre fica incompleto.

**Por que era perigoso.** Reescrita in-place nao tem diff se o arquivo nao esta versionado,
e o unico controle era a frase "use `git diff` antes de comitar" no docstring. Controle que
depende de alguem lembrar nao e controle. E o dano sai como portugues bem-formado: nao
quebra build, nao dispara teste, nao vira bug report. So um leitor calculando renda errado.

**Dado que fechou o caso:** depois de restringir o escopo, o dry-run acusou **0 de 53
arquivos alterados** — o conteudo ja estava acentuado por um passe anterior. O glob de 92
arquivos era risco puro, sem nenhum ganho em troca.

**Regras preventivas.**
1. **Script que reescreve in-place declara o escopo por allowlist, nunca por `rglob` menos
   exclusoes.** Exclusao esquece o diretorio que ainda nao existe. Allowlist so alcanca o
   que foi nomeado. `content_files()` lista as pastas e diz no docstring por que cada
   excluida ficou de fora.
2. **Antes de rodar qualquer reescrita em massa, medir o alcance:** contar arquivos por
   diretorio de topo e conferir se bate com a intencao. 92 != 53 apareceria na hora.
3. **Substituicao de palavra sem contexto nao entra em texto que da instrucao.** Se a forma
   sem acento e palavra valida, sai do dicionario e vira padrao com contexto
   (`NOUN_PATTERNS`). Na duvida, nao mexer: acento faltando e barato, sentido invertido nao.
4. **Funcao pura merece teste antes do primeiro commit.** `fix_text()` e `apply_rules()`
   nao tinham nenhum. Os 37 testes de `tests/test_fix_textual.py` levaram minutos e travam
   exatamente as duas frases de renda lendo os arquivos reais.
5. **Guarda na ultima etapa nao protege as anteriores** (essa o Codex me apontou; eu tinha
   corrigido pela metade). `require_pandoc()` estava em `render_pdf()`, a ultima chamada de
   `main()` — quando disparava, o script ja havia sobrescrito `build/` e 358 KB de
   intermediario. Validacao de pre-requisito vai no **inicio**, antes da primeira escrita.

---

## 2026-09-22 · Compus dois cadastros de papel com `and` e tranquei a porta para todos

**O que aconteceu.** Na migração 022 (Livro de Atas) escrevi a policy de `UPDATE` de
`public.atas` como

```sql
using (public.pode_redigir_ata() and (status = 'rascunho' or public.is_admin()))
```

e, no comentário ao lado, afirmei que a ata aprovada "só é alcançável por `is_admin()`, que
é o caminho de reabertura". A afirmação era falsa. `pode_redigir_ata()` lê
`confrades.papel`; `is_admin()` lê `public.admins`. São **cadastros independentes** — a
própria migração 006 diz isso com todas as letras. Com o `and` por fora, reabrir exigia
estar nos dois ao mesmo tempo:

- confrade com papel `administrador` fora de `public.admins` → `is_admin()` falso, `status`
  não é rascunho → recusado;
- moderador em `public.admins` sem papel de redação → recusado já no primeiro operando.

Resultado: **ninguém reabria**, e `ata.html` exibia o botão "Reabrir" com base só em
`is_admin()` — um botão visível que não fazia nada. Consertado na migração 024 antes de ir
ao ar, separando as duas perguntas em `pode_redigir_ata()` e `pode_reabrir_ata()`.

**Causa raiz.** Escrevi a expressão pensando em UM usuário ("o administrador"), e não nos
conjuntos que os dois predicados realmente descrevem. Quando duas funções consultam tabelas
diferentes, `A and (x or B)` não é "A, com B como exceção" — é uma interseção, e a
"exceção" `B` nunca escapa do `A`. A escape hatch tem que estar no mesmo nível do que ela
contorna, ou não é escape hatch.

O agravante foi o comentário: descrevi a intenção em vez do comportamento, e o comentário
errado passou a defender o código errado na releitura. O que denunciou o bug não foi a
expressão, foi comparar a policy com o `hidden` do botão na tela.

**Regras preventivas.**
1. **Antes de escrever uma policy que compõe mais de um predicado de papel, verificar se
   eles leem a MESMA tabela.** Neste projeto não leem: `is_admin()` → `public.admins`;
   `is_confrade_ativo()`, `pode_lancar_financeiro()`, `pode_redigir_ata()` →
   `public.confrades`. `is_membro_area()` já é o exemplo certo: compõe com `or`.
2. **Escape hatch entra por `or` no topo da expressão, nunca aninhada dentro de um `and`.**
   A forma correta é `(regra_normal) or (excecao)`, e não `regra_normal and (... or excecao)`.
3. **`using` e `with check` precisam ser conferidos como par.** `using` decide quem alcança
   a linha antiga; `with check`, quem pode ser autor da nova. Passar num e falhar no outro
   produz um update que falha pela metade — pior que falhar inteiro.
4. **Toda expressão de policy vira uma tabela-verdade explícita, uma linha por tipo de
   usuário real, antes do `db push`.** Para atas foram quatro: confrade comum, secretário,
   confrade `administrador` e moderador de `public.admins`. Escrever as quatro linhas é o
   que expôs o bug em um minuto — ler a expressão não expôs em nenhum.
5. **Quando a tela mostra ou esconde um botão, ela tem que perguntar EXATAMENTE a mesma
   função que a policy consulta.** Perguntar uma "parecida" é como o botão morto apareceu.
   Em `ata.html`, `podeEditarAgora()` hoje espelha `ata_aberta_para_edicao()` termo a termo,
   com o comentário dizendo que espelhar é o ponto.
6. **Comentário de policy descreve o que a expressão FAZ, não o que eu quis que ela
   fizesse.** Se não consigo escrever o comportamento sem usar a palavra "deveria", ainda
   não entendi a expressão.

---

## Valor derivado que sobrevive à fonte vira mentira gravada

**2026-09-22 · Movimento de Caixa (migração 025)**

Os nove campos de caixa da minuta passaram a ser DERIVADOS das 36 linhas do
Movimento de Caixa, e travados (`readOnly`) enquanto a folha tem algo escrito.
Com a folha em branco eles voltam a ser digitados — é o que mantém editável a
ata lavrada antes de a folha existir.

O defeito estava na TRANSIÇÃO de volta. Ao esvaziar a folha, os nove
destravavam **mantendo o último valor derivado**. Como `ataDaTela()` lê os nove
da tela quando a folha está vazia, a ata passaria a GRAVAR números que ninguém
digitou e cuja origem acabara de ser apagada. Nenhuma tela ficava vermelha:
os campos estavam preenchidos, os totais somavam, tudo parecia certo.

Achei rodando a tela de verdade no navegador — digitar 25 em "coleta" e ver o
total dizer 168,30, porque "outras fontes" guardava 143,30 de uma derivação que
não existia mais. O teste estático não pegaria: cada função, isolada, estava
correta.

**Regras preventivas.**
1. **Campo derivado que volta a ser editável precisa ser LIMPO, não herdado.**
   O valor derivado é uma projeção da fonte; sem a fonte ele não é um valor
   inicial razoável, é um resíduo que se apresenta como dado.
2. **Toda ligação derivado ↔ digitado tem DUAS transições, e a de volta é a que
   esquece.** Ao escrever a de ida, escrever a de volta na mesma função — e
   guardar o estado anterior (aqui, `derivandoCaixa`), porque "está vazio agora"
   não distingue "sempre esteve" de "acabou de esvaziar".
3. **Perguntar de cada campo da tela: se isto for salvo, quem afirmou este
   número?** Se a resposta for "ninguém, sobrou", o campo está errado mesmo que
   a aritmética esteja certa.
4. **Estado de transição só aparece exercitando a tela.** Verificação estática
   e render em Node provaram as 36 linhas, a aritmética e o XML — e passaram
   por cima deste defeito. Tela com dublê de rede (servidor local + dublês de
   `supabase-client`/`area-vicentino`/`ui-comum`) custa pouco e é onde ele
   apareceu.

**Nota de ambiente.** O heredoc `<<'PY'` do Bash **não preservou `\n`** ao
chegar no Python: a busca por uma string contendo `\n` literal não casou e o
`assert` morreu sem explicar. Para casar texto com barra invertida, usar a
ferramenta Edit (que recebe a string literal) em vez de heredoc.

---

## RLS escolhe linhas; GRANT escolhe colunas — e o autosserviço precisa dos dois

**2026-09-22 · autosserviço de cadastro (migração 027)**

Para deixar o confrade corrigir o próprio nome, a policy óbvia é

```sql
for update using (user_id = auth.uid())
```

e ela é uma **escalação de privilégio**. Com o `grant update` na tabela inteira,
qualquer confrade roda, no console do navegador,

```js
sb.from('confrades').update({ papel: 'administrador' }).eq('user_id', meuId)
```

— a linha é dele, a policy passa, e ele acabou de se eleger. `papel` é o que
decide quem lavra ata e quem lança dinheiro.

A trava certa é `grant update (nome_completo) on confrades to authenticated`:
o Postgres confere privilégio de coluna contra a lista do `SET` e recusa antes
de consultar a policy. As duas camadas são necessárias e nenhuma substitui a
outra — o grant diz QUAIS COLUNAS, a policy diz QUAIS LINHAS.

**Regras preventivas.**
1. **Toda vez que um usuário comum ganhar UPDATE numa tabela que também guarda
   autorização, o grant é de COLUNA.** A pergunta é "quais colunas?", nunca
   "qual linha?".
2. **Testar a escalação de propósito**, e testar também a coluna proibida **de
   carona junto com a permitida, no mesmo comando** — é o caso que passaria se
   o privilégio fosse por linha.
3. **Ação de autosserviço tira o alvo do JWT, nunca do corpo.** Sem senha e sem
   confirmação por e-mail, um `user_id` no corpo é permissão para trocar o
   login de qualquer outro. Testar mandando o corpo envenenado.
4. **Lista de permissão explícita para o portão por ação.** Ação fora da lista
   cai no portão de administrador — inclusive a desconhecida e a que alguém
   acrescentar depois sem ler o comentário.

## SDK que achata erro esconde a causa; o endpoint cru não

Mesma sessão. E-mail duplicado respondia "não foi possível trocar o e-mail" em
vez de "já existe uma conta com este e-mail". Duas tentativas de casar frases
na mensagem falharam.

Sonda direta ao endpoint mostrou por quê: o GoTrue devolve
`{"code":"23505","message":"duplicate key value violates unique constraint
\"users_email_partial_key\"","detail":"... already exists."}` — e
`supabase.auth.admin.updateUserById()` achatava isso em algo sem o código e sem
o `detail`. Trocado o SDK por `fetch` no endpoint: `23505` é sinal exato.

**Regras preventivas.**
1. **Antes de adivinhar a frase de erro de um serviço, medir a resposta CRUA**
   com uma sonda descartável. Duas rodadas de deploy-e-testar custaram mais que
   a sonda de trinta segundos.
2. **Quando classificar o erro faz parte do comportamento** (mensagem diferente
   na tela), não passar por camada que reempacota o erro. Código de erro
   estável > texto de mensagem.
3. **Teste de caminho infeliz é teste de primeira classe.** O caminho feliz
   passou nas duas rodadas; quem pegou o defeito foi a asserção de que o e-mail
   duplicado responde `email_ja_cadastrado`.

## Fundir uma ação de API abre janela entre o deploy do backend e o do front

`atualizar_categoria` foi fundida em `atualizar_confrade` horas depois de
publicada. Entre implantar a function e dar push no front, a produção chamava
uma ação que já não existia. Foi assumido conscientemente (o seletor tinha
horas de vida e ninguém o usara), mas é dívida.

**Regra preventiva.** Renomear ou fundir ação de API tem duas ordens seguras:
manter a ação antiga como apelido da nova por um deploy, **ou** combinar a
janela com o usuário antes. Nunca deduzir que "ninguém está usando".
