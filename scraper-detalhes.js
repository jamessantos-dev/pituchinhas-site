/**
 * SCRAPER DETALHES BELLIKIDS — fotos + tamanhos por produto
 *
 * Como usar:
 * 1. Abra https://www.bellikids.com.br no Chrome
 * 2. F12 → Console → digite "permitir colar" + Enter (se pedir)
 * 3. Cole este código e pressione Enter
 * 4. Aguarde (~2-4 horas para todos os produtos)
 *    - A cada 100 produtos um checkpoint é copiado automaticamente
 *    - Ao final, o JSON completo é copiado para a área de transferência
 * 5. Cole o resultado no arquivo produtos-completos.json
 */

(async function scraperDetalhes() {

  const PRODUTOS_JSON_URL = 'https://raw.githubusercontent.com/jamessantos-dev/pituchinhas-site/master/produtos.json';
  const TIMEOUT_PAGINA    = 12000; // ms aguardando onload
  const ESPERA_RENDER     = 2500;  // ms após load para JS da página rodar
  const CHECKPOINT_A_CADA = 100;   // salva checkpoint a cada N produtos

  // ─── Carrega lista de produtos ────────────────────────────────────────────
  console.log('📥 Carregando lista de produtos...');
  let produtos;
  try {
    const resp = await fetch(PRODUTOS_JSON_URL);
    produtos = await resp.json();
    console.log(`✅ ${produtos.length} produtos carregados.`);
  } catch (e) {
    console.error('❌ Erro ao carregar produtos.json:', e);
    return;
  }

  // ─── Iframe reutilizável ──────────────────────────────────────────────────
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:960px;height:700px;opacity:0.04;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);

  function carregarPagina(url) {
    return new Promise(resolve => {
      let resolvido = false;
      const done = () => { if (!resolvido) { resolvido = true; resolve(); } };
      const fallback = setTimeout(done, TIMEOUT_PAGINA);
      iframe.onload = () => { clearTimeout(fallback); setTimeout(done, ESPERA_RENDER); };
      iframe.src = url;
    });
  }

  // ─── Extratores ───────────────────────────────────────────────────────────

  function extrairImagens(doc) {
    const urls = new Set();

    // Thumbnails da galeria (geralmente em lista lateral ou carrossel)
    const seletoresThumb = [
      '.fotos-produto img',
      '.galeria img',
      '.produto-fotos img',
      '[class*="thumb"] img',
      '[class*="gallery"] img',
      '[class*="foto"] img',
      '.slick-slide img',
      '.owl-item img',
    ];
    for (const sel of seletoresThumb) {
      doc.querySelectorAll(sel).forEach(img => {
        const src = melhorSrc(img);
        if (src) urls.add(src);
      });
    }

    // Fallback: todas as imgs do CDN na página
    if (urls.size === 0) {
      doc.querySelectorAll('img').forEach(img => {
        const src = melhorSrc(img);
        if (src) urls.add(src);
      });
    }

    return [...urls];
  }

  function melhorSrc(img) {
    const attrs = ['data-zoom-image', 'data-src', 'data-lazy-src', 'data-original', 'src'];
    for (const attr of attrs) {
      const val = img.getAttribute(attr) || '';
      if (
        val.includes('cdn.awsli') &&
        !val.includes('--PRODUTO') &&
        !val.includes('loading') &&
        !val.includes('placeholder')
      ) {
        // Normaliza para 600x600
        return val.replace(/\/\d+x\d+\//, '/600x600/');
      }
    }
    return null;
  }

  function extrairTamanhos(doc) {
    const tamanhos = [];

    // Tenta seletores específicos de tamanho
    const seletores = [
      '.tamanhos button',
      '.tamanhos span',
      '.tamanhos li',
      '[class*="tamanho"] button',
      '[class*="tamanho"] span',
      '[class*="variacao"] button',
      '[class*="variacao"] span',
      '[class*="size"] button',
      '[class*="size"] span',
      'ul.variacoes li',
      '.opcoes-produto button',
    ];

    for (const sel of seletores) {
      const els = doc.querySelectorAll(sel);
      if (els.length > 0) {
        els.forEach(el => {
          // Verifica se não está esgotado (procura ícone de X ou classe disabled)
          const esgotado =
            el.classList.contains('esgotado') ||
            el.classList.contains('disabled') ||
            el.classList.contains('indisponivel') ||
            el.querySelector('[class*="esgotado"]') ||
            el.querySelector('[class*="indisponivel"]') ||
            el.querySelector('img[src*="esgotado"]') ||
            el.style.textDecoration === 'line-through' ||
            el.getAttribute('disabled') !== null;

          const texto = el.textContent.trim();
          if (texto && texto.length <= 6) {
            tamanhos.push({ tamanho: texto, disponivel: !esgotado });
          }
        });
        if (tamanhos.length > 0) break;
      }
    }

    return tamanhos;
  }

  // ─── Helpers de log ───────────────────────────────────────────────────────

  function formatarTempo(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return `${m}m${r}s`;
    return `${Math.floor(m/60)}h${m%60}m`;
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Loop principal ───────────────────────────────────────────────────────

  console.log('\n🚀 Iniciando extração de detalhes...');
  console.log('⏱  Estimativa: ~2-4 horas para ' + produtos.length + ' produtos\n');

  const inicio     = Date.now();
  const resultados = [];
  let erros        = 0;

  for (let i = 0; i < produtos.length; i++) {
    const p   = produtos[i];
    const num = i + 1;

    await carregarPagina(p.url);

    const doc = iframe.contentDocument;
    let imagens  = [];
    let tamanhos = [];

    if (doc) {
      imagens  = extrairImagens(doc);
      tamanhos = extrairTamanhos(doc);
      if (imagens.length === 0) erros++;
    } else {
      erros++;
    }

    // Garante que a imagem do listing sempre esteja incluída (fallback)
    if (p.imagem && !imagens.includes(p.imagem)) {
      imagens.unshift(p.imagem);
    }

    resultados.push({
      nome:      p.nome,
      imagens,                   // array de todas as fotos
      imagem:    imagens[0] || p.imagem,  // compatibilidade com versão anterior
      url:       p.url,
      categoria: p.categoria,
      genero:    p.genero,
      tamanhos,                  // [{ tamanho: "4", disponivel: true }, ...]
    });

    // Log de progresso
    const decorrido = Date.now() - inicio;
    const porProd   = decorrido / num;
    const restantes = (produtos.length - num) * porProd;
    const pct       = ((num / produtos.length) * 100).toFixed(1);

    if (num % 10 === 0 || num === 1) {
      console.log(`[${num}/${produtos.length}] ${pct}% | ⏱ restante: ~${formatarTempo(restantes)} | ❌ sem foto: ${erros} | 📸 última: ${imagens.length} fotos, 📏 ${tamanhos.length} tamanhos — ${p.nome.slice(0,40)}`);
    }

    // Checkpoint a cada N produtos
    if (num % CHECKPOINT_A_CADA === 0) {
      const ckpt = JSON.stringify(resultados, null, 2);
      const ok   = await copiar(ckpt);
      console.log(`\n💾 CHECKPOINT ${num} produtos — ${ok ? 'copiado ✅' : 'falhou ao copiar, veja abaixo ⬇️'}`);
      if (!ok) console.log(ckpt);
      console.log('');
    }
  }

  iframe.remove();

  // ─── Resultado final ──────────────────────────────────────────────────────
  const tempo = formatarTempo(Date.now() - inicio);
  console.log(`\n✅ CONCLUÍDO em ${tempo}`);
  console.log(`   Produtos: ${resultados.length}`);
  console.log(`   Sem foto:  ${erros}`);
  console.log(`   Com múltiplas fotos: ${resultados.filter(p => p.imagens.length > 1).length}`);
  console.log(`   Com tamanhos: ${resultados.filter(p => p.tamanhos.length > 0).length}`);

  const json = JSON.stringify(resultados, null, 2);
  const ok   = await copiar(json);
  console.log(ok
    ? '\n📋 JSON completo copiado! Salve como produtos-completos.json'
    : '\n⚠️  Não foi possível copiar automaticamente. Rode:\n   copy(window._produtosCompletos)'
  );
  window._produtosCompletos = resultados;
  return resultados;

})();
