/**
 * SCRAPER DETALHES BELLIKIDS v2 — fotos + tamanhos + cores
 * Correção: gerenciamento de memória + retomada de checkpoint
 *
 * Como usar (primeira vez):
 *   Cole no console do Chrome em https://www.bellikids.com.br
 *
 * Como retomar após crash (colando checkpoint salvo):
 *   1. Coloque o JSON do checkpoint em window._checkpoint antes de rodar:
 *      window._checkpoint = { inicio: 300, dados: [...] }  ← cole o objeto do checkpoint
 *   2. Depois cole o scraper normalmente
 */

(async function scraperDetalhes() {

  const PRODUTOS_JSON_URL = 'https://raw.githubusercontent.com/jamessantos-dev/pituchinhas-site/master/produtos.json';
  const TIMEOUT_PAGINA    = 10000; // ms máximo aguardando onload
  const ESPERA_RENDER     = 1800;  // ms após load para JS renderizar
  const ESPERA_LIMPAR     = 400;   // ms aguardando about:blank limpar
  const CHECKPOINT_A_CADA = 50;    // salva a cada N produtos (mais frequente)
  const RECRIAR_IFRAME    = 50;    // recria iframe a cada N para liberar memória

  // ─── Retomada de checkpoint ───────────────────────────────────────────────
  const ckpt       = window._checkpoint || null;
  const INICIO_EM  = ckpt ? ckpt.inicio : 0;
  const resultados = ckpt ? ckpt.dados  : [];

  if (ckpt) {
    console.log(`♻️  Retomando do produto ${INICIO_EM} (${resultados.length} já processados)`);
  }

  // ─── Carrega lista de produtos ────────────────────────────────────────────
  console.log('📥 Carregando lista de produtos...');
  let produtos;
  try {
    const resp = await fetch(PRODUTOS_JSON_URL);
    produtos = await resp.json();
    console.log(`✅ ${produtos.length} produtos. Processando a partir do #${INICIO_EM + 1}\n`);
  } catch (e) {
    console.error('❌ Erro ao carregar produtos.json:', e);
    return;
  }

  // ─── Gerenciamento do iframe ──────────────────────────────────────────────
  let iframe = null;

  function criarIframe() {
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:960px;height:700px;opacity:0.03;pointer-events:none;z-index:-1;';
    document.body.appendChild(iframe);
  }

  async function limparIframe() {
    iframe.src = 'about:blank';
    await new Promise(r => setTimeout(r, ESPERA_LIMPAR));
  }

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

  function melhorSrc(img) {
    for (const attr of ['data-zoom-image', 'data-src', 'data-lazy-src', 'data-original', 'src']) {
      const val = img.getAttribute(attr) || '';
      if (val.includes('cdn.awsli') && !val.includes('--PRODUTO') && !val.includes('loading') && !val.includes('placeholder')) {
        return val.replace(/\/\d+x\d+\//, '/600x600/');
      }
    }
    return null;
  }

  function extrairImagens(doc) {
    const urls = new Set();
    const seletores = [
      '.fotos-produto img', '.galeria img', '.produto-fotos img',
      '[class*="thumb"] img', '[class*="gallery"] img', '[class*="foto"] img',
      '.slick-slide img', '.owl-item img',
    ];
    for (const sel of seletores) {
      doc.querySelectorAll(sel).forEach(img => { const s = melhorSrc(img); if (s) urls.add(s); });
    }
    if (urls.size === 0) {
      doc.querySelectorAll('img').forEach(img => { const s = melhorSrc(img); if (s) urls.add(s); });
    }
    return [...urls];
  }

  function estaEsgotado(el) {
    if (
      el.classList.contains('esgotado')     ||
      el.classList.contains('disabled')     ||
      el.classList.contains('indisponivel') ||
      el.classList.contains('sold-out')     ||
      el.getAttribute('disabled') !== null  ||
      el.style.textDecoration === 'line-through'
    ) return true;

    const filho = el.querySelector(
      '[class*="esgotado"], [class*="indisponivel"], [class*="sold-out"], ' +
      '[class*="unavailable"], img[src*="esgotado"], img[src*="indisponivel"], ' +
      'img[src*="nao-disponivel"], [class*="risco"], [class*="strike"]'
    );
    if (filho) return true;

    for (const img of el.querySelectorAll('img')) {
      const src = (img.getAttribute('src') || '').toLowerCase();
      if (src.includes('esgot') || src.includes('indis') || src.includes('nao-disp')) return true;
    }
    return false;
  }

  function extrairTamanhos(doc) {
    const tamanhos = [];
    const seletores = [
      '.tamanhos button', '.tamanhos span', '.tamanhos li',
      '[class*="tamanho"] button', '[class*="tamanho"] span',
      '[class*="variacao"] button', '[class*="variacao"] span',
      '[class*="size"] button', '[class*="size"] span',
      'ul.variacoes li', '.opcoes-produto button',
    ];
    for (const sel of seletores) {
      const els = doc.querySelectorAll(sel);
      if (!els.length) continue;
      els.forEach(el => {
        const texto = el.textContent.trim().replace(/\s+/g, ' ');
        if (!texto || texto.length > 5) return;
        tamanhos.push({ tamanho: texto, disponivel: !estaEsgotado(el) });
      });
      if (tamanhos.length) break;
    }
    return tamanhos;
  }

  function extrairCores(doc) {
    const cores = [];
    const seletores = [
      '[class*="cor"] button', '[class*="cor"] span', '[class*="cor"] li',
      '[class*="color"] button', '[class*="color"] span', '[class*="cores"] li',
    ];
    for (const sel of seletores) {
      const els = doc.querySelectorAll(sel);
      if (!els.length) continue;
      els.forEach(el => {
        const nome =
          el.getAttribute('title') ||
          el.getAttribute('aria-label') ||
          el.querySelector('img')?.getAttribute('alt') ||
          el.textContent.trim();
        if (!nome || nome.length > 40) return;
        const corCSS = el.style.backgroundColor || el.style.background || '';
        const swatchImg = el.querySelector('img');
        cores.push({
          nome:       nome.trim(),
          cor:        corCSS || null,
          swatch:     swatchImg ? (swatchImg.getAttribute('src') || null) : null,
          disponivel: !estaEsgotado(el),
        });
      });
      if (cores.length) break;
    }
    return cores;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function formatarTempo(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m${s % 60}s`;
    return `${Math.floor(m / 60)}h${m % 60}m`;
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
  }

  async function salvarCheckpoint(indiceAtual) {
    const ckptObj = { inicio: indiceAtual, dados: resultados };
    const json    = JSON.stringify(ckptObj);
    const ok      = await copiar(json);
    const msg = ok
      ? `💾 CHECKPOINT ${indiceAtual} produtos — copiado ✅ (cole em window._checkpoint para retomar)`
      : `💾 CHECKPOINT ${indiceAtual} — falha ao copiar, rode: copy(JSON.stringify({inicio:${indiceAtual},dados:window._scraperDados}))`;
    console.log(msg);
    window._scraperDados = resultados; // backup acessível no console
  }

  // ─── Loop principal ───────────────────────────────────────────────────────

  console.log('🚀 Iniciando extração de detalhes...');
  criarIframe();

  const inicio = Date.now();
  let erros    = 0;

  for (let i = INICIO_EM; i < produtos.length; i++) {
    const p   = produtos[i];
    const num = i + 1;

    // Recria iframe a cada N produtos para liberar memória
    if ((i - INICIO_EM) > 0 && (i - INICIO_EM) % RECRIAR_IFRAME === 0) {
      console.log(`🔄 Recriando iframe para liberar memória...`);
      criarIframe();
      await new Promise(r => setTimeout(r, 800));
    }

    await carregarPagina(p.url);

    const doc = iframe.contentDocument;
    let imagens = [], tamanhos = [], cores = [];

    if (doc) {
      imagens  = extrairImagens(doc);
      tamanhos = extrairTamanhos(doc);
      cores    = extrairCores(doc);
      if (imagens.length === 0) erros++;
    } else {
      erros++;
    }

    // Garante imagem do listing como fallback
    if (p.imagem && !imagens.includes(p.imagem)) imagens.unshift(p.imagem);

    resultados.push({
      nome:      p.nome,
      imagens,
      imagem:    imagens[0] || p.imagem,
      url:       p.url,
      categoria: p.categoria,
      genero:    p.genero,
      tamanhos,
      cores,
    });

    // Limpa iframe imediatamente para liberar memória
    await limparIframe();

    // Log de progresso
    const decorrido = Date.now() - inicio;
    const porProd   = decorrido / (i - INICIO_EM + 1);
    const restantes = (produtos.length - num) * porProd;
    const pct       = ((num / produtos.length) * 100).toFixed(1);

    if (num % 10 === 0 || num === INICIO_EM + 1) {
      console.log(`[${num}/${produtos.length}] ${pct}% | ⏱ ~${formatarTempo(restantes)} | ❌${erros} | 📸${imagens.length} 📏${tamanhos.length}tam 🎨${cores.length}cor — ${p.nome.slice(0, 38)}`);
    }

    // Checkpoint
    if ((i - INICIO_EM + 1) % CHECKPOINT_A_CADA === 0) {
      await salvarCheckpoint(num);
    }
  }

  iframe.remove();

  // ─── Resultado final ──────────────────────────────────────────────────────
  const tempo = formatarTempo(Date.now() - inicio);
  console.log(`\n✅ CONCLUÍDO em ${tempo}`);
  console.log(`   Total: ${resultados.length} | Sem foto: ${erros}`);
  console.log(`   Com múltiplas fotos: ${resultados.filter(p => p.imagens.length > 1).length}`);
  console.log(`   Com tamanhos: ${resultados.filter(p => p.tamanhos.length > 0).length}`);
  console.log(`   Com cores: ${resultados.filter(p => p.cores.length > 0).length}`);

  window._scraperDados = resultados;
  const json = JSON.stringify(resultados, null, 2);
  const ok   = await copiar(json);
  console.log(ok
    ? '\n📋 JSON copiado! Salve como produtos-completos.json'
    : '\n⚠️  Rode: copy(JSON.stringify(window._scraperDados, null, 2))'
  );

  return resultados;
})();
