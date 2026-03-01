import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario, tema }) {

  const isEscuro = tema === 'escuro';

  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif"
    },
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',  
      primaria: '#f97316',      
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9',
      promocao: '#eab308',      
      novidade: '#a855f7',      
      sucesso: '#22c55e',       
      alerta: '#ef4444'         
    },
    cards: {
      raioBorda: '16px',
      sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.03)',
      alturaImgDestaque: '220px', 
      alturaImgPequena: '85px'    
    },
    animacoes: {
      transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }
  };

  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacaoStr = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Matriz').replace(/^\d+\s*-\s*/, '').trim();

  const categoriasDinamicas = [
    'DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', 
    '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', 
    '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA'
  ];

  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  
  // 💡 ANTIVÍRUS DE MEMÓRIA: Limpa itens corrompidos salvos em celulares
  const [carrinho, setCarrinho] = useState(() => {
    try {
      const salvo = localStorage.getItem('carrinho_virtus');
      if (!salvo) return [];
      const parseado = JSON.parse(salvo);
      if (!Array.isArray(parseado)) return [];
      
      // Filtra apenas itens válidos (Evita tela branca)
      const carrinhoLimpo = parseado.filter(item => item && typeof item === 'object' && item.id && item.nome);
      return carrinhoLimpo;
    } catch (e) { 
      localStorage.removeItem('carrinho_virtus');
      return []; 
    }
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
    try {
      const salvo = localStorage.getItem('historico_notif_virtus');
      const parseado = salvo ? JSON.parse(salvo) : [];
      return Array.isArray(parseado) ? parseado : [];
    } catch (e) { return []; }
  });

  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [modalConfigNotifAberto, setModalConfigNotifAberto] = useState(false);
  const [configNotif, setConfigNotif] = useState({ precos: true, edicao: true, promocoes: true, novidades: true });
  
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);

  const produtosCarregadosRef = useRef(false);
  const dataUltimoCarregamento = useRef(0);

  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    const handleInstall = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, [configDesign.cores.fundoGeral]);

  useEffect(() => {
    if (usuario?.senha === '123456' || usuario?.senha === usuario?.codigo_loja?.toString()) {
      setTimeout(() => {
        alert("⚠️ Aviso de Segurança: Detectamos que você está usando uma senha padrão. Por favor, clique na engrenagem no topo da tela e altere sua senha para proteger sua conta.");
      }, 1500);
    }
  }, [usuario]);

  const instalarApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  useEffect(() => {
    localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho));
  }, [carrinho]);

  useEffect(() => {
    localStorage.setItem('historico_notif_virtus', JSON.stringify(historicoNotificacoes));
  }, [historicoNotificacoes]);

  useEffect(() => {
    if ("Notification" in window) setPermissaoPush(Notification.permission);
  }, []);

  const lidarComCliqueNotificacao = useCallback((msg) => {
    if (!produtos.length) return;
    const nomeProduto = msg.match(/"([^"]+)"/) || msg.match(/PROMOÇÃO: (.*?) por/);
    if (nomeProduto && nomeProduto[1]) {
      const prod = produtos.find(p => p.nome.toLowerCase().includes(nomeProduto[1].toLowerCase()));
      if (prod) {
        setModalNotificacoesAberto(false);
        setProdutoExpandido(prod);
        setQuantidade(carrinho.find(i => i.id === prod.id)?.quantidade || 1);
      }
    }
  }, [produtos, carrinho]);

  const mostrarNotificacao = (mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 20));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
    
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(tituloPush, { body: mensagem, icon: banners.logo });
        n.onclick = (e) => { e.preventDefault(); window.focus(); lidarComCliqueNotificacao(mensagem); n.close(); };
      } catch (e) {}
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > ultimoScroll.current && currentY > 150) setNavState({ show: false, shrink: true }); 
      else if (currentY < ultimoScroll.current) setNavState({ show: true, shrink: currentY > 60 }); 
      ultimoScroll.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  
  const formatarMoeda = (v) => {
    const num = Number(v);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatarQtdUnidade = (qtd, und) => {
    const u = String(und || 'UN').toUpperCase();
    const q = Number(qtd);
    const qFinal = isNaN(q) ? 1 : q;
    if (qFinal <= 1 || ['UN', 'KG'].includes(u)) return `${qFinal} ${u}`;
    if (u === 'MAÇO') return `${qFinal} MAÇOS`;
    if (u === 'SACO') return `${qFinal} SACOS`;
    return `${qFinal} ${u}S`;
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    const agora = Date.now();
    if (silencioso && agora - dataUltimoCarregamento.current < 8000) return;
    dataUltimoCarregamento.current = agora;

    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) setPrecosLiberados(configData.precos_liberados);

      if (!produtosCarregadosRef.current) {
        const { data: dbBanners } = await supabase.from('banners').select('*');
        if (dbBanners) {
          const bMap = {};
          dbBanners.forEach(b => bMap[b.posicao] = b.imagem_url);
          setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
        }
        
        const { data: pData } = await supabase.from('produtos').select('*').neq('status_cotacao', 'falta').order('nome', { ascending: true });
        if (pData) {
          setProdutos(pData);
          produtosCarregadosRef.current = true;
        }
      }

      const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(pedidoExistente?.length > 0 ? pedidoExistente : null);
      }
    } catch (e) { console.error("Erro VIRTUS:", e); }
  }, [usuario, hoje]);

  useEffect(() => { carregarDados(); }, [carregarDados]);
  useEffect(() => {
    const radar = setInterval(() => carregarDados(true), 20000);
    return () => clearInterval(radar);
  }, [carregarDados]);

  const valorTotalCarrinho = carrinho.reduce((acc, item) => acc + (Number(item?.total) || 0), 0);
  const edicaoLiberadaBD = listaEnviadaHoje?.some(item => item.liberado_edicao === true);
  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !edicaoLiberadaBD);

  const abrirProduto = (p) => {
    setProdutoExpandido(p);
    setQuantidade(carrinho.find(i => i.id === p.id)?.quantidade || 1);
  };
  
  const tratarInputQuantidade = (valorDigitado) => {
    const val = parseInt(valorDigitado, 10);
    setQuantidade(isNaN(val) || val < 1 ? '' : val);
  };

  const salvarNoCarrinho = () => {
    const qtdFinal = parseInt(quantidade, 10) || 1;
    const vUnit = tratarPreco(produtoExpandido.preco);
    if (vUnit === 0 && !window.confirm(`O item "${produtoExpandido.nome}" não possui preço. Confirmar?`)) return;
    
    const valorTotalItem = vUnit * qtdFinal;
    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    
    if (itemEx) {
      setCarrinho(carrinho.map(i => i.id === produtoExpandido.id ? { ...i, quantidade: qtdFinal, total: valorTotalItem, valorUnit: vUnit } : i));
    } else {
      setCarrinho([...carrinho, { ...produtoExpandido, quantidade: qtdFinal, valorUnit: vUnit, total: valorTotalItem }]);
    }
    setProdutoExpandido(null);
  };

  const alterarQtdCart = (id, delta) => {
    setCarrinho(prev => prev.map(item => {
      if (item.id === id) {
        const novaQtd = Math.max(1, (Number(item.quantidade) || 0) + delta);
        return { ...item, quantidade: novaQtd, total: novaQtd * (Number(item.valorUnit) || 0) };
      }
      return item;
    }));
  };

  const alterarQtdCartInput = (id, valor) => {
    const novaQtd = parseInt(valor, 10) || 1;
    setCarrinho(prev => prev.map(item => item.id === id ? { ...item, quantidade: novaQtd, total: novaQtd * (Number(item.valorUnit) || 0) } : item));
  };

  const confirmarEnvio = async () => {
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    if (!codLoja) return alert("🚨 ERRO: Seu usuário não tem uma Loja vinculada.");

    setEnviandoPedido(true);
    try {
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const dadosParaEnviar = carrinho.map(item => ({
        loja_id: codLoja, nome_usuario: usuario?.nome || "Operador", nome_produto: item.nome, quantidade: item.quantidade || 1,
        unidade_medida: item.unidade_medida || 'UN', data_pedido: hoje, solicitou_refazer: false, liberado_edicao: false, status_compra: 'pendente' 
      }));
      const { error } = await supabase.from('pedidos').insert(dadosParaEnviar);
      if (error) throw error;

      setCarrinho([]); 
      localStorage.removeItem('carrinho_virtus');
      setModalRevisaoAberto(false); 
      setModalCarrinhoAberto(false); 
      setModoVisualizacao(false);
      await carregarDados(false); 
      window.scrollTo(0,0);
      mostrarNotificacao("🚀 LISTA ENVIADA COM SUCESSO!", 'sucesso');
    } catch (err) { alert("Erro ao gravar: " + err.message); } 
    finally { setEnviandoPedido(false); }
  };

  const pedirParaEditar = async () => {
    if(!window.confirm("Pedir ao administrador para liberar a edição da lista?")) return;
    const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
    try {
        await supabase.from('pedidos').update({ solicitou_refazer: true }).eq('data_pedido', hoje).eq('loja_id', codLoja);
        mostrarNotificacao("✅ Solicitação enviada! Aguardando aprovação.", 'sucesso');
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
      mostrarNotificacao("🛒 Itens de volta no carrinho!", 'info');
    } catch (err) { alert("Erro ao importar: " + err.message); }
  };

  const salvarNovaSenha = async () => {
    if(!dadosSenha.antiga || !dadosSenha.nova || !dadosSenha.confirma) return setErroSenha("Preencha todos os campos.");
    if(dadosSenha.nova !== dadosSenha.confirma) return setErroSenha("A nova senha não confere.");
    if(dadosSenha.nova.length < 6) return setErroSenha("A nova senha deve ter no mínimo 6 caracteres.");
    
    setCarregandoSenha(true); setErroSenha('');
    try {
      const { data: u, error: errU } = await supabase.from('usuarios').select('*').eq('nome', usuario.nome).single();
      if(errU || !u) throw new Error("Usuário não encontrado.");
      if(u.senha !== dadosSenha.antiga) throw new Error("A senha antiga está incorreta.");
      
      const { error } = await supabase.from('usuarios').update({ senha: dadosSenha.nova }).eq('id', u.id);
      if(error) throw error;
      
      mostrarNotificacao("🔒 Senha alterada com sucesso!", 'sucesso');
      setModalSenhaAberto(false);
      setDadosSenha({ antiga: '', nova: '', confirma: '' });
    } catch (err) { setErroSenha(err.message); } finally { setCarregandoSenha(false); }
  };

  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardandoLiberacao = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);

    return (
      <div style={{ padding: '20px', fontFamily: configDesign.geral.fontePadrao, textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', paddingBottom: '50px' }}>
        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : (aguardandoLiberacao ? configDesign.cores.promocao : configDesign.cores.textoForte), color: isEscuro && !edicaoLiberada && !aguardandoLiberacao ? '#000' : '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <div style={{fontSize: '50px', marginBottom: '10px'}}>{edicaoLiberada ? '🔓' : (aguardandoLiberacao ? '⏳' : '✅')}</div>
          <h2 style={{ margin: 0 }}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : (aguardandoLiberacao ? 'AGUARDANDO ADMIN' : 'PEDIDO ENVIADO!')}</h2>
        </div>
        <div style={{ textAlign: 'left', marginTop: '25px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, maxHeight: '40vh', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '14px', color: configDesign.cores.textoSuave, marginBottom: '15px', marginTop: 0 }}>RESUMO DO PEDIDO:</h3>
          {listaEnviadaHoje.map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{color: configDesign.cores.textoForte}}><b>{item.quantidade}x</b> {item.nome_produto}</span><small style={{ color: configDesign.cores.textoSuave }}>{item.unidade_medida}</small>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={() => carregarDados(false)} style={{ background: configDesign.cores.inputFundo, border: `1px solid ${configDesign.cores.borda}`, padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS AGORA</button>
          {edicaoLiberada ? (
            <button onClick={importarParaCarrinho} style={{ background: configDesign.cores.sucesso, border: 'none', padding: '18px', borderRadius: '15px', color: '#fff', fontWeight: '900' }}>📥 PUXAR PARA O CARRINHO E EDITAR</button>
          ) : (
            <button onClick={aguardandoLiberacao ? null : pedirParaEditar} style={{ background: configDesign.cores.fundoCards, border: `2px solid ${aguardandoLiberacao ? configDesign.cores.borda : configDesign.cores.textoForte}`, padding: '18px', borderRadius: '15px', color: aguardandoLiberacao ? configDesign.cores.textoSuave : configDesign.cores.textoForte, fontWeight: 'bold' }}>
              {aguardandoLiberacao ? '⏳ SOLICITAÇÃO PENDENTE...' : '✏️ SOLICITAR EDIÇÃO DE LISTA'}
            </button>
          )}
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, fontWeight: '900', textDecoration: 'underline' }}>VOLTAR AO INÍCIO (APENAS VISUALIZAR)</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px' }}>
      
      {/* HEADER */}
      <div style={{ padding: '25px 20px 15px 20px', backgroundColor: configDesign.cores.fundoCards, borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: configDesign.cores.textoForte, fontWeight: '900' }}>{saudacaoStr}, {primeiroNome}!</h2>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: configDesign.cores.primaria, fontWeight: '900', textTransform: 'uppercase' }}>📍 {nomeLojaLimpo}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px', fontSize: '20px' }}>⚙️</button>
          <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px', position: 'relative' }}>
            <span style={{ fontSize: '20px' }}>🔔</span>
            {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
          </button>
        </div>
      </div>

      {/* BANNERS */}
      {categoriaAtiva === 'DESTAQUES' && (
        <div style={{ backgroundColor: configDesign.cores.fundoGeral }}>
          <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
          <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'flex-start', marginTop: '-40px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }}></div>
          </div>
          <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
        </div>
      )}

      {/* MENU CATEGORIAS */}
      <div style={{ position: categoriaAtiva === 'DESTAQUES' ? 'relative' : 'fixed', top: categoriaAtiva === 'DESTAQUES' ? '0' : (navState.show ? '0' : '-100px'), left: 0, right: 0, zIndex: 100, backgroundColor: categoriaAtiva === 'DESTAQUES' ? configDesign.cores.fundoGeral : configDesign.cores.fundoCards, borderBottom: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? `1px solid ${configDesign.cores.borda}` : 'none', transition: configDesign.animacoes.transicaoSuave, paddingTop: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? '10px' : '20px', marginTop: categoriaAtiva === 'DESTAQUES' ? '15px' : '0' }}>
        <div style={{ padding: '0 20px 10px 20px' }}>
          <div style={{ backgroundColor: configDesign.cores.inputFundo, borderRadius: '12px', padding: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '8px 12px' : '12px', display: 'flex', gap: '10px' }}>
            <span>🔍</span><input placeholder="Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} />
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categoriasDinamicas.map(cat => (
            <button key={cat} onClick={() => { setCategoriaAtiva(cat); window.scrollTo({top:0, behavior:'smooth'}); }} style={{ paddingBottom: '10px', whiteSpace: 'nowrap', fontWeight: '900', background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', cursor: 'pointer', fontSize: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '11px' : '13px' }}>{cat}</button>
          ))}
        </div>
      </div>
      <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '10px' : '110px' }}></div>

      {/* PRODUTOS */}
      <div style={{ padding: '0 20px 20px 20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
          if (!(p.nome || '').toLowerCase().includes(buscaMenu.toLowerCase())) return false;
          if (categoriaAtiva === 'TODOS') return true;
          if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
          return p.categoria && p.categoria.toUpperCase() === categoriaAtiva.replace(/[\u1000-\uFFFF]+/g, '').trim().toUpperCase();
        }).map(p => {
          const itemNoCarrinho = carrinho.find(i => i.id === p.id);
          let corBorda = configDesign.cores.fundoCards;
          let selo = null;
          if (p.promocao) { corBorda = configDesign.cores.promocao; selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>PROMOÇÃO</div>; } 
          else if (p.novidade) { corBorda = configDesign.cores.novidade; selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>NOVIDADE</div>; } 
          else if (itemNoCarrinho) corBorda = configDesign.cores.primaria;

          return (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ border: `2px solid ${corBorda}`, borderRadius: configDesign.cards.raioBorda, padding: '10px', cursor: 'pointer', position: 'relative', backgroundColor: configDesign.cores.fundoCards, boxShadow: configDesign.cards.sombra, display: 'flex', flexDirection: 'column', gap: '8px', marginTop: selo ? '10px' : '0' }}>
               {selo}
               {itemNoCarrinho && !selo && <div style={{position: 'absolute', top: '-8px', right: '-8px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: '900', fontSize: '11px', border: `2px solid ${configDesign.cores.fundoCards}`, zIndex: 2}}>{itemNoCarrinho.quantidade}</div>}
               <div style={{ height: categoriaAtiva === 'DESTAQUES' ? configDesign.cards.alturaImgDestaque : configDesign.cards.alturaImgPequena, borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
               <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                 <strong style={{ fontSize: categoriaAtiva === 'DESTAQUES' ? '14px' : '11px', color: configDesign.cores.textoForte, lineHeight: '1.2', height: categoriaAtiva === 'DESTAQUES' ? 'auto' : '26px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.nome}</strong>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: '5px' }}>
                   <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: categoriaAtiva === 'DESTAQUES' ? '18px' : '13px' }}>{p.preco || 'R$ 0,00'}</span>
                   <span style={{ fontSize: '10px', color: configDesign.cores.textoSuave, fontWeight: 'bold', background: configDesign.cores.inputFundo, padding: '2px 6px', borderRadius: '4px' }}>{itemNoCarrinho ? formatarQtdUnidade(itemNoCarrinho.quantidade, p.unidade_medida) : (p.unidade_medida || 'UN')}</span>
                 </div>
               </div>
            </div>
          );
        })}
      </div>

      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', backgroundColor: configDesign.cores.textoForte, color: configDesign.cores.fundoGeral, border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500, cursor: 'pointer' }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, color: '#fff', fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: `2px solid ${configDesign.cores.textoForte}`, fontWeight: 'bold' }}>{carrinho.reduce((a,c)=>a+(Number(c?.quantidade)||0),0)}</span>
        </button>
      )}

      {/* MODAL CONFIG GERAIS */}
      {modalConfiguracoesAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 6500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', maxWidth: '320px', borderRadius: '25px', padding: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Configurações</h3>
              <button onClick={() => setModalConfiguracoesAberto(false)} style={{ background: configDesign.cores.inputFundo, border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>✕</button>
            </div>
            <button onClick={() => { setModalConfiguracoesAberto(false); setModalSenhaAberto(true); }} style={{ width: '100%', padding: '18px', background: configDesign.cores.fundoGeral, border: `1px solid ${configDesign.cores.borda}`, borderRadius: '15px', fontWeight: 'bold', color: configDesign.cores.textoForte, display: 'flex', alignItems: 'center', gap: '10px' }}>🔒 Alterar Minha Senha</button>
            {deferredPrompt && <button onClick={instalarApp} style={{ width: '100%', padding: '18px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold', marginTop: '10px' }}>📲 Instalar App</button>}
          </div>
        </div>
      )}

      {/* MODAL TROCA DE SENHA */}
      {modalSenhaAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 7000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', maxWidth: '350px', borderRadius: '25px', padding: '30px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: configDesign.cores.textoForte, marginBottom: '20px' }}>Alterar Senha</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Senha Antiga</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.antiga} onChange={e => setDadosSenha({...dadosSenha, antiga: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.nova} onChange={e => setDadosSenha({...dadosSenha, nova: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Repetir Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.confirma} onChange={e => setDadosSenha({...dadosSenha, confirma: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <input type="checkbox" id="showPass" checked={mostrarSenha} onChange={() => setMostrarSenha(!mostrarSenha)} style={{ width: '18px', height: '18px', accentColor: configDesign.cores.primaria }} />
              <label htmlFor="showPass" style={{ fontSize: '13px', color: configDesign.cores.textoForte }}>Mostrar senhas</label>
            </div>
            {erroSenha && <div style={{ color: configDesign.cores.alerta, fontSize: '12px', fontWeight: 'bold', textAlign: 'center', marginBottom: '15px', background: isEscuro ? '#450a0a' : '#fef2f2', padding: '10px', borderRadius: '8px' }}>{erroSenha}</div>}
            <button onClick={salvarNovaSenha} disabled={carregandoSenha} style={{ width: '100%', padding: '18px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>{carregandoSenha ? 'SALVANDO...' : 'CONFIRMAR ALTERAÇÃO'}</button>
            <button onClick={() => { setModalSenhaAberto(false); setErroSenha(''); setDadosSenha({antiga:'', nova:'', confirma:''}); setMostrarSenha(false); }} style={{ width: '100%', marginTop: '10px', padding: '15px', background: 'transparent', color: configDesign.cores.textoSuave, border: 'none', fontWeight: 'bold' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
           <button onClick={() => setProdutoExpandido(null)} style={{ alignSelf: 'flex-end', margin: '20px', color: '#fff', fontSize: '28px', background: 'none', border: 'none' }}>✕</button>
           <div style={{ flex: 1, backgroundImage: `url(${(produtoExpandido.foto_url || '').split(',')[0]})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', margin: '20px' }} />
           <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '30px 20px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, flex: 1}}>{produtoExpandido.nome}</h2>
                <span style={{ fontSize: '12px', background: configDesign.cores.inputFundo, padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>Vendido por {produtoExpandido.unidade_medida || 'UN'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingBottom: '15px', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
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
                     <button onClick={() => tratarInputQuantidade(Math.max(1, (parseInt(quantidade) || 0) - 1))} style={{ width: '55px', height: '55px', fontSize: '24px', borderRadius: '15px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>-</button>
                     <input type="number" value={quantidade} onChange={(e) => tratarInputQuantidade(e.target.value)} style={{ width: '80px', height: '55px', fontSize: '24px', fontWeight: '900', textAlign: 'center', borderRadius: '15px', border: `2px solid ${configDesign.cores.primaria}`, outline: 'none', color: configDesign.cores.textoForte, background: configDesign.cores.fundoCards }} />
                     <button onClick={() => tratarInputQuantidade((parseInt(quantidade) || 0) + 1)} style={{ width: '55px', height: '55px', fontSize: '24px', borderRadius: '15px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>+</button>
                  </div>
                  <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '22px', background: configDesign.cores.textoForte, color: configDesign.cores.fundoGeral, border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '15px' }}>
                    {carrinho.find(i => i.id === produtoExpandido.id) ? 'ATUALIZAR QUANTIDADE' : 'ADICIONAR AO CARRINHO'}
                  </button>
                </>
              ) : (
                <div style={{ marginTop: '25px' }}>
                  <button disabled style={{ width: '100%', padding: '22px', background: isEscuro ? '#334155' : '#e2e8f0', color: isEscuro ? '#94a3b8' : '#94a3b8', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '13px' }}>
                    🔒 {modoVisualizacao ? 'PEDIDO JÁ ENVIADO' : 'AGUARDANDO LIBERAÇÃO DE PREÇOS'}
                  </button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* MODAL CARRINHO */}
      {modalCarrinhoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: configDesign.cores.fundoCards, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontWeight: '900', color: configDesign.cores.textoForte }}>Meu Carrinho</h2>
            <button onClick={() => { setModalCarrinhoAberto(false); setItemEditandoId(null); }} style={{ border: 'none', background: configDesign.cores.inputFundo, borderRadius: '50%', width: '40px', height: '40px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>✕</button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {carrinho.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: configDesign.cores.textoSuave, fontWeight: 'bold' }}>
                Seu carrinho está vazio.
              </div>
            ) : (
              carrinho.map(item => {
                if (!item) return null;
                return (
                <div key={item.id || Math.random()} style={{ padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {itemEditandoId === item.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                       <button onClick={() => alterarQtdCart(item.id, -1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.inputFundo, fontSize: '18px', color: configDesign.cores.textoForte}}>-</button>
                       <input type="number" value={item.quantidade || 1} onChange={(e) => alterarQtdCartInput(item.id, e.target.value)} style={{ width: '45px', height: '35px', textAlign: 'center', fontWeight: '900', borderRadius: '8px', border: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte, background: configDesign.cores.fundoCards }} />
                       <button onClick={() => alterarQtdCart(item.id, 1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.inputFundo, fontSize: '18px', color: configDesign.cores.textoForte}}>+</button>
                       <button onClick={() => setItemEditandoId(null)} style={{marginLeft: 'auto', background: configDesign.cores.sucesso, color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold'}}>OK</button>
                    </div>
                  ) : (
                    <div onClick={() => setItemEditandoId(item.id)} style={{ cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria, fontSize: '15px'}}>{formatarQtdUnidade(item?.quantidade, item?.unidade_medida)}</b> de {item?.nome || 'Item'}</span>
                        <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item?.valorUnit)} / {item?.unidade_medida || 'UN'} • Toque para editar</div>
                      </div>
                      <div style={{ fontWeight: '900', color: configDesign.cores.textoForte, fontSize: '14px' }}>{formatarMoeda(item?.total)}</div>
                    </div>
                  )}
                  {itemEditandoId !== item.id && ( <button onClick={() => setCarrinho(carrinho.filter(i => i.id !== item.id))} style={{ color: configDesign.cores.alerta, border: 'none', background: 'none', fontWeight: 'bold', padding: '10px' }}>Remover</button> )}
                </div>
              )})
            )}
          </div>

          <div style={{ padding: '20px', borderTop: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral }}>
            <button onClick={zerarCarrinho} style={{ width: '100%', padding: '12px', background: isEscuro ? '#450a0a' : '#fef2f2', color: configDesign.cores.alerta, border: 'none', borderRadius: '12px', fontWeight: '900', marginBottom: '15px' }}>🗑️ ESVAZIAR CARRINHO</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: '900', fontSize: '18px', color: configDesign.cores.textoForte }}><span>Total Estimado:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
            <button onClick={() => { if(carrinho.length > 0) setModalRevisaoAberto(true); }} style={{ width: '100%', padding: '22px', background: carrinho.length > 0 ? configDesign.cores.textoForte : configDesign.cores.borda, color: configDesign.cores.fundoGeral, borderRadius: '18px', fontWeight: '900', fontSize: '15px', border: 'none' }}>REVISAR E ENVIAR</button>
          </div>
        </div>
      )}

      {/* MODAL REVISÃO */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: configDesign.cores.fundoCards, width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '30px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <h3 style={{marginTop: 0, textAlign: 'center', fontWeight: '900', color: configDesign.cores.textoForte}}>Confirmação do Pedido</h3>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', borderTop: `1px solid ${configDesign.cores.borda}`, borderBottom: `1px solid ${configDesign.cores.borda}`, padding: '10px 0' }}>
                {carrinho.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                        <div>
                          <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria}}>{formatarQtdUnidade(item?.quantidade, item?.unidade_medida)}</b> de {item?.nome || 'Item'}</span>
                          <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item?.valorUnit)} / {item?.unidade_medida || 'UN'}</div>
                        </div>
                        <span style={{fontWeight: 'bold', color: configDesign.cores.textoSuave}}>{formatarMoeda(item?.total)}</span>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontWeight: '900', fontSize: '20px', color: configDesign.cores.textoForte }}><span>TOTAL FINAL:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
            <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '16px' }}>{enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR ENVIO'}</button>
            <button onClick={() => setModalRevisaoAberto(false)} style={{ background: 'none', border: 'none', marginTop: '15px', color: configDesign.cores.textoSuave, fontWeight: 'bold' }}>Voltar e editar carrinho</button>
          </div>
        </div>
      )}
    </div>
  );
}