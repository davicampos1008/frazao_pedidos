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
  
  const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);

  const categoriasDinamicas = [
    'DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', 
    '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', 
    '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA', '⭐ LISTA PADRÃO'
  ];

  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  
  const [carrinho, setCarrinho] = useState(() => {
    try {
      const salvo = localStorage.getItem('carrinho_virtus');
      if (!salvo) return [];
      const parseado = JSON.parse(salvo);
      if (!Array.isArray(parseado)) return [];
      return parseado.filter(item => item && typeof item === 'object' && item.id && item.nome);
    } catch (e) { 
      localStorage.removeItem('carrinho_virtus');
      return []; 
    }
  });

  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [qtdBonificada, setQtdBonificada] = useState(0); 
  const [temBonificacao, setTemBonificacao] = useState(false);

  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false); 
  const [itemEditandoId, setItemEditandoId] = useState(null);

  const [itemParaAlterarIndividual, setItemParaAlterarIndividual] = useState(null);
  const [novaQtdIndividual, setNovaQtdIndividual] = useState(0);

  const [navState, setNavState] = useState({ show: true, shrink: false });
  const ultimoScroll = useRef(0);
  
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [notificacoes, setNotificacoes] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    try {
      const salvo = localStorage.getItem('historico_notif_virtus');
      const parseado = salvo ? JSON.parse(salvo) : [];
      return Array.isArray(parseado) ? parseado : [];
    } catch (e) { return []; }
  });

  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);

  const produtosCarregadosRef = useRef(false);
  const dataUltimoCarregamento = useRef(0);
  const enviandoRef = useRef(false);

  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    document.documentElement.style.backgroundColor = configDesign.cores.fundoGeral;
    const handleInstall = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, [configDesign.cores.fundoGeral]);

  useEffect(() => {
    if (usuario?.senha === '123456' || usuario?.senha === codLoja?.toString()) {
      const timer = setTimeout(() => {
        alert("⚠️ Aviso de Segurança: Detectamos que você está usando uma senha padrão. Por favor, clique na engrenagem no topo da tela e altere sua senha para proteger sua conta.");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [usuario?.senha, codLoja]);

  const instalarApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  useEffect(() => { localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho)); }, [carrinho]);
  useEffect(() => { localStorage.setItem('historico_notif_virtus', JSON.stringify(historicoNotificacoes)); }, [historicoNotificacoes]);

  const removerAcentos = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 20));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 5000);
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
  const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const tratarInfosDeVenda = (produto) => {
    const precoKg = tratarPreco(produto.preco);
    const pesoCx = parseFloat(String(produto.peso_caixa || '').replace(/[^\d.]/g, ''));
    if (produto.unidade_medida === 'KG' && pesoCx > 0) {
      const precoCaixa = precoKg * pesoCx;
      return { isCaixa: true, precoBase: precoCaixa, textoPreco: `${formatarMoeda(precoCaixa)} / CX`, textoSecundario: `(Cx c/ ${pesoCx}kg - ${formatarMoeda(precoKg)} o Kg)`, unidadeFinal: 'CX' };
    }
    return { isCaixa: false, precoBase: precoKg, textoPreco: `${produto.preco} / ${produto.unidade_medida}`, textoSecundario: '', unidadeFinal: produto.unidade_medida };
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
    if (enviandoRef.current) return;
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
        const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
        if (pData) { setProdutos(pData); produtosCarregadosRef.current = true; }
      }

      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja).order('id', { ascending: true });
        setListaEnviadaHoje(pedidoExistente?.length > 0 ? pedidoExistente : null);
      }
    } catch (e) { console.error("Erro VIRTUS:", e); }
  }, [codLoja, hoje]); 

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const abrirProduto = (p) => {
    setProdutoExpandido(p);
    const itemExistente = carrinho.find(i => i.id === p.id);
    setQuantidade(itemExistente?.quantidade || 1);
    setQtdBonificada(itemExistente?.qtd_bonificada || 0);
    setTemBonificacao(!!itemExistente?.qtd_bonificada && itemExistente.qtd_bonificada > 0);
  };

  const salvarNoCarrinho = () => {
    const qtdFinal = parseInt(quantidade, 10) || 1;
    const bonifFinal = temBonificacao ? (parseInt(qtdBonificada, 10) || 0) : 0;
    const bonifSegura = Math.min(qtdFinal, bonifFinal);
    const qtdCobrada = Math.max(0, qtdFinal - bonifSegura);

    const infosVenda = tratarInfosDeVenda(produtoExpandido);
    const valorTotalItem = infosVenda.precoBase * qtdCobrada;
    
    const novoItem = {
        ...produtoExpandido, 
        quantidade: qtdFinal, 
        qtd_bonificada: bonifSegura, 
        valorUnit: infosVenda.precoBase, 
        total: valorTotalItem, 
        unidade_medida: infosVenda.unidadeFinal
    };

    const itemEx = carrinho.find(i => i.id === produtoExpandido.id);
    setCarrinho(itemEx ? carrinho.map(i => i.id === produtoExpandido.id ? novoItem : i) : [...carrinho, novoItem]);
    setProdutoExpandido(null);
  };

  const alterarQtdCart = (id, delta) => {
    setCarrinho(prev => prev.map(item => {
      if (item.id === id) {
        const novaQtd = Math.max(1, (Number(item.quantidade) || 0) + delta);
        const bonif = Number(item.qtd_bonificada) || 0;
        const cobrada = Math.max(0, novaQtd - bonif);
        return { ...item, quantidade: novaQtd, total: cobrada * (Number(item.valorUnit) || 0) };
      }
      return item;
    }));
  };

  const alterarQtdCartInput = (id, valor) => {
    const novaQtd = parseInt(valor, 10) || 1;
    setCarrinho(prev => prev.map(item => {
        if (item.id === id) {
            const bonif = Number(item.qtd_bonificada) || 0;
            const cobrada = Math.max(0, novaQtd - bonif);
            return { ...item, quantidade: novaQtd, total: cobrada * (Number(item.valorUnit) || 0) };
        }
        return item;
    }));
  };

  const zerarCarrinho = () => { if (window.confirm("⚠️ Esvaziar carrinho?")) { setCarrinho([]); setModalCarrinhoAberto(false); } };

  const abrirRevisao = () => {
    if(carrinho.length === 0) return;
    const codLojaNum = Number(codLoja);
    const itensPadraoLoja = produtos.filter(p => Array.isArray(p.lista_padrao) && p.lista_padrao.map(Number).includes(codLojaNum) && p.status_cotacao !== 'falta');
    const itensFaltando = itensPadraoLoja.filter(p => !carrinho.some(c => c.id === p.id));

    if (itensFaltando.length > 0) {
      const listaNomes = itensFaltando.map(i => `- ${i.nome}`).join('\n');
      if (!window.confirm(`⚠️ LISTA PADRÃO\n\nItens ausentes:\n\n${listaNomes}\n\nDeseja enviar assim mesmo?`)) {
        setCategoriaAtiva('⭐ LISTA PADRÃO');
        setModalCarrinhoAberto(false);
        return;
      }
    }
    setModalRevisaoAberto(true);
  };

  const confirmarEnvio = async () => {
    if (!codLoja) return alert("🚨 Erro: Loja não identificada.");
    setEnviandoPedido(true); enviandoRef.current = true; 
    try {
      const dadosParaEnviar = carrinho.map(item => ({
        loja_id: codLoja, 
        nome_usuario: usuario?.nome || "Operador", 
        nome_produto: item.nome, 
        quantidade: item.quantidade || 1,
        qtd_bonificada: item.qtd_bonificada || 0,
        unidade_medida: item.unidade_medida || 'UN', 
        data_pedido: hoje, 
        solicitou_refazer: false, 
        liberado_edicao: false, 
        status_compra: 'pendente' 
      }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const { error } = await supabase.from('pedidos').insert(dadosParaEnviar);
      if (error) throw error;
      setListaEnviadaHoje(dadosParaEnviar); setCarrinho([]); localStorage.removeItem('carrinho_virtus');
      setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false);
      window.scrollTo(0,0); mostrarNotificacao("🚀 LISTA ENVIADA!", 'sucesso');
    } catch (err) { alert("Erro: " + err.message); } finally { setEnviandoPedido(false); enviandoRef.current = false; }
  };

  const pedirParaEditar = async () => {
    if(!window.confirm("Solicitar ao administrador a abertura total da lista?")) return;
    try {
        await supabase.from('pedidos').update({ solicitou_refazer: true }).eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(prev => prev.map(item => ({...item, solicitou_refazer: true})));
        mostrarNotificacao("✅ Solicitação enviada!", 'sucesso');
    } catch (err) { alert(err.message); }
  };

  const enviarSolicitacaoIndividual = async (item) => {
    if (novaQtdIndividual === item.quantidade) return setItemParaAlterarIndividual(null);
    try {
        const { error } = await supabase.from('pedidos').update({ 
            solicitou_refazer: true, 
            solicitacao_edicao: true, 
            quantidade_solicitada: novaQtdIndividual 
        }).eq('id', item.id);
        if(!error) {
            mostrarNotificacao(`Pedido de alteração enviado: ${item.nome_produto}`, 'sucesso');
            setItemParaAlterarIndividual(null);
            carregarDados();
        }
    } catch (e) { alert(e.message); }
  };

  const importarParaCarrinho = async () => {
    if(!window.confirm("Voltar itens para o carrinho?")) return;
    try {
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const itensRestaurados = listaEnviadaHoje.map(dbItem => {
        const prod = produtos.find(p => p.nome === dbItem.nome_produto);
        if (prod) {
          const infos = tratarInfosDeVenda(prod);
          const bonif = Number(dbItem.qtd_bonificada) || 0;
          return { ...prod, quantidade: dbItem.quantidade, qtd_bonificada: bonif, valorUnit: infos.precoBase, total: infos.precoBase * (dbItem.quantidade - bonif), unidade_medida: infos.unidadeFinal };
        }
        return { id: Math.random(), nome: dbItem.nome_produto, quantidade: dbItem.quantidade, qtd_bonificada: dbItem.qtd_bonificada || 0, valorUnit: 0, total: 0, unidade_medida: dbItem.unidade_medida };
      });
      setCarrinho(itensRestaurados); setListaEnviadaHoje(null); setModoVisualizacao(false);
      mostrarNotificacao("🛒 Itens restaurados!", 'info');
    } catch (err) { alert(err.message); }
  };

  const salvarNovaSenha = async () => {
    if(!dadosSenha.antiga || !dadosSenha.nova || !dadosSenha.confirma) return setErroSenha("Preencha todos os campos.");
    if(dadosSenha.nova !== dadosSenha.confirma) return setErroSenha("A nova senha não confere.");
    setCarregandoSenha(true); setErroSenha('');
    try {
      const { data: u } = await supabase.from('usuarios').select('*').eq('nome', usuario.nome).single();
      if(u.senha !== dadosSenha.antiga) throw new Error("Senha antiga incorreta.");
      await supabase.from('usuarios').update({ senha: dadosSenha.nova }).eq('id', u.id);
      mostrarNotificacao("🔒 Senha alterada!", 'sucesso'); setModalSenhaAberto(false);
    } catch (err) { setErroSenha(err.message); } finally { setCarregandoSenha(false); }
  };

  if (listaEnviadaHoje && !modoVisualizacao) {
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);
    const solicitouGeral = listaEnviadaHoje.some(item => item.solicitou_refazer === true && !item.solicitacao_edicao);

    return (
      <div style={{ padding: '20px', fontFamily: configDesign.geral.fontePadrao, textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : (solicitouGeral ? configDesign.cores.promocao : configDesign.cores.textoForte), color: '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <div style={{fontSize: '50px'}}>{edicaoLiberada ? '🔓' : '✅'}</div>
          <h2 style={{ margin: 0 }}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : 'PEDIDO ENVIADO!'}</h2>
          <p style={{fontSize: '11px', opacity: 0.8, marginTop: '10px'}}>Toque no item para solicitar alteração de quantidade.</p>
        </div>
        <div style={{ textAlign: 'left', marginTop: '25px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '25px', border: `1px solid ${configDesign.cores.borda}` }}>
          {listaEnviadaHoje.map((item, i) => {
             const isEditing = itemParaAlterarIndividual?.id === item.id;
             const pendente = item.solicitacao_edicao && !item.liberado_edicao;
             return (
               <div key={i} style={{ padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
                 <div onClick={() => !pendente && !edicaoLiberada && (setItemParaAlterarIndividual(item), setNovaQtdIndividual(item.quantidade))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                   <div style={{flex: 1}}>
                     <span style={{color: configDesign.cores.textoForte, fontWeight: 'bold'}}>{item.quantidade}x {item.nome_produto}</span>
                     {pendente && <div style={{color: configDesign.cores.promocao, fontSize: '10px', fontWeight: 'bold', marginTop: '5px'}}>⏳ ANÁLISE: MUDAR PARA {item.quantidade_solicitada}</div>}
                   </div>
                   {!pendente && !edicaoLiberada && <span>✏️</span>}
                 </div>
                 {isEditing && (
                   <div style={{ marginTop: '15px', padding: '15px', background: configDesign.cores.inputFundo, borderRadius: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '15px' }}>
                        <button onClick={() => setNovaQtdIndividual(Math.max(1, novaQtdIndividual - 1))} style={{width: '40px', height: '40px', borderRadius: '10px', border: 'none'}}>-</button>
                        <span style={{fontSize: '22px', fontWeight: '900'}}>{novaQtdIndividual}</span>
                        <button onClick={() => setNovaQtdIndividual(novaQtdIndividual + 1)} style={{width: '40px', height: '40px', borderRadius: '10px', border: 'none'}}>+</button>
                      </div>
                      <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={() => setItemParaAlterarIndividual(null)} style={{flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: configDesign.cores.borda}}>CANCELAR</button>
                        <button onClick={() => enviarSolicitacaoIndividual(item)} style={{flex: 2, padding: '12px', borderRadius: '10px', background: configDesign.cores.primaria, color: '#fff', border: 'none', fontWeight: '900'}}>PEDIR ALTERAÇÃO</button>
                      </div>
                   </div>
                 )}
               </div>
             );
          })}
        </div>
        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={() => carregarDados()} style={{ background: configDesign.cores.inputFundo, border: `1px solid ${configDesign.cores.borda}`, padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS</button>
          {edicaoLiberada ? (
            <button onClick={importarParaCarrinho} style={{ background: configDesign.cores.sucesso, border: 'none', padding: '18px', borderRadius: '15px', color: '#fff', fontWeight: '900' }}>📥 ABRIR EDIÇÃO TOTAL</button>
          ) : (
            <button onClick={solicitouGeral ? null : pedirParaEditar} style={{ background: 'transparent', border: `2px solid ${solicitouGeral ? configDesign.cores.borda : configDesign.cores.textoForte}`, padding: '18px', borderRadius: '15px', color: solicitouGeral ? configDesign.cores.textoSuave : configDesign.cores.textoForte, fontWeight: 'bold' }}>
              {solicitouGeral ? '⏳ AGUARDANDO LIBERAÇÃO GERAL...' : '✏️ SOLICITAR ABERTURA DA LISTA'}
            </button>
          )}
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '10px', color: configDesign.cores.textoSuave, fontWeight: 'bold', textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
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
          <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px' }}>⚙️</button>
          <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px', position: 'relative' }}>
            <span>🔔</span>
            {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
          </button>
        </div>
      </div>

      {/* MENU CATEGORIAS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: configDesign.cores.fundoCards, padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
        <div style={{ padding: '0 20px 10px 20px' }}>
          <div style={{ backgroundColor: configDesign.cores.inputFundo, borderRadius: '12px', padding: '10px', display: 'flex', gap: '10px' }}>
            <span>🔍</span><input placeholder="Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} />
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categoriasDinamicas.map(cat => (
            <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ paddingBottom: '10px', whiteSpace: 'nowrap', fontWeight: '900', background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none' }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* PRODUTOS */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
          const nomeP = removerAcentos(p.nome.toLowerCase());
          const buscaP = removerAcentos(buscaMenu.toLowerCase());
          const codLojaNum = Number(codLoja);
          if (categoriaAtiva === '⭐ LISTA PADRÃO') return Array.isArray(p.lista_padrao) && p.lista_padrao.map(Number).includes(codLojaNum) && nomeP.includes(buscaP);
          if (categoriaAtiva === 'TODOS') return nomeP.includes(buscaP);
          if (categoriaAtiva === 'DESTAQUES') return (p.promocao || p.novidade) && nomeP.includes(buscaP);
          return p.categoria?.toUpperCase() === categoriaAtiva.replace(/[\u1000-\uFFFF]+/g, '').trim().toUpperCase() && nomeP.includes(buscaP);
        }).map(p => {
          const itemNoCarrinho = carrinho.find(i => i.id === p.id);
          const infos = tratarInfosDeVenda(p);
          const ehPadraoParaMim = Array.isArray(p.lista_padrao) && p.lista_padrao.map(Number).includes(Number(codLoja));
          return (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ borderRadius: '16px', padding: '12px', backgroundColor: configDesign.cores.fundoCards, boxShadow: configDesign.cards.sombra, border: itemNoCarrinho ? `2px solid ${configDesign.cores.primaria}` : `1px solid ${configDesign.cores.borda}` }}>
               <div style={{ height: '100px', borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
               <strong style={{ fontSize: '12px', display: 'block', marginTop: '10px', height: '30px', overflow: 'hidden' }}>{p.nome} {ehPadraoParaMim && '⭐'}</strong>
               <div style={{ color: configDesign.cores.primaria, fontWeight: '900', marginTop: '5px' }}>{infos.textoPreco}</div>
            </div>
          );
        })}
      </div>

      {/* MODAL PRODUTO COM BONIFICAÇÃO */}
      {produtoExpandido && (() => {
        const infos = tratarInfosDeVenda(produtoExpandido);
        const qtdFinal = parseInt(quantidade, 10) || 1;
        const bonifFinal = temBonificacao ? (parseInt(qtdBonificada, 10) || 0) : 0;
        const bonifSegura = Math.min(qtdFinal, bonifFinal);
        const qtdCobrada = Math.max(0, qtdFinal - bonifSegura);
        const totalCalc = infos.precoBase * qtdCobrada;

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ backgroundColor: configDesign.cores.fundoCards, width: '100%', padding: '30px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
              <button onClick={() => setProdutoExpandido(null)} style={{ float: 'right', border: 'none', background: 'none', fontSize: '24px', color: configDesign.cores.textoForte }}>✕</button>
              <h2 style={{margin: 0, color: configDesign.cores.textoForte}}>{produtoExpandido.nome}</h2>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px'}}>
                <span style={{color: configDesign.cores.primaria, fontSize: '20px', fontWeight: '900'}}>{infos.textoPreco}</span>
                <div style={{textAlign: 'right'}}>
                  <small style={{display: 'block', fontSize: '10px', color: configDesign.cores.textoSuave}}>TOTAL A PAGAR:</small>
                  <span style={{fontSize: '22px', fontWeight: '900', color: configDesign.cores.textoForte}}>{formatarMoeda(totalCalc)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '25px 0' }}>
                 <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '24px' }}>-</button>
                 <span style={{ fontSize: '28px', fontWeight: '900', color: configDesign.cores.textoForte }}>{quantidade}</span>
                 <button onClick={() => setQuantidade(quantidade + 1)} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '24px' }}>+</button>
              </div>

              {/* SISTEMA DE BONIFICAÇÃO */}
              <div style={{ backgroundColor: temBonificacao ? (isEscuro ? '#064e3b' : '#ecfdf5') : configDesign.cores.inputFundo, padding: '15px', borderRadius: '15px', border: temBonificacao ? `1px solid ${configDesign.cores.sucesso}` : 'none' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '900', fontSize: '13px', color: temBonificacao ? configDesign.cores.sucesso : configDesign.cores.textoForte, cursor: 'pointer' }}>
                  <input type="checkbox" checked={temBonificacao} onChange={e => { setTemBonificacao(e.target.checked); if(!e.target.checked) setQtdBonificada(0); }} style={{width: '18px', height: '18px'}} />
                  🎁 INCLUIR BONIFICAÇÃO
                </label>
                {temBonificacao && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <small style={{fontWeight: 'bold'}}>Qtd Bonificada:</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button onClick={() => setQtdBonificada(Math.max(0, qtdBonificada - 1))} style={{ width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.sucesso, color: '#fff' }}>-</button>
                      <span style={{fontWeight: '900', width: '30px', textAlign: 'center'}}>{qtdBonificada}</span>
                      <button onClick={() => setQtdBonificada(qtdBonificada + 1)} style={{ width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.sucesso, color: '#fff' }}>+</button>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '20px', background: configDesign.cores.textoForte, color: configDesign.cores.fundoGeral, border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '15px', marginTop: '20px' }}>ADICIONAR AO PEDIDO</button>
            </div>
          </div>
        );
      })()}

      {/* CARRINHO FLUTUANTE */}
      {carrinho.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '12px', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>{carrinho.length}</span>
        </button>
      )}

      {/* MODAIS SECUNDÁRIOS */}
      {modalCarrinhoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: configDesign.cores.fundoCards, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontWeight: '900', color: configDesign.cores.textoForte }}>Meu Carrinho</h2>
            <button onClick={() => setModalCarrinhoAberto(false)} style={{ border: 'none', background: 'none', fontSize: '24px', color: configDesign.cores.textoForte }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
             {carrinho.map(item => (
               <div key={item.id} style={{ padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{fontWeight: 'bold', color: configDesign.cores.textoForte}}>{item.quantidade}x {item.nome}</div>
                    <div style={{fontSize: '11px', color: configDesign.cores.textoSuave}}>{formatarMoeda(item.valorUnit)} / {item.unidade_medida}</div>
                    {item.qtd_bonificada > 0 && <div style={{fontSize: '11px', color: configDesign.cores.sucesso, fontWeight: 'bold'}}>🎁 {item.qtd_bonificada} bonificado(s)</div>}
                  </div>
                  <div style={{fontWeight: '900', color: configDesign.cores.primaria}}>{formatarMoeda(item.total)}</div>
               </div>
             ))}
          </div>
          <div style={{ padding: '20px', borderTop: `1px solid ${configDesign.cores.borda}` }}>
             <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '900', marginBottom: '15px'}}>
               <span>TOTAL ESTIMADO:</span><span>{formatarMoeda(valorTotalCarrinho)}</span>
             </div>
             <button onClick={abrirRevisao} style={{ width: '100%', padding: '20px', background: configDesign.cores.textoForte, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>REVISAR E ENVIAR</button>
          </div>
        </div>
      )}

      {/* REVISÃO */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: configDesign.cores.fundoGeral, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
           <div style={{ padding: '20px', textAlign: 'center', fontWeight: '900' }}>Confirmar Pedido</div>
           <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {carrinho.map(item => (
                <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px dashed #ccc' }}>
                   <strong>{item.quantidade}x {item.nome}</strong>
                   <span style={{float: 'right'}}>{formatarMoeda(item.total)}</span>
                </div>
              ))}
           </div>
           <div style={{ padding: '20px' }}>
              <button onClick={confirmarEnvio} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>{enviandoPedido ? 'ENVIANDO...' : 'FECHAR PEDIDO AGORA'}</button>
           </div>
        </div>
      )}
    </div>
  );
}