import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

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

  const hoje = new Date().toLocaleDateString('en-CA'); 
  const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);

  // ESTADOS
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => {
    const salvo = localStorage.getItem('carrinho_virtus');
    return salvo ? JSON.parse(salvo) : [];
  });

  const [notificacoes, setNotificacoes] = useState([]);
  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    const salvo = localStorage.getItem('historico_notif_virtus');
    return salvo ? JSON.parse(salvo) : [];
  });

  // Outros modais
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });

  // 1. 🔔 LÓGICA DE NOTIFICAÇÃO EM TEMPO REAL
  useEffect(() => {
    const canal = supabase
      .channel('alteracoes-virtus')
      // Acompanha liberação da loja
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracoes' }, (payload) => {
        if (payload.new.precos_liberados) {
          enviarNotifInterna("🚀 BOAS NOTÍCIAS! Os preços de hoje acabaram de ser liberados!", "sucesso");
          setPrecosLiberados(true);
        }
      })
      // Acompanha mudança de preços individual
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produtos' }, (payload) => {
        if (payload.new.preco !== payload.old.preco) {
          enviarNotifInterna(`💰 Preço Atualizado: ${payload.new.nome} agora está ${payload.new.preco}`, "info");
          // Atualiza o produto na lista local sem recarregar tudo
          setProdutos(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  const enviarNotifInterna = (mensagem, tipo) => {
    const nova = { id: Date.now(), mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false };
    setNotificacoes(prev => [...prev, nova]);
    setHistoricoNotificacoes(prev => [nova, ...prev].slice(0, 30));
    setTimeout(() => setNotificacoes(prev => prev.filter(n => n.id !== nova.id)), 6000);
  };

  const abrirNotificacoes = () => {
    setModalNotificacoesAberto(true);
    setHistoricoNotificacoes(prev => prev.map(n => ({...n, lida: true})));
  };

  // 2. 📦 TRATAMENTO DE EMBALAGEM (SACO OU CAIXA)
  const tratarInfosDeVenda = (produto) => {
    const precoBase = parseFloat(String(produto.preco || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
    const temPesoExtra = produto.peso_caixa && String(produto.peso_caixa).trim() !== '';
    const numeroPeso = temPesoExtra ? parseFloat(String(produto.peso_caixa).replace(/[^\d.]/g, '')) : 0;
    
    // Define o nome da embalagem baseado no que você escolheu na precificação
    const nomeEmbalagem = produto.tipo_embalagem === 'SACO' ? 'Saco' : 'Caixa';

    if (temPesoExtra && numeroPeso > 0) {
      const precoFechado = precoBase * numeroPeso;
      return { 
        isEmbalagem: true, 
        precoBase: precoFechado, 
        textoPreco: `${precoFechado.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})} / ${nomeEmbalagem}`, 
        textoSecundario: `(${nomeEmbalagem} c/ ${produto.peso_caixa} - Valor base: ${produto.preco})`,
        unidadeFinal: nomeEmbalagem
      };
    }
    
    return { 
      isEmbalagem: false, 
      precoBase: precoBase, 
      textoPreco: `${produto.preco} / ${produto.unidade_medida}`, 
      textoSecundario: '',
      unidadeFinal: produto.unidade_medida
    };
  };

  // Funções de carregamento (simplificadas para o exemplo)
  const carregarDados = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (config) setPrecosLiberados(config.precos_liberados);

    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (pData) setProdutos(pData);

    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
       const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
       setBanners({ topo: bMap.topo, logo: bMap.logo, tematico: bMap.tematico });
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Auxiliares de visualização
  const formatarMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const removerAcentos = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, paddingBottom: '100px' }}>
      
      {/* 🔔 TOASTS DE NOTIFICAÇÃO (FLUTUANTES) */}
      <div style={{ position: 'fixed', top: '20px', left: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notificacoes.map(n => (
          <div key={n.id} style={{ background: n.tipo === 'sucesso' ? configDesign.cores.sucesso : configDesign.cores.textoForte, color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontWeight: 'bold', fontSize: '14px', animation: 'slideIn 0.3s ease-out' }}>
            {n.mensagem}
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div style={{ padding: '20px', backgroundColor: configDesign.cores.fundoCards, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: configDesign.cores.textoForte }}>Olá, {usuario?.nome?.split(' ')[0]}</h2>
          <span style={{ fontSize: '12px', color: configDesign.cores.primaria, fontWeight: 'bold' }}>📍 {usuario?.loja}</span>
        </div>
        <button onClick={abrirNotificacoes} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '45px', height: '45px', borderRadius: '12px', position: 'relative' }}>
          <span style={{ fontSize: '20px' }}>🔔</span>
          {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
        </button>
      </div>

      {/* PRODUTOS */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => removerAcentos(p.nome.toLowerCase()).includes(removerAcentos(buscaMenu.toLowerCase()))).map(p => {
          const infos = tratarInfosDeVenda(p);
          return (
            <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '12px', border: `1px solid ${configDesign.cores.borda}`, position: 'relative' }}>
              <div style={{ height: '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: '10px' }} />
              <strong style={{ fontSize: '12px', display: 'block', height: '30px', overflow: 'hidden', color: configDesign.cores.textoForte }}>{p.nome}</strong>
              
              {/* EXIBIÇÃO DA EMBALAGEM (CAIXA OU SACO) NO CARD */}
              <div style={{ marginTop: '5px' }}>
                <span style={{ fontSize: '14px', fontWeight: '900', color: configDesign.cores.primaria }}>{infos.textoPreco}</span>
                {infos.isEmbalagem && (
                   <div style={{ fontSize: '9px', color: configDesign.cores.textoSuave, fontWeight: 'bold' }}>{infos.textoSecundario}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL HISTÓRICO DE NOTIFICAÇÕES */}
      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', maxWidth: '400px', borderRadius: '20px', padding: '20px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Notificações</h3>
              <button onClick={() => setModalNotificacoesAberto(false)} style={{ border: 'none', background: 'none', fontSize: '20px', color: configDesign.cores.textoForte }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {historicoNotificacoes.length === 0 ? (
                <p style={{ textAlign: 'center', color: configDesign.cores.textoSuave }}>Nenhuma notificação por enquanto.</p>
              ) : (
                historicoNotificacoes.map(h => (
                  <div key={h.id} style={{ padding: '12px', borderBottom: `1px solid ${configDesign.cores.borda}`, fontSize: '13px' }}>
                    <div style={{ color: configDesign.cores.textoForte, fontWeight: 'bold' }}>{h.mensagem}</div>
                    <div style={{ color: configDesign.cores.textoSuave, fontSize: '10px', marginTop: '5px' }}>{h.data}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHE DO PRODUTO (Expansão) */}
      {produtoExpandido && (
        <div style={{ position: 'fixed', inset: 0, background: configDesign.cores.fundoCards, zIndex: 5000, display: 'flex', flexDirection: 'column' }}>
           <div style={{ padding: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setProdutoExpandido(null)} style={{ fontSize: '30px', border: 'none', background: 'none' }}>✕</button>
           </div>
           <div style={{ flex: 1, padding: '20px', textAlign: 'center' }}>
              <img src={produtoExpandido.foto_url?.split(',')[0]} style={{ width: '100%', maxWidth: '300px', borderRadius: '20px' }} alt="" />
              <h2 style={{ color: configDesign.cores.textoForte }}>{produtoExpandido.nome}</h2>
              
              {/* INFO DA EMBALAGEM NO DETALHE */}
              <div style={{ background: configDesign.cores.inputFundo, padding: '20px', borderRadius: '15px', marginTop: '20px' }}>
                <span style={{ fontSize: '24px', fontWeight: '900', color: configDesign.cores.primaria }}>
                  {tratarInfosDeVenda(produtoExpandido).textoPreco}
                </span>
                <p style={{ color: configDesign.cores.textoSuave, margin: '10px 0 0 0' }}>
                  {tratarInfosDeVenda(produtoExpandido).textoSecundario || `Vendido por ${produtoExpandido.unidade_medida}`}
                </p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}