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

  // --- CONFIGURAÇÃO DE DESIGN (RESTAURADO) ---
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
  
  // --- ESTADOS DE UI E MODAIS ---
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  // --- ESTADOS DE TRAVA E TESTE ---
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- CATEGORIAS NA ORDEM SOLICITADA ---
  const categoriasDinamicas = [
    'DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', 
    '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', 
    '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA', '⭐ LISTA PADRÃO'
  ];

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
      setTempoRestante("SISTEMA INDISPONÍVEL");
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
        if (diffMs > 0 && diffMs < 21600000) { // Mostra contagem se faltar menos de 6h
          const dMin = Math.floor(diffMs / 60000);
          setTempoRestante(`${Math.floor(dMin/60)}h ${dMin%60}min`);
        } else { setTempoRestante(null); }
      }
    }

    // Carregar Banners
    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
      const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
      setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
    }

    // Carregar Produtos e Pedido do Dia
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

  useEffect(() => { localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho)); }, [carrinho]);

  // --- LÓGICA DE REVISÃO E ALERTA LISTA PADRÃO ---
  const abrirRevisao = () => {
    if (carrinho.length === 0) return;

    // Verifica itens da Lista Padrão que não estão no carrinho
    const itensPadrao = produtos.filter(p => p.lista_padrao === true && p.status_cotacao !== 'falta');
    const esquecidos = itensPadrao.filter(p => !carrinho.some(c => c.id === p.id));

    if (esquecidos.length > 0) {
      const nomes = esquecidos.map(i => `- ${i.nome}`).join('\n');
      const confirma = window.confirm(`⚠️ ITENS DA LISTA PADRÃO AUSENTES:\n\n${nomes}\n\nDeseja ignorar e enviar assim mesmo?`);
      if (!confirma) {
        setCategoriaAtiva('⭐ LISTA PADRÃO');
        setModalCarrinhoAberto(false);
        return;
      }
    }
    setModalRevisaoAberto(true);
  };

  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let txt = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => {
      txt += `• *${i.quantidade}x* ${i.nome_produto} (${i.unidade_medida})`;
      if (i.qtd_bonificada > 0) txt += ` _+ ${i.qtd_bonificada} Bonif._`;
      txt += `\n`;
    });
    txt += `---\n_V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  const confirmarEnvio = async () => {
    setEnviandoPedido(true);
    try {
      const payload = carrinho.map(item => ({
        loja_id: codLoja,
        nome_usuario: usuario?.nome,
        nome_produto: item.nome,
        quantidade: item.quantidade,
        unidade_medida: item.unidade_medida,
        data_pedido: hoje,
        qtd_bonificada: item.qtd_bonificada || 0
      }));

      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const { error } = await supabase.from('pedidos').insert(payload);
      if (error) throw error;

      setListaEnviadaHoje(payload);
      setCarrinho([]);
      setModalRevisaoAberto(false);
      setModalCarrinhoAberto(false);
    } catch (e) { alert("Erro ao enviar: " + e.message); }
    finally { setEnviandoPedido(false); }
  };

  // --- RENDERIZAÇÃO: PEDIDO ENVIADO ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', background: configDesign.cores.fundoGeral, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ background: configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '30px' }}>
          <div style={{fontSize: '50px'}}>✅</div>
          <h2>PEDIDO ENVIADO!</h2>
          <p>Dia: {new Date(hoje).toLocaleDateString('pt-BR')}</p>
        </div>
        <div style={{ textAlign: 'left', marginTop: '20px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte }}>
           {listaEnviadaHoje.map((item, i) => (
             <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, fontSize: '14px' }}>
               <b>{item.quantidade}x</b> {item.nome_produto}
             </div>
           ))}
        </div>
        <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={copiarParaWhatsapp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '18px', borderRadius: '15px', fontWeight: '900', fontSize: '15px' }}>💬 COPIAR PARA WHATSAPP</button>
          <button onClick={() => sincronizar()} style={{ background: configDesign.cores.inputFundo, border: 'none', padding: '15px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ color: configDesign.cores.textoSuave, textDecoration: 'underline', border: 'none', background: 'none' }}>VOLTAR AO INÍCIO</button>
        </div>
      </div>
    );
  }

  // --- RENDERIZAÇÃO: CATÁLOGO ---
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      
      {/* HEADER DE TRAVAS */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>⏳ TEMPO RESTANTE: {tempoRestante}</div>
      )}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>🚩 ATENÇÃO: Horário de Feriado (Limite até as 13:00)</div>
      )}

      {/* BANNERS */}
      {categoriaAtiva === 'DESTAQUES' && (
        <div>
          <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div style={{ padding: '0 20px', marginTop: '-40px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }} />
          </div>
          <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
        </div>
      )}

      {/* SEARCH E CATEGORIAS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: configDesign.cores.fundoGeral, paddingTop: '15px' }}>
        <div style={{ padding: '0 20px 10px 20px' }}>
           <div style={{ background: configDesign.cores.inputFundo, borderRadius: '12px', padding: '12px', display: 'flex', gap: '10px' }}>
             <span>🔍</span><input placeholder="Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} />
           </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px 10px 20px', scrollbarWidth: 'none' }}>
           {categoriasDinamicas.map(cat => (
             <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px', fontSize: '13px' }}>{cat}</button>
           ))}
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '0 20px 20px 20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
            const termo = buscaMenu.toLowerCase();
            if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
            if (categoriaAtiva === 'TODOS') return p.nome.toLowerCase().includes(termo);
            if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true;
            return p.categoria?.toUpperCase().includes(categoriaAtiva.replace(/[^a-zA-Z]/g, '').trim().toUpperCase());
        }).map(p => {
          const itemNoCart = carrinho.find(c => c.id === p.id);
          return (
            <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '16px', padding: '12px', boxShadow: configDesign.cards.sombra, position: 'relative', border: itemNoCart ? `2px solid ${configDesign.cores.primaria}` : 'none' }}>
              <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '220px' : '90px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
              <h4 style={{ color: configDesign.cores.textoForte, fontSize: '12px', margin: '10px 0 5px 0', height: '30px', overflow: 'hidden' }}>{p.nome}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: '15px' }}>{p.preco}</span>
                <span style={{ fontSize: '10px', background: configDesign.cores.inputFundo, padding: '2px 5px', borderRadius: '4px', color: configDesign.cores.textoSuave }}>{p.unidade_medida}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* BOTÃO CARRINHO FLUTUANTE */}
      {carrinho.length > 0 && !bloqueioAtivo && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '12px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #000' }}>{carrinho.length}</span>
        </button>
      )}

      {/* MODAL REVISÃO FINAL */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: configDesign.cores.fundoGeral, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Revisar Pedido</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {carrinho.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                <span style={{color: configDesign.cores.textoForte}}><b>{item.quantidade}x</b> {item.nome}</span>
                <span style={{color: configDesign.cores.textoSuave}}>{item.preco}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '20px', background: configDesign.cores.fundoCards }}>
            <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '16px' }}>
              {enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR E ENVIAR'}
            </button>
            <button onClick={() => setModalRevisaoAberto(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: configDesign.cores.textoSuave }}>Voltar ao carrinho</button>
          </div>
        </div>
      )}
    </div>
  );
}