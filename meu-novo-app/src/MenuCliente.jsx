import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario }) {

  // 🎛️ DESIGN V.I.R.T.U.S
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif" },
    cores: {
      fundoGeral: '#f8fafc',
      primaria: '#f97316',      // Laranja Frazão
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

  // --- 1. DEFINIÇÃO DE VARIÁVEIS DE DATA E SAUDAÇÃO (O QUE CAUSOU O ERRO) ---
  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Frazão').replace(/^\d+\s*-\s*/, '').trim();

  // --- 2. ESTADOS DO SISTEMA ---
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

  // --- 3. RECURSOS PWA E NOTIFICAÇÕES ---
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

  const categorias = ['DESTAQUES', 'TODOS', 'FRUTAS', 'VERDURAS', 'LEGUMES', 'HORTALISSAS', 'CAIXARIAS', 'EMBANDEJADOS', 'SACARIAS', 'VARIADOS'];

  // 💡 EFEITO DE FUNDO E PWA
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

  const dispararPushNotification = (titulo, mensagem) => {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(titulo, { body: mensagem, icon: banners.logo });
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
        audio.play().catch(() => {});
      } catch (e) {}
    }
  };

  const mostrarNotificacao = (mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 20));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
    dispararPushNotification(tituloPush, mensagem);
  };

  async function carregarDados(silencioso = false) {
    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) {
        if (!prevPrecosRef.current && configData.precos_liberados && silencioso && configNotif.precos) {
          mostrarNotificacao("✅ PREÇOS LIBERADOS! Já pode fazer seu pedido.", 'sucesso', 'Preços');
        }
        prevPrecosRef.current = configData.precos_liberados;
        setPrecosLiberados(configData.precos_liberados);
      }

      const { data: pData } = await supabase.from('produtos').select('*').neq('status_cotacao', 'falta').order('nome', { ascending: true });
      if (pData) {
        if (silencioso && produtosAntigosRef.current.length > 0) {
          pData.forEach(novo => {
            const antigo = produtosAntigosRef.current.find(a => a.id === novo.id);
            if (novo.promocao && !antigo?.promocao && configNotif.promocoes) mostrarNotificacao(`🔥 PROMOÇÃO: ${novo.nome}!`, 'promocao', 'Oferta');
            if (novo.novidade && !antigo?.novidade && configNotif.promocoes) mostrarNotificacao(`✨ NOVIDADE: ${novo.nome}!`, 'novidade', 'Novo');
            
            // Radar de aumento de preço no carrinho
            const noCart = carrinhoRef.current.find(c => c.id === novo.id);
            if (noCart && tratarPreco(novo.preco) > noCart.valorUnit && configNotif.aumento) {
              mostrarNotificacao(`⚠️ O item "${novo.nome}" subiu de preço.`, 'alerta', 'Aviso');
            }
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

  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatarQtdUnidade = (qtd, und) => {
    const u = (und || 'UN').toUpperCase();
    return `${qtd} ${u}${qtd > 1 ? 'S' : ''}`;
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

  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !listaEnviadaHoje.some(i => i.liberado_edicao));

  // --- TELA DE SUCESSO ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardando = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const liberado = listaEnviadaHoje.some(item => item.liberado_edicao === true);

    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: liberado ? configDesign.cores.sucesso : (aguardando ? configDesign.cores.promocao : configDesign.cores.textoForte), color: '#fff', padding: '40px 30px', borderRadius: '30px' }}>
          <h2>{liberado ? '🔓 LIBERADO' : (aguardando ? '⏳ AGUARDANDO' : '✅ ENVIADO!')}</h2>
        </div>
        <button onClick={() => setModoVisualizacao(true)} style={{ marginTop: '30px', color: '#666', background: 'none', border: 'none', textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
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
          {deferredPrompt && (
            <button onClick={instalarApp} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>📲 INSTALAR</button>
          )}
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '20px' }}>
        <input placeholder="🔍 Buscar..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '20px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
          {produtos.filter(p => p.nome.toLowerCase().includes(buscaMenu.toLowerCase())).map(p => (
            <div key={p.id} onClick={() => { setProdutoExpandido(p); setQuantidade(1); }} style={{ background: '#fff', padding: '10px', borderRadius: '15px', border: '1px solid #eee' }}>
              <div style={{ height: '80px', background: '#f1f5f9', borderRadius: '10px', marginBottom: '8px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover' }} />
              <strong style={{ fontSize: '11px', display: 'block' }}>{p.nome}</strong>
              <span style={{ color: configDesign.cores.primaria, fontWeight: 'bold' }}>{p.preco}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTÃO CARRINHO */}
      {carrinho.length > 0 && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '30px', right: '30px', background: '#111', color: '#fff', width: '60px', height: '60px', borderRadius: '50%', border: 'none', fontSize: '24px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}>🛒</button>
      )}

      {/* MODAL NOTIFICAÇÕES */}
      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 5000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '80%', backgroundColor: '#fff', height: '100%', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{margin: 0}}>Notificações</h3>
              <div style={{display: 'flex', gap: '10px'}}>
                <button onClick={() => setModalConfigNotifAberto(true)} style={{background: 'none', border: 'none', fontSize: '20px'}}>⚙️</button>
                <button onClick={() => setModalNotificacoesAberto(false)} style={{background: 'none', border: 'none', fontSize: '20px'}}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {historicoNotificacoes.map(n => (
                <div key={n.id} style={{ padding: '10px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                  <b>{n.data}:</b> {n.mensagem}
                </div>
              ))}
            </div>
            <button onClick={() => setHistoricoNotificacoes([])} style={{width: '100%', padding: '10px', background: '#fef2f2', color: configDesign.cores.alerta, border: 'none', borderRadius: '10px'}}>LIMPAR TUDO</button>
          </div>
        </div>
      )}

      {/* MODAL CONFIG NOTIF */}
      {modalConfigNotifAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 6000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '20px', width: '100%', maxWidth: '300px' }}>
            <h4 style={{marginTop: 0}}>Configurações</h4>
            {Object.keys(configNotif).map(key => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                <span style={{fontSize: '13px'}}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                <input type="checkbox" checked={configNotif[key]} onChange={() => setConfigNotif({...configNotif, [key]: !configNotif[key]})} />
              </div>
            ))}
            <button onClick={() => setModalConfigNotifAberto(false)} style={{ width: '100%', marginTop: '20px', padding: '10px', background: '#111', color: '#fff', borderRadius: '10px' }}>FECHAR</button>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO EXPANDIDO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', width: '100%', borderTopLeftRadius: '25px', borderTopRightRadius: '25px', padding: '25px' }}>
            <h3 style={{marginTop: 0}}>{produtoExpandido.nome}</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '20px 0' }}>
              <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} style={{width: '50px', height: '50px', borderRadius: '15px', border: 'none', background: '#f1f5f9', fontSize: '20px'}}>-</button>
              <div style={{fontSize: '24px', fontWeight: 'bold', alignSelf: 'center'}}>{quantidade}</div>
              <button onClick={() => setQuantidade(quantidade + 1)} style={{width: '50px', height: '50px', borderRadius: '15px', border: 'none', background: '#f1f5f9', fontSize: '20px'}}>+</button>
            </div>
            <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '15px', background: '#111', color: '#fff', borderRadius: '15px', fontWeight: 'bold' }}>ADICIONAR</button>
            <button onClick={() => setProdutoExpandido(null)} style={{ width: '100%', marginTop: '10px', padding: '15px', background: 'none', border: 'none', color: '#999' }}>CANCELAR</button>
          </div>
        </div>
      )}

    </div>
  );
}