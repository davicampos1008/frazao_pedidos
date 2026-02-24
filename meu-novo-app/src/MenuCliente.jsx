import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario, tema = 'claro' }) {
  
  const isEscuro = tema === 'escuro';

  // 🎛️ PAINEL DE CONTROLE V.I.R.T.U.S - ADAPTADO PARA MODO ESCURO
  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif"
    },
    cores: {
      fundoGeral: isEscuro ? '#121212' : '#f8fafc',
      primaria: '#f97316',      
      textoForte: isEscuro ? '#f1f5f9' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      promocao: '#eab308',      
      novidade: '#a855f7',      
      sucesso: '#22c55e',       
      alerta: '#ef4444'         
    },
    cards: {
      fundo: isEscuro ? '#1e1e1e' : '#ffffff',
      borda: isEscuro ? '#333333' : '#e2e8f0',
      raioBorda: '16px',
      sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.03)',
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
  
  // 💡 ESTADOS PWA E NOTIFICAÇÕES (MENU CLIENTE)
  const [permissaoPush, setPermissaoPush] = useState('default');
  const [eventoInstalacao, setEventoInstalacao] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const prevPrecosRef = useRef(false);
  const carrinhoRef = useRef(carrinho);
  const listaHojeRef = useRef(listaEnviadaHoje);

  const categorias = ['DESTAQUES', 'TODOS', 'FRUTAS', 'VERDURAS', 'LEGUMES', 'HORTALISSAS', 'CAIXARIAS', 'EMBANDEJADOS', 'SACARIAS', 'VARIADOS'];
  const hoje = new Date().toLocaleDateString('en-CA'); 

  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Matriz').replace(/^\d+\s*-\s*/, '').trim();

  useEffect(() => {
    localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho));
    carrinhoRef.current = carrinho;
  }, [carrinho]);

  useEffect(() => { listaHojeRef.current = listaEnviadaHoje; }, [listaEnviadaHoje]);

  // 💡 INICIALIZA E VERIFICA SE JÁ É UM APLICATIVO
  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);

    if ("Notification" in window) {
      setPermissaoPush(Notification.permission);
    }
    const escutarInstalacao = (e) => {
      e.preventDefault();
      setEventoInstalacao(e);
    };
    window.addEventListener('beforeinstallprompt', escutarInstalacao);
    return () => window.removeEventListener('beforeinstallprompt', escutarInstalacao);
  }, []);

  const solicitarPermissaoPush = async () => {
    if ("Notification" in window) {
      const permissao = await Notification.requestPermission();
      setPermissaoPush(permissao);
      if (permissao === "granted") mostrarNotificacao("Avisos ativados!", "sucesso");
    }
  };

  const instalarApp = async () => {
    if (eventoInstalacao) {
      eventoInstalacao.prompt();
      const { outcome } = await eventoInstalacao.userChoice;
      if (outcome === 'accepted') setEventoInstalacao(null);
    } else {
      alert("📲 Para instalar no iPhone: Toque no botão de Compartilhar do Safari (quadradinho com seta) e escolha 'Adicionar à Tela de Início'.\n\nNo Android, acesse pelo Google Chrome.");
    }
  };

  const dispararPushNotification = (titulo, mensagem) => {
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(titulo, { body: mensagem, icon: banners.logo || '/logo.png' }); } catch (e) {}
    }
  };

  const mostrarNotificacao = (mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
    dispararPushNotification(tituloPush, mensagem);
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > ultimoScroll.current && currentY > 150) {
        setNavState({ show: false, shrink: true }); 
      } else if (currentY < ultimoScroll.current) {
        setNavState({ show: true, shrink: currentY > 60 }); 
      }
      ultimoScroll.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarQtdUnidade = (qtd, und) => {
    const u = (und || 'UN').toUpperCase();
    if (qtd <= 1) return `${qtd} ${u}`;
    if (['UN', 'KG'].includes(u)) return `${qtd} ${u}`;
    if (u === 'MAÇO') return `${qtd} MAÇOS`;
    if (u === 'SACO') return `${qtd} SACOS`;
    return `${qtd} ${u}S`; 
  };

  async function carregarDados(silencioso = false) {
    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) {
        if (!prevPrecosRef.current && configData.precos_liberados && silencioso) {
          mostrarNotificacao("✅ PREÇOS LIBERADOS! Você já pode fazer seu pedido.", 'sucesso');
        }
        prevPrecosRef.current = configData.precos_liberados;
        setPrecosLiberados(configData.precos_liberados);
      }

      const { data: dbBanners } = await supabase.from('banners').select('*');
      if (dbBanners) {
        const bMap = {};
        dbBanners.forEach(b => bMap[b.posicao] = b.imagem_url);
        setBanners({
          topo: bMap.topo || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800',
          logo: bMap.logo || 'https://cdn-icons-png.flaticon.com/512/3143/3143636.png',
          tematico: bMap.tematico || 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&q=80&w=800'
        });
      }
      
      const { data: pData } = await supabase.from('produtos').select('*').neq('status_cotacao', 'falta').order('nome', { ascending: true });
      if (pData) setProdutos(pData);

      const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        if (pedidoExistente && pedidoExistente.length > 0) {
          if (silencioso && listaHojeRef.current) {
            const estavaAguardando = listaHojeRef.current.some(i => i.solicitou_refazer === true);
            const agoraEstaLiberado = pedidoExistente.some(i => i.liberado_edicao === true);
            if (estavaAguardando && agoraEstaLiberado) {
              mostrarNotificacao("🔓 PEDIDO APROVADO! Sua lista voltou para o carrinho.", 'sucesso');
            }
          }
          setListaEnviadaHoje(pedidoExistente);
        } else {
          setListaEnviadaHoje(null);
        }
      }
    } catch (e) { console.error("Erro ao carregar:", e); }
  }

  useEffect(() => { carregarDados(); }, [usuario]);
  useEffect(() => {
    const radar = setInterval(() => { carregarDados(true); }, 10000);
    return () => clearInterval(radar);
  }, [usuario]);

  const valorTotalCarrinho = carrinho.reduce((acc, item) => acc + (item.total || 0), 0);

  const edicaoLiberadaBD = listaEnviadaHoje?.some(item => item.liberado_edicao === true);
  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !edicaoLiberadaBD);

  const abrirProduto = (p) => {
    const prodAtualizado = produtos.find(item => item.id === p.id) || p;
    setProdutoExpandido(prodAtualizado);
    const itemNoCarrinho = carrinho.find(i => i.id === p.id);
    setQuantidade(itemNoCarrinho ? itemNoCarrinho.quantidade : 1);
  };
  
  const tratarInputQuantidade = (valorDigitado) => {
    const val = parseInt(valorDigitado, 10);
    if (isNaN(val) || val < 1) setQuantidade(''); 
    else setQuantidade(val);
  };

  const salvarNoCarrinho = () => {
    const qtdFinal = parseInt(quantidade, 10) || 1;
    const vUnit = tratarPreco(produtoExpandido.preco);
    
    if (vUnit === 0) {
      const confirma = window.confirm(`⚠️ AVISO DE COTAÇÃO ⚠️\n\nO item "${produtoExpandido.nome}" ainda não possui preço definido para hoje.\n\nO valor final ficará sujeito à cotação do momento da compra. Deseja confirmar este item na lista mesmo assim?`);
      if (!confirma) return; 
    }

    const valorTotalItem = vUnit * qtdFinal;
    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    
    if (itemEx) {
      setCarrinho(carrinho.map(i => i.id === produtoExpandido.id ? { ...i, quantidade: qtdFinal, total: valorTotalItem } : i));
    } else {
      setCarrinho([...carrinho, { ...produtoExpandido, quantidade: qtdFinal, valorUnit: vUnit, total: valorTotalItem }]);
    }
    setProdutoExpandido(null);
  };

  const alterarQtdCart = (id, delta) => {
    setCarrinho(prev => prev.map(item => {
      if (item.id === id) {
        const novaQtd = Math.max(1, item.quantidade + delta);
        return { ...item, quantidade: novaQtd, total: novaQtd * item.valorUnit };
      }
      return item;
    }));
  };

  const alterarQtdCartInput = (id, valor) => {
    const novaQtd = parseInt(valor, 10) || 1;
    setCarrinho(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantidade: novaQtd, total: novaQtd * item.valorUnit };
      }
      return item;
    }));
  };

  const zerarCarrinho = () => {
    if (window.confirm("⚠️ Tem certeza que deseja apagar todos os itens do carrinho?")) {
      setCarrinho([]);
      setModalCarrinhoAberto(false);
    }
  };

  const confirmarEnvio = async () => {
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    if (!codLoja) return alert("🚨 ERRO: Seu usuário não tem uma Loja vinculada.");

    setEnviandoPedido(true);
    try {
      const dataFixa = new Date().toISOString().split('T')[0];
      const dadosParaEnviar = carrinho.map(item => ({
        loja_id: codLoja, nome_usuario: usuario?.nome || "Operador", nome_produto: item.nome, quantidade: item.quantidade,
        unidade_medida: item.unidade_medida || 'UN', data_pedido: dataFixa, solicitou_refazer: false, liberado_edicao: false, status_compra: 'pendente' 
      }));

      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const { error } = await supabase.from('pedidos').insert(dadosParaEnviar);
      if (error) throw error;

      setCarrinho([]); 
      localStorage.removeItem('carrinho_virtus');
      
      setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false);
      await carregarDados(false); 
      window.scrollTo(0,0);
      mostrarNotificacao("🚀 LISTA ENVIADA COM SUCESSO!", 'sucesso', 'Pedido Realizado');
    } catch (err) { alert("Erro ao gravar: " + err.message); } 
    finally { setEnviandoPedido(false); }
  };

  const pedirParaEditar = async () => {
    if(!window.confirm("Pedir ao administrador para liberar a edição da lista?")) return;
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    try {
        await supabase.from('pedidos').update({ solicitou_refazer: true }).eq('data_pedido', hoje).eq('loja_id', codLoja);
        mostrarNotificacao("✅ Solicitação enviada! O app vai te avisar quando for liberado.", 'sucesso', 'Aguardando Aprovação');
        await carregarDados(false); 
    } catch (err) { alert("Erro ao solicitar: " + err.message); }
  };

  const importarParaCarrinho = async () => {
    if(!window.confirm("Isso vai voltar os itens para o carrinho para você ajustar. Continuar?")) return;
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    try {
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const itensRestaurados = listaEnviadaHoje.map(dbItem => {
        const prodOriginal = produtos.find(p => p.nome === dbItem.nome_produto);
        if (prodOriginal) {
          const vUnit = tratarPreco(prodOriginal.preco);
          return { ...prodOriginal, quantidade: dbItem.quantidade, valorUnit: vUnit, total: vUnit * dbItem.quantidade };
        }
        return { id: Math.random(), nome: dbItem.nome_produto, quantidade: dbItem.quantidade, valorUnit: 0, total: 0, unidade_medida: dbItem.unidade_medida };
      });
      setCarrinho(itensRestaurados);
      setListaEnviadaHoje(null);
      setModoVisualizacao(false);
      mostrarNotificacao("🛒 Itens de volta no carrinho! Altere o que precisar.", 'info', 'Carrinho Restaurado');
    } catch (err) { alert("Erro ao importar: " + err.message); }
  };

  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardandoLiberacao = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);

    return (
      <div style={{ padding: '20px', fontFamily: configDesign.geral.fontePadrao, textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', paddingBottom: '50px', transition: configDesign.animacoes.transicaoSuave }}>
        
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
          {notificacoes.map(notif => (
            <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? configDesign.cores.alerta : notif.tipo === 'sucesso' ? configDesign.cores.sucesso : configDesign.cores.primaria, color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '13px', animation: 'fadeInDown 0.4s ease-out' }}>
              <span>{notif.mensagem}</span>
            </div>
          ))}
        </div>
        <style>{`@keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : (aguardandoLiberacao ? configDesign.cores.promocao : (isEscuro ? '#333' : '#111')), color: '#fff', padding: '40px 30px', borderRadius: '30px', boxShadow: configDesign.cards.sombra, marginTop: '20px' }}>
          <div style={{fontSize: '50px', marginBottom: '10px'}}>{edicaoLiberada ? '🔓' : (aguardandoLiberacao ? '⏳' : '✅')}</div>
          <h2 style={{ margin: 0 }}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : (aguardandoLiberacao ? 'AGUARDANDO ADMIN' : 'PEDIDO ENVIADO!')}</h2>
          <p style={{ margin: 0, opacity: 0.9, marginTop: '10px' }}>{edicaoLiberada ? 'Sua lista foi devolvida para o carrinho.' : (aguardandoLiberacao ? 'Aguarde a central liberar a edição da sua lista.' : 'Sua loja já enviou a lista de hoje com sucesso.')}</p>
        </div>

        <div style={{ textAlign: 'left', marginTop: '25px', background: configDesign.cards.fundo, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cards.borda}`, maxHeight: '40vh', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '14px', color: configDesign.cores.textoSuave, marginBottom: '15px', marginTop: 0 }}>RESUMO DO PEDIDO:</h3>
          {listaEnviadaHoje.map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cards.borda}`, display: 'flex', justifyContent: 'space-between', color: configDesign.cores.textoForte }}>
              <span><b>{item.quantidade}x</b> {item.nome_produto}</span><small style={{ color: configDesign.cores.textoSuave }}>{item.unidade_medida}</small>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={() => carregarDados(false)} style={{ background: isEscuro ? '#333' : '#f1f5f9', border: 'none', padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold', cursor: 'pointer' }}>🔄 ATUALIZAR STATUS AGORA</button>
          
          {edicaoLiberada ? (
            <button onClick={importarParaCarrinho} style={{ background: configDesign.cores.sucesso, border: 'none', padding: '18px', borderRadius: '15px', color: '#fff', fontWeight: '900', cursor: 'pointer', boxShadow: '0 5px 15px rgba(34,197,94,0.3)' }}>
              📥 PUXAR PARA O CARRINHO E EDITAR
            </button>
          ) : (
            <button onClick={aguardandoLiberacao ? null : pedirParaEditar} style={{ background: configDesign.cards.fundo, border: `2px solid ${aguardandoLiberacao ? configDesign.cards.borda : configDesign.cores.textoForte}`, padding: '18px', borderRadius: '15px', color: aguardandoLiberacao ? configDesign.cores.textoSuave : configDesign.cores.textoForte, fontWeight: 'bold', cursor: aguardandoLiberacao ? 'not-allowed' : 'pointer' }}>
              {aguardandoLiberacao ? '⏳ SOLICITAÇÃO PENDENTE...' : '✏️ SOLICITAR EDIÇÃO DE LISTA'}
            </button>
          )}
          
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, fontWeight: '900', cursor: 'pointer', textDecoration: 'underline' }}>
            VOLTAR AO INÍCIO (APENAS VISUALIZAR)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px', transition: configDesign.animacoes.transicaoSuave }}>
      
      {/* TOASTS DE NOTIFICAÇÃO */}
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
        {notificacoes.map(notif => (
          <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? configDesign.cores.alerta : configDesign.cores.sucesso, color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '13px' }}>
            <span>{notif.mensagem}</span>
          </div>
        ))}
      </div>

      {/* HEADER DE BOAS VINDAS */}
      <div style={{ padding: '25px 20px 15px 20px', backgroundColor: configDesign.cards.fundo, borderBottom: `1px solid ${configDesign.cards.borda}`, display: 'flex', flexDirection: 'column', gap: '15px', transition: configDesign.animacoes.transicaoSuave }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: configDesign.cores.textoForte, fontWeight: '900' }}>
              {saudacao}, {primeiroNome}!
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: configDesign.cores.primaria, fontWeight: '900', textTransform: 'uppercase' }}>
              📍 {nomeLojaLimpo}
            </p>
          </div>
          {modoVisualizacao && (
            <button onClick={() => setModoVisualizacao(false)} style={{ background: isEscuro ? '#333' : '#f1f5f9', color: configDesign.cores.textoForte, border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
              ⬅️ VER PEDIDO
            </button>
          )}
        </div>

        {/* 💡 BOTÕES PWA E PUSH (OCULTAM SE ATIVADOS) */}
        {(!isStandalone || permissaoPush === 'default') && !modoVisualizacao && (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px', scrollbarWidth: 'none' }}>
            {!isStandalone && (
              <button onClick={instalarApp} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📥 INSTALAR APP NA TELA
              </button>
            )}
            {permissaoPush === 'default' && (
              <button onClick={solicitarPermissaoPush} style={{ background: isEscuro ? '#333' : '#fef3c7', color: isEscuro ? '#fbbf24' : '#d97706', border: 'none', padding: '10px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                🔔 ATIVAR AVISOS
              </button>
            )}
          </div>
        )}
      </div>

      {/* AVISO DE VISUALIZAÇÃO/BLOQUEIO */}
      {isAppTravado && (
        <div style={{ backgroundColor: isEscuro ? '#422006' : '#fefce8', color: isEscuro ? '#fef08a' : '#a16207', padding: '12px 20px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
          ⚠️ {modoVisualizacao ? 'Modo de visualização. Seu pedido já foi enviado hoje.' : 'Os preços de hoje ainda estão sendo atualizados pela central.'}
        </div>
      )}

      {/* BANNERS GIGANTES */}
      {categoriaAtiva === 'DESTAQUES' && (
        <div style={{ backgroundColor: configDesign.cores.fundoGeral }}>
          <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
          <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'flex-start', marginTop: '-40px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}></div>
          </div>
          <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: '0' }}></div>
        </div>
      )}

      {/* CABEÇALHO DE BUSCA */}
      <div style={{ 
        position: categoriaAtiva === 'DESTAQUES' ? 'relative' : 'fixed', 
        top: categoriaAtiva === 'DESTAQUES' ? '0' : (navState.show ? '0' : '-100px'), 
        left: 0, right: 0, 
        zIndex: 100, 
        backgroundColor: categoriaAtiva === 'DESTAQUES' ? configDesign.cores.fundoGeral : (isEscuro ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)'), 
        backdropFilter: categoriaAtiva === 'DESTAQUES' ? 'none' : 'blur(10px)', 
        borderBottom: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? `1px solid ${configDesign.cards.borda}` : 'none', 
        transition: configDesign.animacoes.transicaoSuave,
        opacity: categoriaAtiva === 'DESTAQUES' || navState.show ? 1 : 0,
        boxShadow: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? configDesign.cards.sombra : 'none',
        paddingTop: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? '10px' : '20px', 
        paddingBottom: '10px',
        marginTop: categoriaAtiva === 'DESTAQUES' ? '15px' : '0'
      }}>
        <div style={{ padding: '0 20px 10px 20px' }}>
          <div style={{ backgroundColor: isEscuro ? '#333' : '#f1f5f9', borderRadius: '12px', padding: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '8px 12px' : '12px', display: 'flex', gap: '10px', transition: configDesign.animacoes.transicaoSuave }}>
            <span>🔍</span><input placeholder="Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} />
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categorias.map(cat => (
            <button key={cat} onClick={() => { setCategoriaAtiva(cat); window.scrollTo({top:0, behavior:'smooth'}); }} style={{ paddingBottom: '10px', whiteSpace: 'nowrap', fontWeight: '900', background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', cursor: 'pointer', fontSize: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '11px' : '13px', transition: configDesign.animacoes.transicaoSuave }}>{cat}</button>
          ))}
        </div>
      </div>

      <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '10px' : '110px' }}></div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '0 20px 20px 20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
          if (!(p.nome || '').toLowerCase().includes(buscaMenu.toLowerCase())) return false;
          if (categoriaAtiva === 'TODOS') return true;
          if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
          return p.categoria === categoriaAtiva;
        }).map(p => {
          const itemNoCarrinho = carrinho.find(i => i.id === p.id);
          
          let corBorda = configDesign.cards.borda;
          let selo = null;
          
          if (p.promocao) {
            corBorda = configDesign.cores.promocao;
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>PROMOÇÃO</div>;
          } else if (p.novidade) {
            corBorda = configDesign.cores.novidade;
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>NOVIDADE</div>;
          } else if (itemNoCarrinho) {
            corBorda = configDesign.cores.primaria;
          }

          const alturaImg = categoriaAtiva === 'DESTAQUES' ? configDesign.cards.alturaImgDestaque : configDesign.cards.alturaImgPequena;

          return (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ border: `2px solid ${corBorda}`, borderRadius: configDesign.cards.raioBorda, overflow: 'visible', padding: '10px', cursor: 'pointer', position: 'relative', backgroundColor: configDesign.cards.fundo, boxShadow: configDesign.cards.sombra, display: 'flex', flexDirection: 'column', gap: '8px', marginTop: selo ? '10px' : '0', transition: configDesign.animacoes.transicaoSuave }}>
               {selo}
               {itemNoCarrinho && !selo && <div style={{position: 'absolute', top: '-8px', right: '-8px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: '900', fontSize: '11px', border: `2px solid ${configDesign.cards.fundo}`, zIndex: 2}}>{itemNoCarrinho.quantidade}</div>}
               
               <div style={{ height: alturaImg, borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: isEscuro ? '#333' : '#f1f5f9' }} />
               
               <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                 <strong style={{ fontSize: categoriaAtiva === 'DESTAQUES' ? '14px' : '11px', color: configDesign.cores.textoForte, lineHeight: '1.2', height: categoriaAtiva === 'DESTAQUES' ? 'auto' : '26px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                   {p.nome}
                 </strong>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: '5px' }}>
                   <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: categoriaAtiva === 'DESTAQUES' ? '18px' : '13px' }}>{p.preco || 'R$ 0,00'}</span>
                   <span style={{ fontSize: '10px', color: configDesign.cores.textoSuave, fontWeight: 'bold', background: isEscuro ? '#333' : '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                     {itemNoCarrinho ? formatarQtdUnidade(itemNoCarrinho.quantidade, p.unidade_medida) : (p.unidade_medida || 'UN')}
                   </span>
                 </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* BOTÃO CARRINHO FLUTUANTE */}
      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', backgroundColor: configDesign.cores.primaria, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(249,115,22,0.4)', fontSize: '24px', zIndex: 500, cursor: 'pointer', transition: configDesign.animacoes.transicaoSuave, transform: navState.show ? 'translateY(0)' : 'translateY(20px)' }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.textoForte, color: configDesign.cards.fundo, fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: `2px solid ${configDesign.cores.primaria}`, fontWeight: 'bold' }}>{carrinho.reduce((a,c)=>a+c.quantidade,0)}</span>
        </button>
      )}

      {/* 🛠️ MODAL DO PRODUTO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(5px)' }}>
           <button onClick={() => setProdutoExpandido(null)} style={{ alignSelf: 'flex-end', margin: '20px', color: '#fff', fontSize: '28px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
           
           <div style={{ flex: 1, backgroundImage: `url(${(produtoExpandido.foto_url || '').split(',')[0]})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', margin: '20px' }} />
           
           <div style={{ backgroundColor: configDesign.cards.fundo, padding: '30px 20px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px', boxShadow: '0 -10px 30px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, flex: 1}}>{produtoExpandido.nome}</h2>
                <span style={{ fontSize: '12px', background: isEscuro ? '#333' : '#f1f5f9', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', color: configDesign.cores.textoSuave }}>Vendido por {produtoExpandido.unidade_medida || 'UN'}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingBottom: '15px', borderBottom: `1px dashed ${configDesign.cards.borda}` }}>
                <div>
                  <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, fontWeight: 'bold', display: 'block' }}>Preço Unitário</span>
                  <span style={{color: configDesign.cores.primaria, fontSize: '20px', fontWeight: '900'}}>{produtoExpandido.preco}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, fontWeight: 'bold', display: 'block' }}>Total de {formatarQtdUnidade((parseInt(quantidade) || 1), produtoExpandido.unidade_medida)}</span>
                  <span style={{color: configDesign.cores.textoForte, fontSize: '24px', fontWeight: '900'}}>{formatarMoeda(tratarPreco(produtoExpandido.preco) * (parseInt(quantidade) || 1))}</span>
                </div>
              </div>

              {!isAppTravado ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', margin: '25px 0' }}>
                     <button onClick={() => tratarInputQuantidade(Math.max(1, (parseInt(quantidade) || 0) - 1))} style={{ width: '55px', height: '55px', fontSize: '24px', borderRadius: '15px', border: 'none', background: isEscuro ? '#333' : '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', color: configDesign.cores.textoSuave }}>-</button>
                     <div style={{ position: 'relative' }}>
                       <input 
                         type="number" value={quantidade} onChange={(e) => tratarInputQuantidade(e.target.value)}
                         style={{ width: '80px', height: '55px', fontSize: '24px', fontWeight: '900', textAlign: 'center', borderRadius: '15px', border: `2px solid ${configDesign.cores.primaria}`, outline: 'none', color: configDesign.cores.textoForte, background: 'transparent' }}
                       />
                     </div>
                     <button onClick={() => tratarInputQuantidade((parseInt(quantidade) || 0) + 1)} style={{ width: '55px', height: '55px', fontSize: '24px', borderRadius: '15px', border: 'none', background: isEscuro ? '#333' : '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', color: configDesign.cores.textoSuave }}>+</button>
                  </div>
                  <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '22px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '15px', cursor: 'pointer' }}>
                    {carrinho.find(i => i.id === produtoExpandido.id) ? 'ATUALIZAR QUANTIDADE' : 'ADICIONAR AO CARRINHO'}
                  </button>
                </>
              ) : (
                <div style={{ marginTop: '25px' }}>
                  <button disabled style={{ width: '100%', padding: '22px', background: isEscuro ? '#333' : '#e2e8f0', color: configDesign.cores.textoSuave, border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '13px' }}>
                    🔒 {modoVisualizacao ? 'PEDIDO JÁ ENVIADO' : 'AGUARDANDO LIBERAÇÃO DE PREÇOS'}
                  </button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* 🛠️ MODAL DO CARRINHO */}
      {modalCarrinhoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: configDesign.cards.fundo, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cards.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontWeight: '900', color: configDesign.cores.textoForte }}>Meu Carrinho</h2>
            <button onClick={() => { setModalCarrinhoAberto(false); setItemEditandoId(null); }} style={{ border: 'none', background: isEscuro ? '#333' : '#f1f5f9', color: configDesign.cores.textoForte, borderRadius: '50%', width: '40px', height: '40px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ padding: '10px 20px' }}>
            <button onClick={zerarCarrinho} style={{ width: '100%', padding: '12px', background: isEscuro ? '#450a0a' : '#fef2f2', color: configDesign.cores.alerta, border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>🗑️ ESVAZIAR CARRINHO</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
            {carrinho.map(item => (
              <div key={item.id} style={{ padding: '15px 0', borderBottom: `1px solid ${configDesign.cards.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {itemEditandoId === item.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                     <button onClick={() => alterarQtdCart(item.id, -1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: isEscuro ? '#333' : '#f1f5f9', color: configDesign.cores.textoForte, fontSize: '18px', cursor: 'pointer', fontWeight: 'bold'}}>-</button>
                     <input type="number" value={item.quantidade} onChange={(e) => alterarQtdCartInput(item.id, e.target.value)} style={{ width: '45px', height: '35px', textAlign: 'center', fontWeight: '900', borderRadius: '8px', border: `1px solid ${configDesign.cards.borda}`, background: 'transparent', color: configDesign.cores.textoForte }} />
                     <button onClick={() => alterarQtdCart(item.id, 1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: isEscuro ? '#333' : '#f1f5f9', color: configDesign.cores.textoForte, fontSize: '18px', cursor: 'pointer', fontWeight: 'bold'}}>+</button>
                     <button onClick={() => setItemEditandoId(null)} style={{marginLeft: 'auto', background: configDesign.cores.sucesso, color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>OK</button>
                  </div>
                ) : (
                  <div onClick={() => setItemEditandoId(item.id)} style={{ cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria, fontSize: '15px'}}>{formatarQtdUnidade(item.quantidade, item.unidade_medida)}</b> de {item.nome}</span>
                      <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item.valorUnit)} / {item.unidade_medida || 'UN'} • Toque para editar qtd</div>
                    </div>
                    <div style={{ fontWeight: '900', color: configDesign.cores.textoForte, fontSize: '14px', whiteSpace: 'nowrap' }}>
                      {formatarMoeda(item.total)}
                    </div>
                  </div>
                )}
                {itemEditandoId !== item.id && ( <button onClick={() => setCarrinho(carrinho.filter(i => i.id !== item.id))} style={{ color: configDesign.cores.alerta, border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer', padding: '10px' }}>Remover</button> )}
              </div>
            ))}
          </div>
          <div style={{ padding: '20px', borderTop: `1px solid ${configDesign.cards.borda}`, background: configDesign.cores.fundoGeral }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: '900', fontSize: '18px', color: configDesign.cores.textoForte }}><span>Total Estimado:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
            <button onClick={() => setModalRevisaoAberto(true)} style={{ width: '100%', padding: '22px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '18px', fontWeight: '900', fontSize: '15px', cursor: 'pointer', boxShadow: '0 5px 15px rgba(249,115,22,0.3)' }}>REVISAR E ENVIAR</button>
          </div>
        </div>
      )}

      {/* 🛠️ MODAL DE REVISÃO E ENVIO */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: configDesign.cards.fundo, width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '30px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <h3 style={{marginTop: 0, textAlign: 'center', fontWeight: '900', color: configDesign.cores.textoForte}}>Confirmação do Pedido</h3>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', borderTop: `1px solid ${configDesign.cards.borda}`, borderBottom: `1px solid ${configDesign.cards.borda}`, padding: '10px 0' }}>
                {carrinho.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px dashed ${configDesign.cards.borda}` }}>
                        <div>
                          <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria}}>{formatarQtdUnidade(item.quantidade, item.unidade_medida)}</b> de {item.nome}</span>
                          <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item.valorUnit)} / {item.unidade_medida || 'UN'}</div>
                        </div>
                        <span style={{fontWeight: 'bold', color: configDesign.cores.textoSuave}}>{formatarMoeda(item.total)}</span>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontWeight: '900', fontSize: '20px', color: configDesign.cores.textoForte }}><span>TOTAL FINAL:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
            <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', boxShadow: '0 5px 15px rgba(34,197,94,0.3)' }}>{enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR ENVIO'}</button>
            <button onClick={() => setModalRevisaoAberto(false)} style={{ background: 'none', border: 'none', marginTop: '15px', color: configDesign.cores.textoSuave, fontWeight: 'bold', cursor: 'pointer' }}>Voltar e editar carrinho</button>
          </div>
        </div>
      )}
    </div>
  );
}