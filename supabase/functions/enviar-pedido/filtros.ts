// ============================================================================
// Filtros de conteúdo dos pedidos de oração.
//
// Separado do index.ts para poder ser revisado e ajustado por quem modera, sem
// mexer no fluxo da função. Duas categorias, de propósito:
//
//   BLOQUEIO  — estrutural e sem ambiguidade (link, e-mail, telefone, grito).
//               É o que faz spam e boato circularem; nunca é intenção de oração.
//   MARCAÇÃO  — vocabulário ofensivo. NÃO derruba o pedido: grava um aviso para
//               o moderador olhar primeiro. Como tudo passa por aprovação, um
//               falso positivo aqui não silencia ninguém — só muda a ordem da
//               fila. Bloquear calado, isso sim, silenciaria.
// ============================================================================

/** Minúsculas, sem acento, sem pontuação — para casar termo escrito "de leve". */
export function dobrar(texto: string): string {
  const trocaDigito: Record<string, string> = {
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  };
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // marcas de acentuação separadas pelo NFD
    .toLowerCase()
    .replace(/[0-9]/g, (d) => trocaDigito[d] ?? d)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Bloqueio estrutural
// ---------------------------------------------------------------------------

// A ordem importa: um e-mail contém um domínio, então a regra de e-mail vem
// antes da de link — senão "fulano@gmail.com" seria recusado com a mensagem
// errada ("não inclua links"), e quem escreveu não entenderia o que corrigir.
const PADROES_BLOQUEIO: Array<{ re: RegExp; erro: string; mensagem: string }> = [
  {
    re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    erro: "com_email",
    mensagem: "Não publique e-mails aqui. Se quiser que retornemos, use o campo de contato.",
  },
  {
    re: /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|me|ly|app|xyz|info|site|online)\b)/i,
    erro: "com_link",
    mensagem: "Não é possível incluir links no pedido. Escreva apenas a intenção.",
  },
  {
    // Telefone brasileiro em qualquer formatação usual (8 ou 9 dígitos, com ou
    // sem DDD e com os separadores de sempre).
    re: /(\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/,
    erro: "com_telefone",
    mensagem: "Não publique telefones aqui. Se quiser que retornemos, use o campo de contato.",
  },
];

/** Bloqueios que dependem da forma do texto, não de um padrão fixo. */
function bloqueiosDeForma(texto: string): { erro: string; mensagem: string } | null {
  const letras = texto.replace(/[^\p{L}]/gu, "");
  if (letras.length >= 12) {
    const maiusculas = (texto.match(/\p{Lu}/gu) ?? []).length;
    if (maiusculas / letras.length > 0.4) {
      return {
        erro: "muito_caixa_alta",
        mensagem: "Escreva em letras normais, por favor — texto todo em maiúsculas parece grito.",
      };
    }
  }

  if (/(.)\1{5,}/u.test(texto)) {
    return {
      erro: "repeticao",
      mensagem: "Há caracteres repetidos demais. Reescreva o pedido, por favor.",
    };
  }

  // Uma palavra só, coladinha e enorme: em geral é lixo automático.
  if (/\S{45,}/.test(texto)) {
    return {
      erro: "palavra_longa",
      mensagem: "Há uma sequência muito longa sem espaços. Reescreva o pedido, por favor.",
    };
  }

  const palavras = dobrar(texto).split(" ").filter(Boolean);
  if (palavras.length >= 8 && new Set(palavras).size / palavras.length < 0.35) {
    return {
      erro: "repeticao",
      mensagem: "O texto repete as mesmas palavras. Reescreva o pedido, por favor.",
    };
  }

  return null;
}

export function verificarBloqueio(texto: string): { erro: string; mensagem: string } | null {
  for (const { re, erro, mensagem } of PADROES_BLOQUEIO) {
    if (re.test(texto)) return { erro, mensagem };
  }
  return bloqueiosDeForma(texto);
}

// ---------------------------------------------------------------------------
// Marcação para o moderador
//
// Lista curta e editável de propósito. Não tenta ser um moderador automático —
// só puxa para o topo da fila o que merece um olhar antes.
// ---------------------------------------------------------------------------

const TERMOS_MARCACAO: Record<string, string[]> = {
  "linguagem ofensiva": [
    "porra", "caralho", "buceta", "foder", "fodase", "puta", "putaria",
    "merda", "cuzao", "otario", "babaca", "arrombado", "desgraca",
    "vagabunda", "piranha", "corno", "escroto", "imbecil", "idiota",
  ],
  "ódio ou discriminação": [
    "viado", "bicha", "sapatao", "traveco", "macaco imundo", "preto imundo",
    "nazista", "hitler", "morte aos", "morram", "exterminar",
    "volta pro teu pais", "raca inferior",
  ],
  "violência ou ameaça": [
    "matar", "assassinar", "vou te pegar", "arrebentar", "espancar",
    "acabar com a vida", "queimar a casa",
  ],
  "possível conteúdo político ou boato": [
    "eleicao", "candidato", "vote", "urna", "fraude nas urnas", "esquerdista",
    "direitista", "comunista", "fake news", "midia mente", "acorda povo",
    "compartilhe antes que apaguem", "repasse para todos",
  ],
  "possível pedido de dinheiro": [
    "pix", "chave pix", "deposita", "transferencia", "conta bancaria",
    "emprestimo", "vaquinha",
  ],
};

/**
 * Devolve os motivos encontrados, ou null. O casamento é por palavra inteira
 * sobre o texto "dobrado", para que "MATAR" e "m4tar" caiam no mesmo lugar — e
 * para que "matariam" ou "Matarazzo" não caiam.
 */
export function marcacoesDeConteudo(texto: string): string | null {
  const alvo = ` ${dobrar(texto)} `;
  const motivos = new Set<string>();

  for (const [motivo, termos] of Object.entries(TERMOS_MARCACAO)) {
    for (const termo of termos) {
      if (alvo.includes(` ${dobrar(termo)} `)) {
        motivos.add(motivo);
        break;
      }
    }
  }

  return motivos.size ? [...motivos].join("; ") : null;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Tira invisíveis e controles e unifica espaços.
 *
 * `\p{Cf}` cobre os caracteres de formatação invisíveis — largura zero, marcas
 * de direção, BOM. São o truque padrão para esconder um texto dentro de outro
 * que parece inocente, e não têm uso legítimo num pedido de oração.
 * `\p{Cc}` cobre os controles C0/C1; a quebra de linha é preservada à mão.
 */
export function normalizar(entrada: unknown, limite: number): string {
  if (typeof entrada !== "string") return "";
  return entrada
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cf}/gu, "")
    .replace(/[^\S\n]+/gu, " ") // tabulação, espaço rígido e afins → espaço simples
    .replace(/\p{Cc}/gu, (c) => (c === "\n" ? c : ""))
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limite);
}
