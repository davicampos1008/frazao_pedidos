import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario }) {

  // 🎛️ PAINEL DE CONTROLE V.I.R.T.U.S - DESIGN E CORES DO MENU
  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif"
    },
    cores: {
      // DICA: Para tema escuro, mude fundoGeral para #0f172a e fundoCards para #1e293b
      fundoGeral: '#f8fafc',
      fundoCards: '#ffffff', 
      primaria: '#f97316',      // Laranja Frazão
      textoForte: '#111111',    // Para tema escuro, use #f1f5f9
      textoSuave: '#64748b',
      promocao: '#eab308',
      novidade: '#a855f7',
      sucesso: '#22c55e',
      alerta: '#ef4444'
    },
    cards: {
      raioBorda: '16px',
      sombra: '0 4px 12px rgba(0,0,0,0.03)',
      alturaImgDestaque: '220px', 
      alturaImgPequena: '85px'    
    },
    animacoes: {
      transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }
  };

  // --- DEFINIÇÕES DE DADOS (Movido para cima para evitar erro de ReferenceError) ---
  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacaoStr = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Matriz').replace(/^\d+\s*-\s*/, '').trim();

  // --- ESTADOS ---
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
  
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);

  const ultimoScroll = useRef(0);
  const prevPrecosRef = useRef(false);
  const carrinhoRef = useRef(carrinho);
  const listaHojeRef = useRef(listaEnviadaHoje);
  const produtosAntigosRef = useRef([]);

  const categorias = ['DESTAQUES', 'TODOS', 'FRUTAS', 'VERDURAS', 'LEGUMES', 'HORTALISSAS', 'CAIXARIAS', 'EMBANDEJADOS', 'SACARIAS', 'VARIADOS'];

  // 💡 CONFIGURAÇÃO DE TEMA E PWA
  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    document.body.style.color = configDesign.cores.textoForte;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, [configDesign.cores.fundoGeral, configDesign.cores.textoForte]);

  // 💡 AVISO PARA TROCAR SENHA (SEMPRE AO ABRIR)
  useEffect(() => {
    const senhaPadrao = usuario?.codigo_loja?.toString() || '123456';
    if (usuario?.senha === senhaPadrao || usuario?.senha === '123456') {
      setTimeout(() => {
        alert(`Olá ${primeiroNome}! 🔒 Por segurança, altere sua senha padrão clicando na engrenagem no topo direito.`);
      }, 1500);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho));
    carrinhoRef.current = carrinho;
  }, [carrinho]);

  useEffect(() => {
    localStorage.setItem('historico_notif_virtus', JSON.stringify(historicoNotificacoes));
  }, [historicoNotificacoes]);

  // 💡 LÓGICA DE CLIQUE NA NOTIFICAÇÃO (VAI DIRETO AO PRODUTO)
  const lidarComCliqueNotificacao = (msg) => {
    const limpaMsg = msg.replace(/["']/g, ""); // Remove aspas para facilitar busca
    const prodEncontrado = produtos.find(p => limpaMsg.toUpperCase().includes(p.nome.toUpperCase()));
    if (prodEncontrado) {
      setModalNotificacoesAberto(false);
      abrirProduto(prodEncontrado);
    }
  };

  const dispararPushNotification = (titulo, mensagem) => {
    if ("Notification" in window && Notification.permission === "granted") {
      try { 
        const n = new Notification(titulo, { body: mensagem, icon: banners.logo });
        n.onclick = () => { window.focus(); lidarComCliqueNotificacao(mensagem); n.close(); };
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

  const solicitarPermissaoPush = async () => {
    if ("Notification" in window) {
      const permissao = await Notification.requestPermission();
      setPermissaoPush(permissao);
      if (permissao === "granted") mostrarNotificacao("Notificações externas ativadas!", "sucesso");
    }
  };

  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

      const { data: dbBanners } = await supabase.from('banners').select('*');
      if (dbBanners) {
        const bMap = {};
        dbBanners.forEach(b => bMap[b.posicao] = b.imagem_url);
        setBanners({
          topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || ''
        });
      }
      
      const { data: pData } = await supabase.from('produtos').select('*').neq('status_cotacao', 'falta').order('nome', { ascending: true });
      if (pData) {
        if (silencioso && produtosAntigosRef.current.length > 0) {
          pData.forEach(novo => {
            const antigo = produtosAntigosRef.current.find(a => a.id === novo.id);
            if (novo.promocao && !antigo?.promocao && configNotif.promocoes) mostrarNotificacao(`🔥 PROMOÇÃO: "${novo.nome}" por apenas ${novo.preco}!`, 'promocao');
            if (novo.novidade && !antigo?.novidade && configNotif.novidades) mostrarNotificacao(`✨ NOVIDADE: Chegou "${novo.nome}"!`, 'novidade');
          });
        }
        produtosAntigosRef.current = pData;
        setProdutos(pData);
      }

      const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(pedidoExistente?.length > 0 ? pedidoExistente : null);
      }
    } catch (e) { console.error(e); }
  }

  useEffect(() => { carregarDados(); }, [usuario]);
  useEffect(() => { const radar = setInterval(() => carregarDados(true), 15000); return () => clearInterval(radar); }, [usuario]);

  const abrirProduto = (p) => { setProdutoExpandido(p); setQuantidade(carrinho.find(i => i.id === p.id)?.quantidade || 1); };
  
  const salvarNoCarrinho = () => {
    const qtd = parseInt(quantidade) || 1;
    const vUnit = tratarPreco(produtoExpandido.preco);
    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    if (itemEx) setCarrinho(carrinho.map(i => i.id === produtoExpandido.id ? { ...i, quantidade: qtd, total: vUnit * qtd } : i));
    else setCarrinho([...carrinho, { ...produtoExpandido, quantidade: qtd, valorUnit: vUnit, total: vUnit * qtd }]);
    setProdutoExpandido(null);
  };

  const salvarNovaSenha = async () => {
    if(!dadosSenha.antiga || !dadosSenha.nova || !dadosSenha.confirma) return setErroSenha("Preencha tudo.");
    if(dadosSenha.nova !== dadosSenha.confirma) return setErroSenha("As senhas não batem.");
    setCarregandoSenha(true);
    try {
      const { data: u } = await supabase.from('usuarios').select('senha').eq('id', usuario.id).single();
      if(u.senha !== dadosSenha.antiga) throw new Error("Senha antiga incorreta.");
      const { error } = await supabase.from('usuarios').update({ senha: dadosSenha.nova }).eq('id', usuario.id);
      if(error) throw error;
      alert("✅ Senha alterada com sucesso!");
      setModalSenhaAberto(false);
    } catch (err) { setErroSenha(err.message); } finally { setCarregandoSenha(false); }
  };

  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !listaEnviadaHoje.some(i => i.liberado_edicao));

  // --- RENDERIZAÇÃO TELA SUCESSO ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', color: configDesign.cores.textoForte }}>
        <div style={{ background: configDesign.cores.primaria, color: '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <h2>✅ LISTA ENVIADA HOJE</h2>
          <p>Sua loja já realizou o pedido do dia.</p>
        </div>
        <button onClick={() => setModoVisualizacao(true)} style={{ marginTop: '30px', color: configDesign.cores.textoSuave, background: 'none', border: 'none', textDecoration: 'underline' }}>VER MENU</button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, color: configDesign.cores.textoForte }}>
      
      {/* HEADER DINÂMICO */}
      <div style={{ padding: '25px 20px', backgroundColor: configDesign.cores.fundoCards, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>{saudacaoStr}, {primeiroNome}!</h2>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.primaria }}>📍 {nomeLojaLimpo}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setModalSenhaAberto(true)} style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '12px', fontSize: '18px' }}>⚙️</button>
          <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '12px', position: 'relative' }}>
            🔔 {historicoNotificacoes.some(n => !n.lida) && "🔴"}
          </button>
        </div>
      </div>

      {/* ÁREA DE BUSCA */}
      <div style={{ padding: '20px' }}>
        <input placeholder="🔍 Procurar..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ width: '100%', padding: '15px', borderRadius: '15px', border: '1px solid #ddd', background: configDesign.cores.fundoCards, color: configDesign.cores.textoForte }} />
      </div>

      {/* GRID DE PRODUTOS */}
      <div style={{ padding: '0 20px 100px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => p.nome.toLowerCase().includes(buscaMenu.toLowerCase())).map(p => (
          <div key={p.id} onClick={() => abrirProduto(p)} style={{ background: configDesign.cores.fundoCards, padding: '12px', borderRadius: '16px', border: '1px solid #eee' }}>
            <div style={{ height: '90px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <strong style={{ display: 'block', marginTop: '10px', fontSize: '13px' }}>{p.nome}</strong>
            <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
          </div>
        ))}
      </div>

      {/* MODAL TROCAR SENHA */}
      {modalSenhaAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 7000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, padding: '30px', borderRadius: '25px', width: '100%', maxWidth: '350px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center' }}>🔒 Alterar Senha</h3>
            <input type={mostrarSenha ? "text" : "password"} placeholder="Senha Antiga" value={dadosSenha.antiga} onChange={e => setDadosSenha({...dadosSenha, antiga: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f8fafc' }} />
            <input type={mostrarSenha ? "text" : "password"} placeholder="Nova Senha" value={dadosSenha.nova} onChange={e => setDadosSenha({...dadosSenha, nova: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f8fafc' }} />
            <input type={mostrarSenha ? "text" : "password"} placeholder="Confirme Nova Senha" value={dadosSenha.confirma} onChange={e => setDadosSenha({...dadosSenha, confirma: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f8fafc' }} />
            <label style={{ fontSize: '12px', display: 'flex', gap: '5px', marginBottom: '15px' }}><input type="checkbox" checked={mostrarSenha} onChange={() => setMostrarSenha(!mostrarSenha)} /> Exibir senhas</label>
            {erroSenha && <p style={{ color: 'red', fontSize: '12px' }}>{erroSenha}</p>}
            <button onClick={salvarNovaSenha} style={{ width: '100%', padding: '15px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>SALVAR NOVA SENHA</button>
            <button onClick={() => setModalSenhaAberto(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#999' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MODAL NOTIFICAÇÕES */}
      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 5000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: '380px', height: '100%', background: configDesign.cores.fundoCards, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '25px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Notificações</h3>
              <button onClick={() => setModalNotificacoesAberto(false)} style={{ background: '#f1f5f9', border: 'none', width: '30px', height: '30px', borderRadius: '50%' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {historicoNotificacoes.map(n => (
                <div key={n.id} onClick={() => lidarComCliqueNotificacao(n.mensagem)} style={{ padding: '12px', borderRadius: '12px', background: n.lida ? 'none' : configDesign.cores.primaria + '15', marginBottom: '10px', border: '1px solid #eee', cursor: 'pointer' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{n.mensagem}</div>
                  <div style={{ fontSize: '10px', color: '#999' }}>{n.data}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO EXPANDIDO */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }} onClick={() => setProdutoExpandido(null)} />
          <div style={{ background: configDesign.cores.fundoCards, padding: '30px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
            <h2 style={{ margin: 0 }}>{produtoExpandido.nome}</h2>
            <p style={{ color: configDesign.cores.primaria, fontSize: '24px', fontWeight: '900', margin: '10px 0' }}>{produtoExpandido.preco}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '20px 0' }}>
              <button onClick={() => setQuantidade(Math.max(1, (parseInt(quantidade)||1)-1))} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', background: '#f1f5f9' }}>-</button>
              <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} style={{ width: '60px', textAlign: 'center', fontSize: '20px', border: 'none', background: 'none', color: configDesign.cores.textoForte }} />
              <button onClick={() => setQuantidade((parseInt(quantidade)||1)+1)} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', background: '#f1f5f9' }}>+</button>
            </div>
            <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '18px', background: configDesign.cores.textoForte, color: configDesign.cores.fundoCards, border: 'none', borderRadius: '15px', fontWeight: 'bold' }}>ADICIONAR AO CARRINHO</button>
          </div>
        </div>
      )}

      {/* BOTÃO CARRINHO FLUTUANTE */}
      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: '#111', color: '#fff', border: 'none', fontSize: '24px', boxShadow: '0 8px 25px rgba(0,0,0,0.3)' }}>🛒</button>
      )}

    </div>
  );
}