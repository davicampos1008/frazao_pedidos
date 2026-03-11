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
  
  // 💡 Identificador único da loja do cliente
  const codLoja = Number(usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]));

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
      return Array.isArray(parseado) ? parseado : [];
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
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState([]);
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });

  const carregarDados = useCallback(async () => {
    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) setPrecosLiberados(configData.precos_liberados);

      const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      if (pData) setProdutos(pData);

      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(pedidoExistente?.length > 0 ? pedidoExistente : null);
      }
    } catch (e) { console.error(e); }
  }, [codLoja, hoje]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const tratarInfosDeVenda = (produto) => {
    const precoKg = tratarPreco(produto.preco);
    const pesoCx = parseFloat(String(produto.peso_caixa || '').replace(/[^\d.]/g, ''));
    if (produto.unidade_medida === 'KG' && pesoCx > 0) {
      const precoCaixa = precoKg * pesoCx;
      return { isCaixa: true, precoBase: precoCaixa, textoPreco: `${formatarMoeda(precoCaixa)} / CX`, unidadeFinal: 'CX' };
    }
    return { isCaixa: false, precoBase: precoKg, textoPreco: `${produto.preco} / ${produto.unidade_medida}`, unidadeFinal: produto.unidade_medida };
  };

  const formatarQtdUnidade = (qtd, und) => `${qtd} ${und}${qtd > 1 && und !== 'KG' ? 'S' : ''}`;

  // 💡 LÓGICA DE REVISÃO: Filtra itens padrão APENAS da loja do cliente
  const abrirRevisao = () => {
    if(carrinho.length === 0) return;

    const itensPadraoDaMinhaLoja = produtos.filter(p => 
      Array.isArray(p.lista_padrao) && 
      p.lista_padrao.map(Number).includes(codLoja) && 
      p.status_cotacao !== 'falta'
    );

    const itensEsquecidos = itensPadraoDaMinhaLoja.filter(p => !carrinho.some(c => c.id === p.id));

    if (itensEsquecidos.length > 0) {
      const listaNomes = itensEsquecidos.map(i => `- ${i.nome}`).join('\n');
      const confirma = window.confirm(`⚠️ AVISO DE LISTA PADRÃO\n\nSua loja costuma pedir estes itens e eles não estão no carrinho:\n\n${listaNomes}\n\nDeseja revisar antes de enviar?`);
      if (confirma) {
        setCategoriaAtiva('⭐ LISTA PADRÃO');
        setModalCarrinhoAberto(false);
        return;
      }
    }
    setModalRevisaoAberto(true);
  };

  const salvarNoCarrinho = () => {
    const infos = tratarInfosDeVenda(produtoExpandido);
    const itemFormatado = {
        ...produtoExpandido, 
        quantidade: quantidade, 
        qtd_bonificada: temBonificacao ? qtdBonificada : 0, 
        valorUnit: infos.precoBase, 
        total: infos.precoBase * (quantidade - (temBonificacao ? qtdBonificada : 0)), 
        unidade_medida: infos.unidadeFinal
    };
    const existe = carrinho.find(i => i.id === produtoExpandido.id);
    setCarrinho(existe ? carrinho.map(i => i.id === produtoExpandido.id ? itemFormatado : i) : [...carrinho, itemFormatado]);
    setProdutoExpandido(null);
  };

  const confirmarEnvio = async () => {
    setEnviandoPedido(true);
    try {
      const dadosEnvio = carrinho.map(item => ({
        loja_id: codLoja, 
        nome_usuario: usuario?.nome, 
        nome_produto: item.nome, 
        quantidade: item.quantidade,
        qtd_bonificada: item.qtd_bonificada || 0,
        unidade_medida: item.unidade_medida, 
        data_pedido: hoje, 
        status_compra: 'pendente' 
      }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      await supabase.from('pedidos').insert(dadosEnvio);
      setListaEnviadaHoje(dadosEnvio);
      setCarrinho([]);
      setModalRevisaoAberto(false);
      setModalCarrinhoAberto(false);
    } catch (e) { alert(e.message); } finally { setEnviandoPedido(false); }
  };

  const carrinhoSeguro = Array.isArray(carrinho) ? carrinho : [];
  const valorTotalCarrinho = carrinhoSeguro.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  const isAppTravado = !precosLiberados || (listaEnviadaHoje && !listaEnviadaHoje.some(i => i.liberado_edicao));

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px' }}>
      
      {/* HEADER CLIENTE */}
      <div style={{ padding: '25px 20px 15px 20px', backgroundColor: configDesign.cores.fundoCards, borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, fontWeight: '900' }}>Olá, {primeiroNome}!</h2>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: configDesign.cores.primaria, fontWeight: '900' }}>📍 {nomeLojaLimpo}</p>
        </div>
        <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px' }}>⚙️</button>
      </div>

      {/* MENU CATEGORIAS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: configDesign.cores.fundoCards, padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categoriasDinamicas.map(cat => (
            <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ paddingBottom: '5px', whiteSpace: 'nowrap', fontWeight: '900', background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', cursor: 'pointer', fontSize: '13px' }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* LISTAGEM DE PRODUTOS FILTRADA */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
          const nomeP = p.nome.toLowerCase();
          const buscaP = buscaMenu.toLowerCase();
          
          // 💡 Lógica de filtro da Categoria Estrela (Lista da Loja)
          if (categoriaAtiva === '⭐ LISTA PADRÃO') {
            const ehDaMinhaLoja = Array.isArray(p.lista_padrao) && p.lista_padrao.map(Number).includes(codLoja);
            return ehDaMinhaLoja && nomeP.includes(buscaP);
          }
          
          if (categoriaAtiva === 'DESTAQUES') return (p.promocao || p.novidade) && nomeP.includes(buscaP);
          if (categoriaAtiva === 'TODOS') return nomeP.includes(buscaP);
          
          return p.categoria?.toUpperCase() === categoriaAtiva.replace(/[\u1000-\uFFFF]+/g, '').trim().toUpperCase() && nomeP.includes(buscaP);
        }).map(p => {
          const itemNoCarrinho = carrinhoSeguro.find(i => i.id === p.id);
          const infos = tratarInfosDeVenda(p);
          
          // 💡 Verifica se o item é padrão para ESTA loja para mostrar a estrela
          const ehPadraoParaMim = Array.isArray(p.lista_padrao) && p.lista_padrao.map(Number).includes(codLoja);

          return (
            <div key={p.id} onClick={() => abrirProduto(p)} style={{ borderRadius: configDesign.cards.raioBorda, padding: '12px', cursor: 'pointer', backgroundColor: configDesign.cores.fundoCards, boxShadow: configDesign.cards.sombra, display: 'flex', flexDirection: 'column', gap: '8px', border: itemNoCarrinho ? `2px solid ${configDesign.cores.primaria}` : `1px solid ${configDesign.cores.borda}` }}>
               <div style={{ height: '100px', borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
               <strong style={{ fontSize: '12px', color: configDesign.cores.textoForte, height: '30px', overflow: 'hidden' }}>
                 {p.nome} {ehPadraoParaMim && '⭐'}
               </strong>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                 <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: '14px' }}>{infos.textoPreco}</span>
                 {itemNoCarrinho && <span style={{ background: configDesign.cores.primaria, color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{itemNoCarrinho.quantidade}</span>}
               </div>
            </div>
          );
        })}
      </div>

      {/* BOTÃO FLUTUANTE CARRINHO */}
      {carrinhoSeguro.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '30px', right: '30px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: configDesign.cores.textoForte, color: '#fff', border: 'none', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500 }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, fontSize: '12px', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{carrinhoSeguro.length}</span>
        </button>
      )}

      {/* MODAL PRODUTO (RESUMIDO) */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ backgroundColor: configDesign.cores.fundoCards, width: '100%', padding: '30px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
            <button onClick={() => setProdutoExpandido(null)} style={{ float: 'right', background: 'none', border: 'none', fontSize: '20px', color: configDesign.cores.textoForte }}>✕</button>
            <h2 style={{ color: configDesign.cores.textoForte }}>{produtoExpandido.nome}</h2>
            <p style={{ color: configDesign.cores.primaria, fontSize: '22px', fontWeight: '900' }}>{tratarInfosDeVenda(produtoExpandido).textoPreco}</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', margin: '30px 0' }}>
               <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '24px' }}>-</button>
               <span style={{ fontSize: '24px', fontWeight: '900', color: configDesign.cores.textoForte }}>{quantidade}</span>
               <button onClick={() => setQuantidade(quantidade + 1)} style={{ width: '50px', height: '50px', borderRadius: '15px', border: 'none', fontSize: '24px' }}>+</button>
            </div>

            <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '20px', borderRadius: '15px', background: configDesign.cores.textoForte, color: '#fff', border: 'none', fontWeight: '900' }}>ADICIONAR AO PEDIDO</button>
          </div>
        </div>
      )}

      {/* (Os outros modais de Carrinho e Revisão seguem a mesma lógica de renderização) */}

    </div>
  );
}