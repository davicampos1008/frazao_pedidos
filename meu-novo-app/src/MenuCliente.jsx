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

  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif" },
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
    animacoes: { transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }
  };

  // --- ESTADOS ---
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA')); 
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
      return salvo ? JSON.parse(salvo).filter(item => item?.id && item?.nome) : [];
    } catch (e) { return []; }
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
  const [navState, setNavState] = useState({ show: true, shrink: false });
  const ultimoScroll = useRef(0);
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [notificacoes, setNotificacoes] = useState([]);
  const [permissaoPush, setPermissaoPush] = useState('default');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    try {
      const salvo = localStorage.getItem('historico_notif_virtus');
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });

  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);

  // --- NOVOS ESTADOS V.I.R.T.U.S ---
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);

  const produtosCarregadosRef = useRef(false);
  const dataUltimoCarregamento = useRef(0);
  const enviandoRef = useRef(false);

  // --- LÓGICA DE MONITORAMENTO DE HORÁRIO E DATA ---
  const sincronizarSistema = useCallback(async () => {
    try {
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
        setTempoRestante(config.nao_funciona ? "LOJA FECHADA" : "NÃO HÁ ENVIOS HOJE");
      } else {
        const [h, m] = limiteStr.split(':').map(Number);
        const dataLimite = new Date();
        dataLimite.setHours(h, m, 0);

        const diffMs = dataLimite - agora;
        const diffMin = Math.floor(diffMs / 60000);

        if (dataEfetiva === new Date().toLocaleDateString('en-CA') && diffMs <= 0) {
          setBloqueioAtivo(true);
          setTempoRestante("PRAZO ENCERRADO");
        } else {
          setBloqueioAtivo(false);
          if (diffMs > 0 && diffMs < 18000000) { // Menos de 5h para o fim
            setTempoRestante(`${Math.floor(diffMin/60)}h ${diffMin%60}min`);
            if (diffMin <= 30 && !notificou30min) {
              mostrarNotificacao(`⚠️ Faltam 30 minutos! Envie sua lista até as ${limiteStr}.`, 'alerta', 'PRAZO ENCERRANDO');
              setNotificou30min(true);
            }
          } else { setTempoRestante(null); }
        }
      }

      // Alerta de Feriado (Sempre que abrir no dia marcado como feriado)
      if (config.is_feriado && agora.getHours() < 13) {
         mostrarNotificacao(`🚩 Horário de Feriado: Pedidos até as ${LIMITES_HORARIO.feriado}.`, 'info');
      }
    } catch (e) { console.error(e); }
  }, [notificou30min]);

  useEffect(() => {
    sincronizarSistema();
    const radar = setInterval(sincronizarSistema, 30000);
    return () => clearInterval(radar);
  }, [sincronizarSistema]);

  // --- FUNÇÃO WHATSAPP ---
  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let texto = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n`;
    texto += `----------------------------\n`;
    listaEnviadaHoje.forEach(item => {
      texto += `• *${item.quantidade}x* ${item.nome_produto} (${item.unidade_medida})`;
      if (item.qtd_bonificada > 0) texto += ` _+ ${item.qtd_bonificada} Bonif._`;
      texto += `\n`;
    });
    texto += `----------------------------\n_Enviado via V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
  };

  // --- RESTO DAS FUNÇÕES ORIGINAIS (Instalação, Scroll, Preços, Dados) ---
  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    const handleInstall = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, [configDesign.cores.fundoGeral]);

  const carregarDados = useCallback(async (silencioso = false) => {
    if (enviandoRef.current) return;
    try {
      const { data: bData } = await supabase.from('banners').select('*');
      if (bData) {
        const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
        setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
      }
      const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      if (pData) setProdutos(pData);
      if (codLoja) {
        const { data: ped } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(ped?.length > 0 ? ped : null);
      }
    } catch (e) { console.error(e); }
  }, [codLoja, hoje]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatarQtdUnidade = (qtd, und) => `${qtd} ${und || 'UN'}`;
  
  const tratarInfosDeVenda = (p) => {
    const preco = parseFloat(String(p.preco || '0').replace('R$ ', '').replace(',', '.'));
    const peso = parseFloat(p.peso_caixa) || 0;
    if (p.unidade_medida === 'KG' && peso > 0) {
      return { isCaixa: true, precoBase: preco * peso, textoPreco: `${formatarMoeda(preco * peso)} / CX`, textoSecundario: `(${peso}kg - ${p.preco}/kg)`, unidadeFinal: 'CX' };
    }
    return { isCaixa: false, precoBase: preco, textoPreco: `${p.preco} / ${p.unidade_medida}`, textoSecundario: '', unidadeFinal: p.unidade_medida };
  };

  const abrirProduto = (p) => {
    setProdutoExpandido(p);
    const ex = carrinho.find(i => i.id === p.id);
    setQuantidade(ex?.quantidade || 1);
    setQtdBonificada(ex?.qtd_bonificada || 0);
    setTemBonificacao(!!ex?.qtd_bonificada);
  };

  const salvarNoCarrinho = () => {
    const infos = tratarInfosDeVenda(produtoExpandido);
    const novoItem = { 
      ...produtoExpandido, 
      quantidade: parseInt(quantidade), 
      qtd_bonificada: temBonificacao ? parseInt(qtdBonificada) : 0, 
      valorUnit: infos.precoBase, 
      total: infos.precoBase * (parseInt(quantidade) - (temBonificacao ? parseInt(qtdBonificada) : 0)),
      unidade_medida: infos.unidadeFinal
    };
    setCarrinho(prev => [...prev.filter(i => i.id !== produtoExpandido.id), novoItem]);
    setProdutoExpandido(null);
  };

  const confirmarEnvio = async () => {
    setEnviandoPedido(true);
    try {
      const dados = carrinho.map(i => ({
        loja_id: codLoja, nome_usuario: usuario?.nome, nome_produto: i.nome,
        quantidade: i.quantidade, qtd_bonificada: i.qtd_bonificada, unidade_medida: i.unidade_medida,
        data_pedido: hoje, status_compra: 'pendente'
      }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      await supabase.from('pedidos').insert(dados);
      setListaEnviadaHoje(dados);
      setCarrinho([]);
      setModalRevisaoAberto(false);
      mostrarNotificacao("🚀 LISTA ENVIADA COM SUCESSO!", 'sucesso');
    } catch (e) { alert(e.message); }
    finally { setEnviandoPedido(false); }
  };

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => setNotificacoes(prev => prev.filter(n => n.id !== id)), 5000);
  };

  // --- RENDERIZAÇÃO: PEDIDO ENVIADO (MODIFICADO COM WHATSAPP) ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);
    return (
      <div style={{ padding: '20px', fontFamily: configDesign.geral.fontePadrao, textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : configDesign.cores.textoForte, color: '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '20px' }}>
          <div style={{fontSize: '50px'}}>{edicaoLiberada ? '🔓' : '✅'}</div>
          <h2 style={{ margin: 0 }}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : 'PEDIDO ENVIADO!'}</h2>
        </div>
        <div style={{ textAlign: 'left', marginTop: '25px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
          {listaEnviadaHoje.map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', color: configDesign.cores.textoForte }}>
              <span><b>{item.quantidade}x</b> {item.nome_produto}</span>
              <small>{item.unidade_medida}</small>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={copiarParaWhatsapp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '18px', borderRadius: '15px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            💬 COPIAR PARA WHATSAPP
          </button>
          <button onClick={() => carregarDados()} style={{ background: configDesign.cores.inputFundo, border: `1px solid ${configDesign.cores.borda}`, padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, fontWeight: '900', textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
        </div>
      </div>
    );
  }

  // --- RENDERIZAÇÃO: CATÁLOGO (COM ALERTA DE HORÁRIO) ---
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px' }}>
      
      {/* ALERTA DE TEMPO V.I.R.T.U.S */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          ⏳ TEMPO RESTANTE PARA ENVIO: {tempoRestante}
        </div>
      )}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          🚩 ATENÇÃO: Horário de Feriado (Limite até as 13:00)
        </div>
      )}

      {/* HEADER ORIGINAL */}
      <div style={{ padding: '25px 20px', backgroundColor: configDesign.cores.fundoCards, borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: configDesign.cores.textoForte, fontWeight: '900' }}>{saudacaoStr}, {primeiroNome}!</h2>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: configDesign.cores.primaria, fontWeight: '900' }}>📍 {nomeLojaLimpo}</p>
        </div>
        <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px' }}>⚙️</button>
      </div>

      {/* BANNERS E PRODUTOS (IGUAL AO ORIGINAL) */}
      {categoriaAtiva === 'DESTAQUES' && (
        <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover' }} />
      )}

      {/* MENU CATEGORIAS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: configDesign.cores.fundoGeral, padding: '15px 0' }}>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categoriasDinamicas.map(cat => (
            <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {produtos.filter(p => categoriaAtiva === 'TODOS' || p.promocao || p.categoria?.toUpperCase() === categoriaAtiva.replace(/[^a-zA-Z]/g, '').toUpperCase()).map(p => {
          const itemNoCart = carrinho.find(i => i.id === p.id);
          const infos = tratarInfosDeVenda(p);
          return (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '16px', padding: '12px', boxShadow: configDesign.cards.sombra, position: 'relative', border: itemNoCart ? `2px solid ${configDesign.cores.primaria}` : 'none' }}>
              <div style={{ height: '100px', borderRadius: '12px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <h4 style={{ color: configDesign.cores.textoForte, fontSize: '12px', margin: '10px 0 5px 0', height: '30px', overflow: 'hidden' }}>{p.nome}</h4>
              <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: '15px' }}>{infos.textoPreco}</span>
            </div>
          );
        })}
      </div>

      {/* BOTÃO CARRINHO */}
      {carrinho.length > 0 && !bloqueioAtivo && (
        <button onClick={abrirRevisao} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '12px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #000' }}>{carrinho.length}</span>
        </button>
      )}

      {/* BLOQUEIO DE ENVIO (NO MODAL DE REVISÃO) */}
      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: configDesign.cores.fundoGeral, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
           <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, textAlign: 'center' }}>
             <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Confirmação do Pedido</h3>
           </div>
           <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
             {carrinho.map(item => (
               <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                 <span style={{color: configDesign.cores.textoForte}}><b>{item.quantidade}x</b> {item.nome}</span>
                 <span style={{color: configDesign.cores.textoSuave}}>{formatarMoeda(item.total)}</span>
               </div>
             ))}
           </div>
           <div style={{ padding: '20px', background: configDesign.cores.fundoCards }}>
             {bloqueioAtivo ? (
               <div style={{ background: '#fee2e2', color: '#ef4444', padding: '15px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold' }}>🕒 Horário limite excedido.</div>
             ) : (
               <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900' }}>
                 {enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR E ENVIAR'}
               </button>
             )}
             <button onClick={() => setModalRevisaoAberto(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: configDesign.cores.textoSuave }}>Voltar ao carrinho</button>
           </div>
        </div>
      )}
    </div>
  );
}