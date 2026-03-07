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

  // --- CONFIGURAÇÃO DE DESIGN ---
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
      alerta: '#ef4444',
      promocao: '#eab308'
    },
    cards: { 
      raioBorda: '16px', 
      sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.03)',
      alturaImgDestaque: '220px',
      alturaImgPequena: '85px'
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
  
  // --- ESTADOS DE UI & ANIMAÇÃO ---
  const [showFixedSearch, setShowFixedSearch] = useState(true);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  // --- ESTADOS DE TRAVA E TESTE ---
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- CATEGORIAS NA ORDEM EXATA ---
  const categoriasDinamicas = [
    'DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', 
    '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', 
    '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA', '⭐ LISTA PADRÃO'
  ];

  // --- FUNÇÃO DE NORMALIZAÇÃO (IGNORA ACENTOS E ESPAÇOS) ---
  const normalizar = (t) => t?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "") || "";

  // --- LÓGICA DE SCROLL (BARRA DE BUSCA) ---
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) setShowFixedSearch(false);
      else setShowFixedSearch(true);
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- SINCRONIZAÇÃO COMPLETA (V.I.R.T.U.S) ---
  const sincronizar = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);
    setIsFeriadoMarcado(config.is_feriado);

    // Lógica de Trava de Horário
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
        if (diffMs > 0 && diffMs < 21600000) { // Menos de 6h
          const dMin = Math.floor(diffMs / 60000);
          setTempoRestante(`${Math.floor(dMin/60)}h ${dMin%60}min`);
          
          if (dMin <= 30 && !notificou30min) {
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("V.I.R.T.U.S: PRAZO ENCERRANDO", { body: `Faltam apenas 30 minutos para o fim dos pedidos!` });
            }
            setNotificou30min(true);
          }
        } else { setTempoRestante(null); }
      }
    }

    // Carregar Banners, Produtos e Pedido do Dia
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

  useEffect(() => {
    sincronizar();
    const t = setInterval(sincronizar, 30000);
    return () => clearInterval(t);
  }, [sincronizar]);

  useEffect(() => { localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho)); }, [carrinho]);

  // --- WHATSAPP & REVISÃO ---
  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let txt = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• *${i.quantidade}x* ${i.nome_produto} (${i.unidade_medida})\n`);
    txt += `---\n_V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  const abrirRevisao = () => {
    const itensPadrao = produtos.filter(p => p.lista_padrao && p.status_cotacao !== 'falta');
    const esquecidos = itensPadrao.filter(p => !carrinho.some(c => c.id === p.id));
    if (esquecidos.length > 0) {
      const nomes = esquecidos.map(i => `- ${i.nome}`).join('\n');
      if (!window.confirm(`⚠️ ITENS DA LISTA PADRÃO ESQUECIDOS:\n\n${nomes}\n\nDeseja enviar assim mesmo?`)) {
        setCategoriaAtiva('⭐ LISTA PADRÃO');
        setModalCarrinhoAberto(false);
        return;
      }
    }
    setModalRevisaoAberto(true);
  };

  // --- COMPONENTE SEARCH BAR ---
  const SearchBar = ({ fixa = false }) => (
    <div style={{
      padding: fixa ? '12px 20px' : '0 20px 10px 20px',
      position: fixa ? 'fixed' : 'relative',
      top: fixa ? 0 : 'auto', left: 0, right: 0, zIndex: 1100,
      opacity: fixa ? (showFixedSearch ? 1 : 0) : 1,
      transform: fixa ? (showFixedSearch ? 'translateY(0)' : 'translateY(-20px)') : 'none',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      display: fixa && categoriaAtiva === 'DESTAQUES' ? 'none' : 'block'
    }}>
      <div style={{ 
        background: fixa ? configDesign.cores.fundoCards : configDesign.cores.inputFundo, 
        borderRadius: fixa ? '30px' : '12px', 
        padding: '12px 18px', display: 'flex', gap: '10px',
        boxShadow: fixa ? '0 8px 20px rgba(0,0,0,0.1)' : 'none',
        border: fixa ? `1px solid ${configDesign.cores.borda}` : 'none'
      }}>
        <span>🔍</span>
        <input 
          placeholder="O que você procura?" 
          value={buscaMenu} 
          onChange={e => setBuscaMenu(e.target.value)} 
          style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} 
        />
      </div>
    </div>
  );

  // --- RENDERIZAÇÃO ---
  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh', fontFamily:'sans-serif' }}>
        <div style={{fontSize:'60px'}}>⏳</div>
        <h2 style={{color:configDesign.cores.textoForte}}>Aguardando Cotação...</h2>
        <p style={{color:configDesign.cores.textoSuave}}>{new Date(hoje).toLocaleDateString('pt-BR')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      
      <SearchBar fixa={true} />

      {/* HEADER DE TRAVAS */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>⏳ TEMPO PARA ENVIO: {tempoRestante}</div>
      )}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>🚩 FERIADO: Limite às 13:00</div>
      )}

      {/* TELA DE PEDIDO ENVIADO */}
      {listaEnviadaHoje && !modoVisualizacao ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '25px' }}>
            <h2 style={{margin:0}}>✅ PEDIDO ENVIADO!</h2>
            <p>Data: {new Date(hoje).toLocaleDateString('pt-BR')}</p>
          </div>
          <button onClick={copiarParaWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>💬 WHATSAPP</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ color: configDesign.cores.textoSuave, textDecoration: 'underline', border: 'none', background: 'none', marginTop: '20px' }}>VISUALIZAR CATÁLOGO</button>
        </div>
      ) : (
        <>
          {/* BANNERS EM DESTAQUES */}
          {categoriaAtiva === 'DESTAQUES' && (
            <div>
              <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '0 20px', marginTop: '-40px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }} />
              </div>
              <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
              <div style={{ marginTop: '20px' }}><SearchBar fixa={false} /></div>
            </div>
          )}

          {/* MENU CATEGORIAS STICKY */}
          <div style={{ position: 'sticky', top: categoriaAtiva === 'DESTAQUES' ? 0 : '70px', zIndex: 1000, background: configDesign.cores.fundoGeral, padding: '15px 0' }}>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
              {categoriasDinamicas.map(cat => (
                <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px', fontSize: '13px' }}>{cat}</button>
              ))}
            </div>
          </div>

          {/* LISTAGEM DE PRODUTOS */}
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : '1fr 1fr', gap: '15px' }}>
            {produtos.filter(p => {
                const busca = normalizar(buscaMenu);
                const nome = normalizar(p.nome);
                if (busca && !nome.includes(busca)) return false;
                if (categoriaAtiva === 'TODOS') return true;
                if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
                if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true;
                return normalizar(p.categoria || "").includes(normalizar(categoriaAtiva));
            }).map(p => {
              const itemNoCart = carrinho.find(c => c.id === p.id);
              return (
                <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '16px', padding: '12px', boxShadow: configDesign.cards.sombra, position: 'relative', border: itemNoCart ? `2px solid ${configDesign.cores.primaria}` : 'none', cursor: 'pointer' }}>
                   {itemNoCart && <div style={{position:'absolute', top:'-10px', right:'-10px', background:configDesign.cores.primaria, color:'#fff', width:'25px', height:'25px', borderRadius:'50%', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold', fontSize:'12px'}}>{itemNoCart.quantidade}</div>}
                   <div style={{ height: categoriaAtiva === 'DESTAQUES' ? configDesign.cards.alturaImgDestaque : configDesign.cards.alturaImgPequena, borderRadius: '12px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
                   <h4 style={{ color: configDesign.cores.textoForte, fontSize: '13px', margin: '10px 0 5px 0' }}>{p.nome} {p.lista_padrao && '⭐'}</h4>
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                      <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: '16px' }}>{p.preco}</span>
                      <small style={{color:configDesign.cores.textoSuave, fontSize:'10px'}}>{p.unidade_medida}</small>
                   </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MODAL DETALHES (CLICÁVEL) */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 5000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', padding: '30px', borderRadius: '30px 30px 0 0' }}>
            <button onClick={() => setProdutoExpandido(null)} style={{ float:'right', background:'none', border:'none', fontSize:'24px', color:configDesign.cores.textoForte }}>✕</button>
            <h2 style={{color: configDesign.cores.textoForte}}>{produtoExpandido.nome}</h2>
            <p style={{color: configDesign.cores.primaria, fontSize: '24px', fontWeight: '900'}}>{produtoExpandido.preco}</p>
            <div style={{display:'flex', gap:'15px', alignItems:'center', margin:'20px 0'}}>
                <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} style={{flex:1, padding:'15px', borderRadius:'12px', border:'none', background:configDesign.cores.inputFundo, color:configDesign.cores.textoForte, fontWeight:'bold'}}>-</button>
                <span style={{fontSize:'20px', fontWeight:'bold', width:'40px', textAlign:'center'}}>{quantidade}</span>
                <button onClick={() => setQuantidade(quantidade + 1)} style={{flex:1, padding:'15px', borderRadius:'12px', border:'none', background:configDesign.cores.inputFundo, color:configDesign.cores.textoForte, fontWeight:'bold'}}>+</button>
            </div>
            <button onClick={() => {
                const novoCarrinho = [...carrinho.filter(c => c.id !== produtoExpandido.id), {...produtoExpandido, quantidade}];
                setCarrinho(novoCarrinho);
                setProdutoExpandido(null);
                setQuantidade(1);
            }} style={{ width: '100%', padding: '20px', background: configDesign.cores.textoForte, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900' }}>ADICIONAR AO PEDIDO</button>
          </div>
        </div>
      )}

      {/* BOTÃO CARRINHO FLUTUANTE */}
      {carrinho.length > 0 && !bloqueioAtivo && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 4000 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #000' }}>{carrinho.length}</span>
        </button>
      )}

      {/* MODAL REVISÃO (COM ALERTA DE LISTA PADRÃO) */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: configDesign.cores.fundoGeral, zIndex: 6000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, textAlign: 'center' }}><h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Confirmação do Pedido</h3></div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {carrinho.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                <span style={{color: configDesign.cores.textoForte}}><b>{i.quantidade}x</b> {i.nome}</span>
                <span style={{color: configDesign.cores.textoSuave}}>{i.preco}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '20px', background: configDesign.cores.fundoCards }}>
            <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900' }}>{enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR E ENVIAR'}</button>
            <button onClick={() => setModalRevisaoAberto(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: configDesign.cores.textoSuave }}>Voltar ao carrinho</button>
          </div>
        </div>
      )}
    </div>
  );
}