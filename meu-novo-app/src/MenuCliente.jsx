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
  const [carrinho, setCarrinho] = useState(() => JSON.parse(localStorage.getItem('carrinho_virtus') || '[]'));
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [enviandoPedido, setEnviandoPedido] = useState(false);

  const carregarDados = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (config) setPrecosLiberados(config.precos_liberados);

    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
      const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
      setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
    }

    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    if (codLoja) {
      const { data: ped } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
      setListaEnviadaHoje(ped?.length > 0 ? ped : null);
    }
  }, [codLoja, hoje]);

  useEffect(() => { carregarDados(); }, [carregarDados]);
  useEffect(() => { localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho)); }, [carrinho]);

  const confirmarEnvio = async () => {
    setEnviandoPedido(true);
    try {
      const payload = carrinho.map(i => ({
        loja_id: codLoja, nome_usuario: usuario?.nome, nome_produto: i.nome,
        quantidade: i.quantidade, unidade_medida: i.unidade_medida, data_pedido: hoje, status_compra: 'pendente'
      }));
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      await supabase.from('pedidos').insert(payload);
      setListaEnviadaHoje(payload);
      setCarrinho([]);
      setModalRevisaoAberto(false);
      setModalCarrinhoAberto(false);
    } catch (e) { alert(e.message); } finally { setEnviandoPedido(false); }
  };

  if (!precosLiberados && !listaEnviadaHoje) {
    return <div style={{ padding: '100px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh', color: configDesign.cores.textoForte }}><h2>Aguardando Cotação...</h2></div>;
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif' }}>
      
      {listaEnviadaHoje && !modoVisualizacao ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '25px' }}><h2>✅ PEDIDO ENVIADO!</h2></div>
          <button onClick={() => setModoVisualizacao(true)} style={{ color: configDesign.cores.textoSuave, textDecoration: 'underline', border: 'none', background: 'none', marginTop: '20px' }}>VOLTAR AO INÍCIO</button>
        </div>
      ) : (
        <>
          {categoriaAtiva === 'DESTAQUES' && (
            <div>
              <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '0 20px', marginTop: '-40px' }}><div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundColor: '#fff' }} /></div>
            </div>
          )}
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: configDesign.cores.fundoGeral, padding: '15px 0' }}>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
              {categoriasDinamicas.map(cat => (
                <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {produtos.filter(p => categoriaAtiva === 'TODOS' || p.promocao).map(p => (
              <div key={p.id} onClick={() => setProdutoExpandido(p)} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '10px', boxShadow: configDesign.cards.sombra }}>
                <div style={{ height: '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <h4 style={{ color: configDesign.cores.textoForte, fontSize: '12px', margin: '10px 0' }}>{p.nome}</h4>
                <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}