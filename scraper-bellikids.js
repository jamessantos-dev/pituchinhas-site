/**
 * SCRAPER BELLI KIDS v3 — seletores corretos (listagem-item + lazy img)
 *
 * Como usar:
 * 1. Abra https://www.bellikids.com.br no Chrome
 * 2. F12 → Console → digite "permitir colar" + Enter
 * 3. Cole este código e pressione Enter
 * 4. Aguarde (~10-15 minutos para todas as categorias)
 * 5. Quando aparecer ✅, JSON foi copiado. Cole no chat do Claude.
 */

(async function scraperV3() {

  const CATEGORIAS = [
    { url: '/tematicos',                          nome: 'Temáticos',           genero: 'feminino'  },
    { url: '/categoria/fantasia.html',             nome: 'Fantasia',            genero: 'ambos'     },
    { url: '/categoria/jardim-encantado',          nome: 'Jardim Encantado',    genero: 'feminino'  },
    { url: '/categoria/batizado.html',             nome: 'Batizado & Social',   genero: 'ambos'     },
    { url: '/conjuntos-meninos',                   nome: 'Conjuntos Meninos',   genero: 'masculino' },
    { url: '/conjuntos-meninas',                   nome: 'Conjuntos Meninas',   genero: 'feminino'  },
    { url: '/categoria/vestidos-longosdamas.html', nome: 'Longos & Damas',      genero: 'feminino'  },
    { url: '/categoria/daminha-e-pagem.html',      nome: 'Daminha & Pajem',     genero: 'ambos'     },
    { url: '/boiadeira',                           nome: 'Boiadeira',           genero: 'ambos'     },
    { url: '/categoria/juninos.html',              nome: 'Juninos',             genero: 'ambos'     },
    { url: '/juninos-linha-luxo',                  nome: 'Juninos Luxo',        genero: 'ambos'     },
    { url: '/categoria/moda-verao',                nome: 'Moda Verão',          genero: 'feminino'  },
    { url: '/categoria/meninos.html',              nome: 'Meninos',             genero: 'masculino' },
    { url: '/colecao-atelie',                      nome: 'Coleção Ateliê',      genero: 'feminino'  },
    { url: '/categoria/vestidos-4-ao-18.html',     nome: 'Vestidos 4 ao 18',    genero: 'feminino'  },
    { url: '/vestidos-p-m-g-bebe',                 nome: 'Vestidos Bebê PMG',   genero: 'feminino'  },
    { url: '/vestidos-1-ao-4-baby',                nome: 'Vestidos Baby 1-4',   genero: 'feminino'  },
    { url: '/categoria/calcados.html',             nome: 'Calçados',            genero: 'ambos'     },
    { url: '/casacos',                             nome: 'Casacos & Inverno',   genero: 'ambos'     },
    { url: '/categoria/conjuntos-inverno.html',    nome: 'Conjuntos Inverno',   genero: 'ambos'     },
    { url: '/categoria/tendencias',                nome: 'Tendências',          genero: 'feminino'  },
  ];

  // Extrai a melhor URL de imagem de um elemento img (suporta lazy loading)
  function getSrc(img) {
    const attrs = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'src'];
    for (const attr of attrs) {
      const val = img.getAttribute(attr) || '';
      if (val.includes('cdn.awsli') && !val.includes('--PRODUTO') && !val.includes('loading')) {
        return val;
      }
    }
    return null;
  }

  // Iframe reutilizável
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:900px;height:700px;opacity:0.01;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);

  function carregarPagina(url) {
    return new Promise((resolve) => {
      let resolvido = false;
      const done = () => { if (!resolvido) { resolvido = true; resolve(); } };

      // Timeout de segurança: se onload não disparar em 12s, continua mesmo assim
      const fallback = setTimeout(done, 12000);

      iframe.onload = () => {
        clearTimeout(fallback);
        setTimeout(done, 3000); // 3s para JS renderizar após load
      };
      iframe.src = url;
    });
  }

  function extrairProdutos(doc, cat) {
    const produtos = [];

    // Tenta diferentes seletores de card de produto
    const cards = doc.querySelectorAll('div.listagem-item, div.produto, li.produto, [class*="listagem-item"]');
    console.log(`    → ${cards.length} cards encontrados`);

    cards.forEach(card => {
      // Link do produto
      const link = card.querySelector('a[href]');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      if (!href || href === '#') return;
      const urlProduto = href.startsWith('http') ? href : 'https://www.bellikids.com.br' + href;

      // Nome do produto
      const nomeEl = card.querySelector('h2, h3, .prodTxt, [class*="prodTxt"], .nome-produto, .product-name');
      if (!nomeEl) return;
      const nome = nomeEl.textContent.trim();
      if (!nome) return;

      // Imagem do produto (suporta lazy loading)
      const imgEl = card.querySelector('img');
      let imagem = null;
      if (imgEl) {
        imagem = getSrc(imgEl);
      }
      // Se não achou img válida, tenta background-image
      if (!imagem) {
        const divImg = card.querySelector('[class*="imagem"], [class*="foto"], [style*="background"]');
        if (divImg) {
          const bg = divImg.style.backgroundImage || '';
          const m = bg.match(/url\(['"]?(https?[^'"]+)['"]?\)/);
          if (m && m[1].includes('cdn.awsli')) imagem = m[1];
        }
      }

      // Monta o produto (sem imagem também vai — pode ter placeholder bonito)
      if (imagem) {
        imagem = imagem.replace(/\/\d+x\d+\//, '/600x600/');
      }

      produtos.push({
        nome,
        imagem: imagem || null,
        url:    urlProduto,
        categoria: cat.nome,
        genero:    cat.genero,
      });
    });

    return produtos;
  }

  function proximaPagina(doc) {
    const seletores = [
      'a.proxima',
      'a[rel="next"]',
      '.paginacao a[title="Próxima"]',
      '.pagination a[title="Próxima"]',
      'li.next a',
      'a[aria-label="Next"]',
    ];
    for (const sel of seletores) {
      const el = doc.querySelector(sel);
      if (el && el.href) return el.href;
    }
    return null;
  }

  async function buscarCategoria(cat) {
    console.log(`\n📦 ${cat.nome}`);
    let url   = 'https://www.bellikids.com.br' + cat.url;
    let todos = [];
    let pag   = 1;

    while (url && pag <= 25) {
      await carregarPagina(url);
      const doc      = iframe.contentDocument;
      if (!doc) { console.log('  ❌ iframe sem acesso'); break; }

      const produtos = extrairProdutos(doc, cat);
      todos.push(...produtos);
      console.log(`  Pág ${pag}: ${produtos.length} produtos`);

      const prox = proximaPagina(doc);
      url = (prox && prox !== url) ? prox : null;
      pag++;
    }

    return todos;
  }

  // MAIN
  console.log('🚀 Scraper v3 iniciado...\n');
  const inicio = Date.now();
  const todos  = [];

  for (const cat of CATEGORIAS) {
    const produtos = await buscarCategoria(cat);
    todos.push(...produtos);
  }

  iframe.remove();

  const unicos = [...new Map(todos.map(p => [p.url, p])).values()];
  const tempo  = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n✅ Concluído em ${tempo}s — ${unicos.length} produtos únicos`);

  const json = JSON.stringify(unicos, null, 2);

  try {
    await navigator.clipboard.writeText(json);
    console.log('📋 JSON copiado! Cole no chat do Claude.');
  } catch (e) {
    console.log('\n⚠️ Copie manualmente (clique no objeto abaixo e Ctrl+C):');
    console.log(json);
  }

  return unicos;
})();
