import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario }) {

  // 🎛️ PAINEL DE CONTROLE V.I.R.T.U.S - DESIGN E CORES DO MENU
  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif"
    },
    cores: {
      fundoGeral: '#f8fafc',    // Mude aqui para #111111 para tema escuro
      primaria: '#f97316',      // Laranja Frazão
      textoForte: '#111111',    // Mude aqui para #ffffff para tema escuro
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
    animacoes: {
      transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }
  };

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
  const ultimoScroll = useRef(0);
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [notificacoes, setNotificacoes] = useState([]);
  const [permissaoPush, setPermissaoPush] = useState('default');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    const salvo = localStorage.getItem('historico_notif_virtus');
    return salvo ? JSON.parse(salvo) : [];
  });
  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [modalConfigNotifAberto, setModalConfigNotifAberto] = useState(false);
  const [configNotif, setConfigNotif] = useState({
    precos: true, edicao: true, promocoes: true, novidades: true
  });
  
  const prevPrecosRef = useRef(false);
  const carrinhoRef = useRef(carrinho);
  const listaHojeRef = useRef(listaEnviadaHoje);
  const produtosAntigosRef = useRef([]);

  const categorias = ['DESTAQUES', 'TODOS', 'FRUTAS', 'VERDURAS', 'LEGUMES', 'HORTALISSAS', 'CAIXARIAS', 'EMBANDEJADOS', 'SACARIAS', 'VARIADOS'];
  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Matriz').replace(/^\d+\s*-\s*/, '').trim();

  // 💡 APLICAÇÃO DE TEMA NO FUNDO GLOBAL
  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    document.body.style.color = configDesign.cores.textoForte;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); setDeferredPrompt(e); });
  }, [configDesign.cores.fundoGeral, configDesign.cores.textoForte]);

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
    localStorage.setItem('historico_notif_virtus', JSON.stringify(historicoNotificacoes));
  }, [historicoNotificacoes]);

  // 💡 CLIQUE NA NOTIFICAÇÃO (VAI PARA O PRODUTO)
  const lidarComCliqueNotificacao = (msg) => {
    const termo = msg.match(/"([^"]+)"/) || msg.match(/PROMOÇÃO: (.*?) por/);
    if (termo && termo[1]) {
      const p = produtos.find(item => item.nome.toLowerCase().includes(termo[1].toLowerCase()));
      if (p) {
        setModalNotificacoesAberto(false);
        abrirProduto(p);
      }
    }
  };

  const dispararPushNotification = (titulo, mensagem) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
      audio.play().catch(() => {});

      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(titulo, {
            body: mensagem,
            icon: banners.logo || '/logo.png',
            vibrate: [200, 100, 200],
            tag: 'virtus-notif'
          });
        });
      } else {
        const n = new Notification(titulo, { body: mensagem, icon: banners.logo });
        n.onclick = () => { window.focus(); lidarComCliqueNotificacao(mensagem); n.close(); };
      }
    }
  };

  const mostrarNotificacao = (mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 20));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
    dispararPushNotification(tituloPush, mensagem);
  };

  const solicitarPermissaoPush = async () => {
    if ("Notification" in window) {
      const permissao = await Notification.requestPermission();
      setPermissaoPush(permissao);
      if (permissao === "granted") mostrarNotificacao("Notificações ativadas com sucesso!", "sucesso");
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
            if (novo.promocao && !antigo?.promocao && configNotif.promocoes) mostrarNotificacao(`🔥 PROMOÇÃO: "${novo.nome}" por apenas ${novo.preco}!`, 'promocao', 'Nova Oferta');
            if (novo.novidade && !antigo?.novidade && configNotif.novidades) mostrarNotificacao(`✨ NOVIDADE: Chegou "${novo.nome}"!`, 'novidade', 'Chegou Novidade');
          });
        }
        produtosAntigosRef.current = pData;
        setProdutos(pData);
      }

      const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
      if (codLoja) {
        const { data: pedExist } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        if (pedExist && pedExist.length > 0) {
          if (silencioso && listaHojeRef.current && configNotif.edicao) {
            const aguard = listaHojeRef.current.some(i => i.solicitou_refazer);
            const lib = pedExist.some(i => i.liberado_edicao);
            if (aguard && lib) mostrarNotificacao("🔓 PEDIDO APROVADO! Sua lista voltou para o carrinho.", 'sucesso', 'Edição Liberada');
          }
          setListaEnviadaHoje(pedExist);
        } else { setListaEnviadaHoje(null); }
      }
    } catch (e) { console.error(e); }
  }

  useEffect(() => { carregarDados(); }, [usuario]);
  useEffect(() => { const radar = setInterval(() => carregarDados(true), 10000); return () => clearInterval(radar); }, [usuario]);

  const valorTotalCarrinho = carrinho.reduce((acc, item) => acc + (item.total || 0), 0);
  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !listaEnviadaHoje.some(i => i.liberado_edicao));

  const abrirProduto = (p) => { setProdutoExpandido(p); setQuantidade(carrinho.find(i => i.id === p.id)?.quantidade || 1); };
  
  const tratarInputQuantidade = (v) => { const val = parseInt(v, 10); setQuantidade(isNaN(val) || val < 1 ? '' : val); };

  const salvarNoCarrinho = () => {
    const qtd = parseInt(quantidade) || 1;
    const vUnit = tratarPreco(produtoExpandido.preco);
    if (vUnit === 0 && !window.confirm(`Item "${produtoExpandido.nome}" sem preço definido. Confirmar mesmo assim?`)) return;
    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    if (itemEx) setCarrinho(carrinho.map(i => i.id === produtoExpandido.id ? { ...i, quantidade: qtd, total: vUnit * qtd } : i));
    else setCarrinho([...carrinho, { ...produtoExpandido, quantidade: qtd, valorUnit: vUnit, total: vUnit * qtd }]);
    setProdutoExpandido(null);
  };

  const confirmarEnvio = async () => {
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    setEnviandoPedido(true);
    try {
      const dados = carrinho.map(item => ({ loja_id: codLoja, nome_usuario: usuario?.nome, nome_produto: item.nome, quantidade: item.quantidade, unidade_medida: item.unidade_medida || 'UN', data_pedido: hoje, status_compra: 'pendente' }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const { error } = await supabase.from('pedidos').insert(dados);
      if (error) throw error;
      setCarrinho([]); localStorage.removeItem('carrinho_virtus');
      setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false);
      await carregarDados(false); window.scrollTo(0,0);
      mostrarNotificacao("🚀 LISTA ENVIADA COM SUCESSO!", 'sucesso', 'Pedido Realizado');
    } catch (err) { alert("Erro ao gravar: " + err.message); } finally { setEnviandoPedido(false); }
  };

  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguard = listaEnviadaHoje.some(i => i.solicitou_refazer);
    const lib = listaEnviadaHoje.some(i => i.liberado_edicao);
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', color: configDesign.cores.textoForte }}>
        <div style={{ background: lib ? configDesign.cores.sucesso : (aguard ? configDesign.cores.promocao : configDesign.cores.textoForte), color: '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <h2>{lib ? '🔓 LIBERADO' : (aguard ? '⏳ AGUARDANDO' : '✅ ENVIADO!')}</h2>
        </div>
        <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, fontWeight: '900', textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, color: configDesign.cores.textoForte }}>
      
      {/* HEADER */}
      <div style={{ padding: '25px 20px', backgroundColor: configDesign.cards.fundo, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px' }}>{saudacao}, {primeiroNome}!</h2>
          <p style={{ margin: 0, fontSize: '13px', color: configDesign.cores.primaria, fontWeight: '900' }}>📍 {nomeLojaLimpo}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {deferredPrompt && <button onClick={instalarApp} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', fontWeight: '900' }}>📲 INSTALAR</button>}
          <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: '#f1f5f9', border: 'none', width: '45px', height: '45px', borderRadius: '12px', position: 'relative' }}>
            <span style={{fontSize: '20px'}}>🔔</span>
            {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: 0, right: 0, width: '12px', height: '12px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
          </button>
        </div>
      </div>

      {/* BUSCA E CATEGORIAS */}
      <div style={{ padding: '20px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: configDesign.cores.fundoGeral }}>
        <input placeholder="🔍 Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #ddd', background: configDesign.cards.fundo, color: configDesign.cores.textoForte }} />
      </div>

      {/* LISTA */}
      <div style={{ padding: '0 20px 100px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => p.nome.toLowerCase().includes(buscaMenu.toLowerCase())).map(p => (
          <div key={p.id} onClick={() => abrirProduto(p)} style={{ background: configDesign.cards.fundo, padding: '12px', borderRadius: '16px', border: '1px solid #eee', boxShadow: configDesign.cards.sombra }}>
            <div style={{ height: '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
            <strong style={{ display: 'block', margin: '10px 0 5px', fontSize: '13px' }}>{p.nome}</strong>
            <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
          </div>
        ))}
      </div>

      {/* MODAL NOTIFICAÇÕES */}
      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 5000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '85%', maxWidth: '380px', height: '100%', background: configDesign.cards.fundo, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '25px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Notificações</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setModalConfigNotifAberto(true)} style={{ background: 'none', border: 'none', fontSize: '22px' }}>⚙️</button>
                <button onClick={() => { setModalNotificacoesAberto(false); setHistoricoNotificacoes(prev => prev.map(n => ({...n, lida: true}))); }} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', color: '#111' }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {historicoNotificacoes.map(n => (
                <div key={n.id} onClick={() => lidarComCliqueNotificacao(n.mensagem)} style={{ padding: '15px', borderRadius: '12px', background: n.lida ? configDesign.cores.fundoGeral : configDesign.cores.primaria + '15', marginBottom: '10px', border: `1px solid ${n.lida ? '#eee' : configDesign.cores.primaria}` }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: configDesign.cores.textoForte }}>{n.mensagem}</div>
                  <div style={{ fontSize: '10px', color: configDesign.cores.textoSuave, marginTop: '5px' }}>{n.data}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setHistoricoNotificacoes([])} style={{ margin: '20px', padding: '15px', border: 'none', background: '#fef2f2', color: configDesign.cores.alerta, borderRadius: '12px', fontWeight: 'bold' }}>Limpar Tudo</button>
          </div>
        </div>
      )}

      {/* MODAL CONFIG NOTIF */}
      {modalConfigNotifAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 6000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cards.fundo, width: '100%', maxWidth: '320px', borderRadius: '25px', padding: '25px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: configDesign.cores.textoForte }}>Alertas</h3>
            {[
              { id: 'precos', label: 'Preços Liberados' },
              { id: 'edicao', label: 'Edição de Lista' },
              { id: 'promocoes', label: 'Novas Promoções' },
              { id: 'novidades', label: 'Novos Produtos' }
            ].map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid #eee' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: configDesign.cores.textoForte }}>{item.label}</span>
                <input type="checkbox" checked={configNotif[item.id]} onChange={() => setConfigNotif({...configNotif, [item.id]: !configNotif[item.id]})} style={{ width: '20px', height: '20px' }} />
              </div>
            ))}
            <button onClick={() => setModalConfigNotifAberto(false)} style={{ width: '100%', marginTop: '20px', padding: '15px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '15px', fontWeight: 'bold', border: 'none' }}>SALVAR</button>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(5px)' }}>
           <button onClick={() => setProdutoExpandido(null)} style={{ alignSelf: 'flex-end', margin: '20px', color: '#fff', fontSize: '28px', background: 'none', border: 'none' }}>✕</button>
           <div style={{ flex: 1, backgroundImage: `url(${(produtoExpandido.foto_url || '').split(',')[0]})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', margin: '20px' }} />
           <div style={{ backgroundColor: configDesign.cards.fundo, padding: '30px 20px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
              <h2 style={{margin: 0, color: configDesign.cores.textoForte}}>{produtoExpandido.nome}</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0' }}>
                <span style={{color: configDesign.cores.primaria, fontSize: '24px', fontWeight: '900'}}>{produtoExpandido.preco}</span>
                <span style={{color: configDesign.cores.textoSuave}}>{produtoExpandido.unidade_medida}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '25px' }}>
                <button onClick={() => setQuantidade(Math.max(1, (parseInt(quantidade)||1)-1))} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '20px' }}>-</button>
                <input type="number" value={quantidade} onChange={(e) => tratarInputQuantidade(e.target.value)} style={{ width: '80px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold', border: 'none', background: 'none', color: configDesign.cores.textoForte }} />
                <button onClick={() => setQuantidade((parseInt(quantidade)||1)+1)} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '20px' }}>+</button>
              </div>
              <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '20px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '18px', border: 'none', fontWeight: '900' }}>ADICIONAR</button>
           </div>
        </div>
      )}

      {/* CARRINHO BOTÃO */}
      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: configDesign.cores.textoForte, color: '#fff', border: 'none', fontSize: '24px', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', zIndex: 100 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, color: '#fff', fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #fff' }}>{carrinho.reduce((a,c)=>a+c.quantidade,0)}</span>
        </button>
      )}

      {/* MODAL CARRINHO */}
      {modalCarrinhoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: configDesign.cores.fundoGeral, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', background: configDesign.cards.fundo, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
            <h2 style={{margin:0, color: configDesign.cores.textoForte}}>Meu Carrinho</h2>
            <button onClick={() => setModalCarrinhoAberto(false)} style={{background: 'none', border:'none', fontSize: '24px', color: configDesign.cores.textoForte}}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {carrinho.map(item => (
              <div key={item.id} style={{ padding: '15px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{fontWeight: 'bold', color: configDesign.cores.textoForte}}>{item.quantidade}x {item.nome}</span>
                  <div style={{fontSize: '11px', color: configDesign.cores.textoSuave}}>{formatarMoeda(item.total)}</div>
                </div>
                <button onClick={() => setCarrinho(carrinho.filter(i => i.id !== item.id))} style={{color: configDesign.cores.alerta, border: 'none', background: 'none'}}>Remover</button>
              </div>
            ))}
          </div>
          <div style={{ padding: '20px', background: configDesign.cards.fundo, borderTop: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', color: configDesign.cores.textoForte }}>
              <span>Total:</span>
              <span>{formatarMoeda(valorTotalCarrinho)}</span>
            </div>
            <button onClick={() => setModalRevisaoAberto(true)} style={{ width: '100%', padding: '20px', background: configDesign.cores.textoForte, color: '#fff', borderRadius: '18px', border: 'none', fontWeight: '900' }}>ENVIAR LISTA</button>
          </div>
        </div>
      )}

      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: configDesign.cards.fundo, width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '30px' }}>
            <h3 style={{marginTop: 0, textAlign: 'center', color: configDesign.cores.textoForte}}>Confirmar Pedido?</h3>
            <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '16px' }}>{enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR AGORA'}</button>
            <button onClick={() => setModalRevisaoAberto(false)} style={{ background: 'none', border: 'none', marginTop: '15px', color: configDesign.cores.textoSuave, width: '100%' }}>Cancelar</button>
          </div>
        </div>
      )}

    </div>
  );
}