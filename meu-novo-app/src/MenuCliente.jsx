import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// --- CONFIGURAÇÃO DE PRAZOS V.I.R.T.U.S ---
const LIMITES_HORARIO = {
  0: "13:00", // Domingo
  1: "18:00", // Segunda
  2: "18:00", // Terça
  3: "14:00", // Quarta
  4: "18:00", // Quinta
  5: "18:00", // Sexta
  6: null,    // Sábado (Não tem envio)
  feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  const isEscuro = tema === 'escuro';
  const lastScrollY = useRef(0);

  // --- DESIGN ORIGINAL RESTAURADO ---
  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      primaria: '#f97316',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9',
      sucesso: '#22c55e',
      alerta: '#ef4444'
    },
    cards: { 
      raioBorda: '16px', 
      sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.03)'
    }
  };

  // --- ESTADOS DE DADOS ---
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => JSON.parse(localStorage.getItem('carrinho_virtus') || '[]'));
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  
  // --- ESTADOS DE UI & TRAVAS ---
  const [showFixedSearch, setShowFixedSearch] = useState(true);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- ORDEM DAS ABAS SOLICITADA ---
  const categoriasDinamicas = [
    'DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', 
    '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', 
    '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA', '⭐ LISTA PADRÃO'
  ];

  // --- NORMALIZAÇÃO DE BUSCA (IGNORA ACENTOS/ESPAÇOS) ---
  const normalizar = (t) => t?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "") || "";

  // --- LÓGICA DE SCROLL (BUSCA SUTIL) ---
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > lastScrollY.current && window.scrollY > 80) setShowFixedSearch(false);
      else setShowFixedSearch(true);
      lastScrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- SINCRONIZAÇÃO V.I.R.T.U.S ---
  const sincronizar = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);
    setIsFeriadoMarcado(config.is_feriado);

    // Lógica de Horários
    const agora = new Date();
    const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay();
    let limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

    if (config.nao_funciona || limiteStr === null) {
      setBloqueioAtivo(true);
      setTempoRestante("SISTEMA FECHADO");
    } else {
      const [h, m] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(h, m, 0);
      const diffMs = dataLimite - agora;

      if (dataEfetiva === new Date().toLocaleDateString('en-CA') && diffMs <= 0) {
        setBloqueioAtivo(true);
        setTempoRestante("PRAZO ENCERRADO");
      } else {
        setBloqueioAtivo(false);
        if (diffMs > 0 && diffMs < 21600000) {
          const dMin = Math.floor(diffMs / 60000);
          setTempoRestante(`${Math.floor(dMin/60)}h ${dMin%60}min`);
          if (dMin <= 30 && !notificou30min) {
             if (Notification.permission === "granted") new Notification("V.I.R.T.U.S", { body: "Faltam 30 min para o fim do prazo!" });
             setNotificou30min(true);
          }
        }
      }
    }

    // Carregar Banners, Produtos e Pedidos
    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
      const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
      setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
    }
    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);
    const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [codLoja, notificou30min]);

  useEffect(() => { sincronizar(); }, [sincronizar]);

  // --- WHATSAPP ---
  const copiarParaWhatsapp = () => {
    let txt = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• *${i.quantidade}x* ${i.nome_produto}\n`);
    txt += `---\n_V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  // --- REVISÃO LISTA PADRÃO ---
  const abrirRevisao = () => {
    const itensPadrao = produtos.filter(p => p.lista_padrao && p.status_cotacao !== 'falta');
    const esquecidos = itensPadrao.filter(p => !carrinho.some(c => c.id === p.id));
    if (esquecidos.length > 0) {
      const nomes = esquecidos.map(i => `- ${i.nome}`).join('\n');
      if (!window.confirm(`⚠️ ITENS DA LISTA PADRÃO AUSENTES:\n\n${nomes}\n\nDeseja enviar assim mesmo?`)) {
        setCategoriaAtiva('⭐ LISTA PADRÃO');
        setModalCarrinhoAberto(false);
        return;
      }
    }
    setModalRevisaoAberto(true);
  };

  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh' }}>
        <h2 style={{color: configDesign.cores.textoForte}}>⏳ Aguardando Preços</h2>
        <p style={{color: configDesign.cores.textoSuave}}>{new Date(hoje).toLocaleDateString('pt-BR')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif' }}>
      
      {/* BUSCA FIXA DISCRETA */}
      {categoriaAtiva !== 'DESTAQUES' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100, padding: '10px 20px', opacity: showFixedSearch ? 1 : 0, transition: '0.4s', transform: showFixedSearch ? 'translateY(0)' : 'translateY(-20px)' }}>
          <div style={{ background: configDesign.cores.fundoCards, borderRadius: '30px', padding: '10px 20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', display: 'flex', gap: '10px', border: `1px solid ${configDesign.cores.borda}` }}>
            <span>🔍</span><input value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} placeholder="Pesquisar..." style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none' }} />
          </div>
        </div>
      )}

      {/* HEADER DE STATUS */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>⏳ PRAZO: {tempoRestante}</div>
      )}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>🚩 FERIADO: Limite às 13:00</div>
      )}

      {/* RENDERIZAÇÃO DO PEDIDO ENVIADO */}
      {listaEnviadaHoje && !modoVisualizacao ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '30px' }}><h2>✅ PEDIDO RECEBIDO!</h2></div>
          <button onClick={copiarParaWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>💬 WHATSAPP</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ color: configDesign.cores.textoSuave, textDecoration: 'underline', border: 'none', background: 'none', marginTop: '20px' }}>VISUALIZAR CATÁLOGO</button>
        </div>
      ) : (
        <>
          {/* BANNERS ORIGINAIS */}
          {categoriaAtiva === 'DESTAQUES' && (
            <div>
              <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '0 20px', marginTop: '-40px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundColor: '#fff' }} />
              </div>
              <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
              <div style={{ padding: '20px' }}>
                <div style={{ background: configDesign.cores.inputFundo, borderRadius: '12px', padding: '12px', display: 'flex', gap: '10px' }}>
                  <span>🔍</span><input value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} placeholder="Procurar produto..." style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none' }} />
                </div>
              </div>
            </div>
          )}

          {/* MENU CATEGORIAS STICKY */}
          <div style={{ position: 'sticky', top: categoriaAtiva === 'DESTAQUES' ? 0 : '60px', zIndex: 1000, background: configDesign.cores.fundoGeral, padding: '15px 0' }}>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
              {categoriasDinamicas.map(cat => (
                <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
              ))}
            </div>
          </div>

          {/* LISTA DE PRODUTOS */}
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : '1fr 1fr', gap: '15px' }}>
            {produtos.filter(p => {
                const busca = normalizar(buscaMenu);
                const nome = normalizar(p.nome);
                if (busca && !nome.includes(busca)) return false;
                if (categoriaAtiva === 'TODOS') return true;
                if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
                if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true;
                return normalizar(p.categoria).includes(normalizar(categoriaAtiva).replace(/[^\w]/g, ""));
            }).map(p => (
              <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '12px', boxShadow: configDesign.cores.sombra, cursor: 'pointer' }}>
                <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '220px' : '95px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <h4 style={{ color: configDesign.cores.textoForte, margin: '10px 0 5px 0', fontSize: '13px' }}>{p.nome} {p.lista_padrao && '⭐'}</h4>
                <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* BOTÃO CARRINHO */}
      {carrinho.length > 0 && !bloqueioAtivo && (
        <button onClick={abrirRevisao} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 2000 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '12px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #000' }}>{carrinho.length}</span>
        </button>
      )}
    </div>
  );
}