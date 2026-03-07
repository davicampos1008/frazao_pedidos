import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

const LIMITES_HORARIO = {
  0: "13:00", 1: "18:00", 2: "18:00", 3: "14:00", 4: "18:00", 5: "18:00", 6: null, feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  const isEscuro = tema === 'escuro';
  const lastScrollY = useRef(0);

  // --- DESIGN ---
  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      primaria: '#f97316',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9',
      sucesso: '#22c55e'
    }
  };

  // --- ESTADOS ---
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => JSON.parse(localStorage.getItem('carrinho_virtus') || '[]'));
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  
  // --- UI & ANIMAÇÃO ---
  const [showFixedSearch, setShowFixedSearch] = useState(true);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;

  // --- NORMALIZAÇÃO DE BUSCA (Ignora acento e espaços) ---
  const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");

  // --- LÓGICA DE SCROLL ---
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

  // --- SINCRONIZAÇÃO V.I.R.T.U.S ---
  const sincronizar = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);
    setIsFeriadoMarcado(config.is_feriado);

    const agora = new Date();
    const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay();
    let limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

    if (config.nao_funciona || limiteStr === null) {
      setBloqueioAtivo(true);
    } else {
      const [h, m] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(h, m, 0);
      if (dataEfetiva === new Date().toLocaleDateString('en-CA') && agora > dataLimite) setBloqueioAtivo(true);
      else setBloqueioAtivo(false);
    }

    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
      const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
      setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
    }

    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [codLoja]);

  useEffect(() => {
    sincronizar();
    const t = setInterval(sincronizar, 30000);
    return () => clearInterval(t);
  }, [sincronizar]);

  const copiarWhatsapp = () => {
    let txt = `*PEDIDO: ${usuario?.loja}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• *${i.quantidade}x* ${i.nome_produto}\n`);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  // --- BARRA DE PESQUISA ---
  const BarraPesquisa = ({ fixa = false }) => (
    <div style={{
      padding: fixa ? '12px 20px' : '0 20px 15px 20px',
      position: fixa ? 'fixed' : 'relative',
      top: fixa ? 0 : 'auto',
      left: 0, right: 0, zIndex: 1100,
      opacity: fixa ? (showFixedSearch ? 1 : 0) : 1,
      transform: fixa ? (showFixedSearch ? 'translateY(0)' : 'translateY(-20px)') : 'none',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      display: fixa && categoriaAtiva === 'DESTAQUES' ? 'none' : 'block'
    }}>
      <div style={{ 
        background: fixa ? configDesign.cores.fundoCards : configDesign.cores.inputFundo, 
        borderRadius: fixa ? '30px' : '15px', 
        padding: '12px 18px', display: 'flex', gap: '10px',
        boxShadow: fixa ? '0 8px 20px rgba(0,0,0,0.1)' : 'none',
        border: fixa ? `1px solid ${configDesign.cores.borda}` : 'none'
      }}>
        <span>🔍</span>
        <input 
          placeholder="O que você procura hoje?" 
          value={buscaMenu} 
          onChange={e => setBuscaMenu(e.target.value)} 
          style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} 
        />
      </div>
    </div>
  );

  const categorias = ['DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras', '🥕 Legumes', '🥔 Raízes', '🍱 Bandejados', '🌿 Folhagens', '📦 Caixaria', '⭐ LISTA PADRÃO'];

  if (!precosLiberados && !listaEnviadaHoje) {
    return <div style={{ padding: '100px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh', color: configDesign.cores.textoForte }}><h2>Aguardando Cotação...</h2><p>{new Date(hoje).toLocaleDateString('pt-BR')}</p></div>;
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      
      <BarraPesquisa fixa={true} />

      {listaEnviadaHoje && !modoVisualizacao ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '40px 20px', borderRadius: '30px' }}><h2>✅ PEDIDO ENVIADO!</h2></div>
          <button onClick={copiarWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold' }}>💬 WHATSAPP</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ color: configDesign.cores.textoSuave, textDecoration: 'underline', border: 'none', background: 'none', marginTop: '20px' }}>VISUALIZAR CATÁLOGO</button>
        </div>
      ) : (
        <>
          {categoriaAtiva === 'DESTAQUES' && (
            <div>
              <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '0 20px', marginTop: '-40px' }}><div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #fff', backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundColor: '#fff' }} /></div>
              <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
              <div style={{ marginTop: '20px' }}><BarraPesquisa fixa={false} /></div>
            </div>
          )}

          <div style={{ position: 'sticky', top: categoriaAtiva === 'DESTAQUES' ? 0 : '70px', zIndex: 1000, background: configDesign.cores.fundoGeral, padding: '15px 0' }}>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
              {categorias.map(cat => (
                <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : '1fr 1fr', gap: '15px' }}>
            {produtos.filter(p => {
              const termo = normalizar(buscaMenu);
              const nome = normalizar(p.nome);
              if (termo && !nome.includes(termo)) return false;
              if (categoriaAtiva === 'TODOS') return true;
              if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
              if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true;
              return normalizar(p.categoria || "").includes(normalizar(categoriaAtiva));
            }).map(p => (
              <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
                <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '200px' : '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <h4 style={{ color: configDesign.cores.textoForte, margin: '10px 0 5px 0', fontSize: '13px' }}>{p.nome}</h4>
                <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODAL DETALHES PRODUTO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', padding: '30px', borderRadius: '30px 30px 0 0' }}>
            <button onClick={() => setProdutoExpandido(null)} style={{ float: 'right', border: 'none', background: 'none', fontSize: '20px' }}>✕</button>
            <h2 style={{color: configDesign.cores.textoForte}}>{produtoExpandido.nome}</h2>
            <p style={{color: configDesign.cores.primaria, fontSize: '24px', fontWeight: 'bold'}}>{produtoExpandido.preco}</p>
            <button style={{ width: '100%', padding: '18px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold', marginTop: '20px' }}>ADICIONAR AO CARRINHO</button>
          </div>
        </div>
      )}
    </div>
  );
}