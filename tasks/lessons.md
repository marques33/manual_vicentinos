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

**Também aprendido nesta tarefa (menor).** A porta 8000 desta máquina está ocupada por um
servidor `waitress` que redireciona para https, o que faz o Playwright falhar com
`ERR_TIMED_OUT` — um erro que não sugere "porta ocupada". Servir a partir de uma porta livre
escolhida pelo sistema (`porta 0`) dentro do próprio script de verificação elimina a classe
inteira de problema.
