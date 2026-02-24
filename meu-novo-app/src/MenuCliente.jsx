import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario }) {

  // 🎛️ DESIGN V.I.R.T.U.S
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif" },
    cores: {
      fundoGeral: '#f8fafc',
      primaria: '#f97316',
      textoForte: '#111111',
      textoSuave: '#64748b',
      promocao: '#eab308',
      novidade: '#a855f7',
      sucesso: '#22c55e',
      alerta: '#ef4444'
    },
    cards: {
      fundo: '#ffffff',
      raioBorda: '16px',
      sombra: '0 4px 12px rgba(0,0,0,0.03)',
      alturaImgDestaque: '220px', 
      alturaImgPequena: '85px'    
    },
    animacoes: { transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }
  };

  // --- ESTADOS DO SISTEMA ---
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => {
    try {
      const salvo = localStorage.getItem('carrinho_virtus');
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });

  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false); 
  const [itemEditandoId, setItemEditandoId] = useState(null);
  const [navState, setNavState] = useState({ show: true, shrink: false });
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [notificacoes, setNotificacoes] = useState([]);
  const [permissaoPush, setPermissaoPush] = useState('default');

  // --- NOVOS RECURSOS V.I.R.T.U.S ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    const salvo = localStorage.getItem('notif_history_virtus');
    return salvo ? JSON.parse(salvo) : [];
  });
  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [modalConfigNotifAberto, setModalConfigNotifAberto] = useState(false);
  const [configNotif, setConfigNotif] = useState({
    precos: true, edicao: true, promocoes: true, aumento: true
  });

  const ultimoScroll = useRef(0);
  const prevPrecosRef = useRef(false);
  const produtosAntigosRef = useRef([]);
  const carrinhoRef = useRef(carrinho);
  const listaHojeRef = useRef(listaEnviadaHoje);

  // --- DEFINIÇÕES DE DATA E SAUDAÇÃO (O QUE ESTAVA FALTANDO!) ---
  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Frazão').replace(/^\d+\s*-\s*/, '').trim();

  const categorias = ['DESTAQUES', 'TODOS', 'FRUTAS', 'VERDURAS', 'LEGUMES', 'HORTALISSAS', 'CAIXARIAS', 'EMBANDEJADOS', 'SACARIAS', 'VARIADOS'];

  // 💡 CORREÇÃO DE FUNDO E PWA
  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const instalarApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  useEffect(() => {
    localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho));
    carrinhoRef.current = carrinho;
  }, [carrinho]);

  useEffect(() => {
    localStorage.setItem('notif_history_virtus', JSON.stringify(historicoNotificacoes));
  }, [historicoNotificacoes]);

  useEffect(() => { listaHojeRef.current = listaEnviadaHoje; }, [listaEnviadaHoje]);

  // --- LOGICA DE NOTIFICAÇÕES ---
  const mostrarNotificacao = (mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 20));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
    
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(tituloPush, { body: mensagem, icon: banners.logo });
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
      audio.play().catch(() => {});
    }
  };

  async function carregarDados(silencioso = false) {
    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) {
        if (!prevPrecosRef.current && configData.precos_liberados && silencioso && configNotif.precos) {
          mostrarNotificacao("✅ PREÇOS LIBERADOS! Você já pode fazer seu pedido.", 'sucesso', 'Preços Atualizados');
        }
        prevPrecosRef.current = configData.precos_liberados;
        setPrecosLiberados(configData.precos_liberados);
      }

      const { data: pData } = await supabase.from('produtos').select('*').neq('status_cotacao', 'falta').order('nome', { ascending: true });
      if (pData) {
        if (silencioso && produtosAntigosRef.current.length > 0) {
          pData.forEach(novo => {
            const antigo = produtosAntigosRef.current.find(a => a.id === novo.id);
            if (novo.promocao && !antigo?.promocao && configNotif.promocoes) mostrarNotificacao(`🔥 PROMOÇÃO: ${novo.nome} por ${novo.preco}!`, 'promocao', 'Oferta');
            if (novo.novidade && !antigo?.novidade && configNotif.promocoes) mostrarNotificacao(`✨ NOVIDADE: Chegou ${novo.nome}!`, 'novidade', 'Novo Item');
          });
        }
        produtosAntigosRef.current = pData;
        setProdutos(pData);
      }

      const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        if (pedidoExistente && pedidoExistente.length > 0) {
          if (silencioso && listaHojeRef.current && configNotif.edicao) {
            const estavaAguardando = listaHojeRef.current.some(i => i.solicitou_refazer === true);
            const agoraEstaLiberado = pedidoExistente.some(i => i.liberado_edicao === true);
            if (estavaAguardando && agoraEstaLiberado) mostrarNotificacao("🔓 PEDIDO APROVADO! Edição liberada.", 'sucesso', 'Edição');
          }
          setListaEnviadaHoje(pedidoExistente);
        } else { setListaEnviadaHoje(null); }
      }
    } catch (e) { console.error(e); }
  }

  useEffect(() => { carregarDados(); }, [usuario]);
  useEffect(() => {
    const radar = setInterval(() => { carregarDados(true); }, 15000);
    return () => clearInterval(radar);
  }, [usuario]);

  // --- FUNÇÕES DE AUXÍLIO ---
  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatarQtdUnidade = (qtd, und) => {
    const u = (und || 'UN').toUpperCase();
    if (qtd <= 1) return `${qtd} ${u}`;
    return `${qtd} ${u}S`;
  };

  const salvarNoCarrinho = () => {
    const qtdFinal = parseInt(quantidade, 10) || 1;
    const vUnit = tratarPreco(produtoExpandido.preco);
    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    if (itemEx) {
      setCarrinho(carrinho.map(i => i.id === produtoExpandido.id ? { ...i, quantidade: qtdFinal, total: vUnit * qtdFinal, valorUnit: vUnit } : i));
    } else {
      setCarrinho([...carrinho, { ...produtoExpandido, quantidade: qtdFinal, valorUnit: vUnit, total: vUnit * qtdFinal }]);
    }
    setProdutoExpandido(null);
  };

  const confirmarEnvio = async () => {
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    setEnviandoPedido(true);
    try {
      const dados = carrinho.map(item => ({
        loja_id: codLoja, nome_usuario: usuario?.nome, nome_produto: item.nome, quantidade: item.quantidade,
        unidade_medida: item.unidade_medida, data_pedido: hoje, status_compra: 'pendente' 
      }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      await supabase.from('pedidos').insert(dados);
      setCarrinho([]); localStorage.removeItem('carrinho_virtus');
      setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false);
      await carregarDados(false);
    } catch (err) { alert(err.message); } finally { setEnviandoPedido(false); }
  };

  // --- RENDERIZAÇÃO DA TELA DE SUCESSO ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardando = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const liberado = listaEnviadaHoje.some(item => item.liberado_edicao === true);

    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: liberado ? configDesign.cores.sucesso : (aguardando ? configDesign.cores.promocao : configDesign.cores.textoForte), color: '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <h2>{liberado ? '🔓 LIBERADO' : (aguardando ? '⏳ AGUARDANDO' : '✅ ENVIADO!')}</h2>
        </div>
        <button onClick={() => setModoVisualizacao(true)} style={{ marginTop: '30px', border: 'none', background: 'none', textDecoration: 'underline', color: '#666' }}>VOLTAR AO INÍCIO</button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao }}>
      
      {/* HEADER FIXO */}
      <div style={{ padding: '25px 20px', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>{saudacao}, {primeiroNome}!</h2>
          <small style={{ color: configDesign.cores.primaria, fontWeight: 'bold' }}>📍 {nomeLojaLimpo}</small>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: '#f1f5f9', border: 'none', padding: '10px', borderRadius: '12px', position: 'relative' }}>
            🔔 {historicoNotificacoes.some(n => !n.lida) && "🔴"}
          </button>
          {deferredPrompt && <button onClick={instalarApp} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', fontWeight: 'bold' }}>📲 INSTALAR</button>}
        </div>
      </div>

      {/* LISTAGEM (RESUMIDA PARA O EXEMPLO) */}
      <div style={{ padding: '20px' }}>
        <input placeholder="🔍 Buscar..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '20px' }} />
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
          {produtos.filter(p => p.nome.toLowerCase().includes(buscaMenu.toLowerCase())).map(p => (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ background: '#fff', padding: '10px', borderRadius: '15px', border: '1px solid #eee' }}>
              <div style={{ height: '80px', background: '#f1f5f9', borderRadius: '10px', marginBottom: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover' }} />
              <strong style={{ fontSize: '12px', display: 'block' }}>{p.nome}</strong>
              <span style={{ color: configDesign.cores.primaria, fontWeight: 'bold' }}>{p.preco}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTÃO FLUTUANTE */}
      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '30px', right: '30px', background: '#111', color: '#fff', width: '60px', height: '60px', borderRadius: '50%', border: 'none', fontSize: '24px' }}>🛒</button>
      )}

      {/* MODAL NOTIFICAÇÕES */}
      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 5000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '80%', backgroundColor: '#fff', height: '100%', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Notificações</h3>
              <button onClick={() => setModalConfigNotifAberto(true)}>⚙️</button>
              <button onClick={() => setModalNotificacoesAberto(false)}>✕</button>
            </div>
            {historicoNotificacoes.map(n => (
              <div key={n.id} style={{ padding: '10px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{n.mensagem}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}