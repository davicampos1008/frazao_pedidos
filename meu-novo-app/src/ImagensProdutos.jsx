import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// 💡 FUNÇÃO INTELIGENTE DE BUSCA GLOBAL (Blindada contra erros de tipagem)
const normalizarParaBusca = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();
};

// ============================================================================
// COMPONENTE: SCROLL HORIZONTAL COM O MOUSE
// ============================================================================
const MenuHorizontal = ({ children, style }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={scrollRef} style={{ overflowX: 'auto', scrollbarWidth: 'none', ...style }}>
      {children}
    </div>
  );
};

export default function ImagensProdutos({ isEscuro }) {
  const [produtos, setProdutos] = useState([]);
  
  // 💡 ESTADOS DE FILTRO
  const [filtroFoto, setFiltroFoto] = useState('SEM_FOTO'); // Inicia mostrando os sem foto
  const [categoriaAtiva, setCategoriaAtiva] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [uploading, setUploading] = useState({}); 
  const [mensagemFlutuante, setMensagemFlutuante] = useState('');

  const themeBg = isEscuro ? '#0f172a' : '#f5f5f4';
  const themeCard = isEscuro ? '#1e293b' : '#ffffff';
  const themeText = isEscuro ? '#f8fafc' : '#111111';
  const themeBorder = isEscuro ? '#334155' : '#e2e8f0';
  const themeMenuTop = isEscuro ? '#020617' : '#111111';

  const mostrarNotificacao = (msg) => {
    setMensagemFlutuante(msg);
    setTimeout(() => setMensagemFlutuante(''), 3000);
  };

  const carregarProdutos = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      if (error) throw error;
      setProdutos(data || []);
      mostrarNotificacao('🔄 Lista atualizada com sucesso!');
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      mostrarNotificacao('❌ Erro ao buscar produtos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarProdutos();
  }, []);

  // 💡 LÓGICA MÁGICA DO CTRL+V
  useEffect(() => {
    const handlePaste = async (e) => {
      if (!produtoSelecionado) return; 

      const items = e.clipboardData?.items;
      if (!items) return;

      let imageFile = null;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          imageFile = items[i].getAsFile();
          break;
        }
      }

      if (imageFile) {
        e.preventDefault();
        await uploadImagem(imageFile, produtoSelecionado);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [produtoSelecionado, produtos]);

  const uploadImagem = async (file, produtoId) => {
    setUploading(prev => ({ ...prev, [produtoId]: true }));
    
    try {
      const produtoAlvo = produtos.find(p => p.id === produtoId);
      if (!produtoAlvo) return;

      const fileName = `prod_${produtoId}_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('frazao-midia')
        .upload(`produtos/${fileName}`, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('frazao-midia')
        .getPublicUrl(`produtos/${fileName}`);

      const novaUrl = data.publicUrl;
      const fotosAtuais = produtoAlvo.foto_url ? String(produtoAlvo.foto_url).split(',') : [];
      const novaStringFotos = [...fotosAtuais, novaUrl].filter(f => f).join(',');

      const { error: updateError } = await supabase
        .from('produtos')
        .update({ foto_url: novaStringFotos })
        .eq('id', produtoId);

      if (updateError) throw updateError;

      // Atualiza a tela SEM RECARREGAR (ele vai sumir da aba "Sem Fotos" automaticamente)
      setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, foto_url: novaStringFotos } : p));
      setProdutoSelecionado(null); // Desmarca o produto após colar
      mostrarNotificacao('✅ Imagem colada e salva com sucesso!');

    } catch (error) {
      alert('Erro ao salvar imagem: ' + error.message);
    } finally {
      setUploading(prev => ({ ...prev, [produtoId]: false }));
    }
  };

  const deletarFotoRecente = async (e, produtoId) => {
    e.stopPropagation();
    if (!window.confirm("Deseja remover as fotos deste produto?")) return;
    
    setUploading(prev => ({ ...prev, [produtoId]: true }));
    try {
      const { error } = await supabase.from('produtos').update({ foto_url: null }).eq('id', produtoId);
      if (error) throw error;
      
      setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, foto_url: null } : p));
      mostrarNotificacao('🗑️ Foto removida!');
    } catch (err) {
      alert("Erro ao remover: " + err.message);
    } finally {
      setUploading(prev => ({ ...prev, [produtoId]: false }));
    }
  };

  // 💡 ESTATÍSTICAS
  const totalProdutos = produtos.length;
  const totalSemFoto = produtos.filter(p => !p.foto_url || String(p.foto_url).trim() === '').length;
  const totalComFoto = totalProdutos - totalSemFoto;

  // 💡 GERAÇÃO DE CATEGORIAS DINÂMICAS BASEADAS NO BANCO
  const categoriasPossiveis = ['TODOS', ...new Set(produtos.map(p => p.categoria || 'Outros'))].sort();

  // 💡 FILTRAGEM FINAL
  const produtosFiltrados = produtos.filter(p => {
    const hasPhoto = p.foto_url && String(p.foto_url).trim() !== '';
    
    const passaFiltroFoto = filtroFoto === 'TODOS' ? true : (filtroFoto === 'COM_FOTO' ? hasPhoto : !hasPhoto);
    const passaCategoria = categoriaAtiva === 'TODOS' || (p.categoria || 'Outros') === categoriaAtiva;
    const passaBusca = normalizarParaBusca(p.nome).includes(normalizarParaBusca(busca));
    
    return passaFiltroFoto && passaCategoria && passaBusca;
  });

  return (
    <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif' }}>
      
      {/* 🎛️ HEADER DE COMANDO */}
      <div style={{ backgroundColor: themeMenuTop, padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>📸 GALERIA RÁPIDA</h2>
          
          <div style={{ display: 'flex', gap: '15px', marginTop: '10px', flexWrap: 'wrap' }}>
             <span style={{ fontSize: '12px', background: '#334155', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>📦 Total: {totalProdutos}</span>
             <span style={{ fontSize: '12px', background: '#ef4444', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>🚫 Sem Foto: {totalSemFoto}</span>
             <span style={{ fontSize: '12px', background: '#22c55e', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>📷 Com Foto: {totalComFoto}</span>
          </div>

          <p style={{ margin: '15px 0 0 0', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>
            Selecione o produto abaixo e pressione <b>Ctrl + V</b> para colar a imagem.
          </p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px' }}>
          <button onClick={carregarProdutos} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(59,130,246,0.3)' }}>
            🔄 BUSCAR NOVOS PRODUTOS
          </button>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: isEscuro ? '#1e293b' : '#fff', borderRadius: '12px', padding: '10px 15px' }}>
            <span>🔍</span>
            <input 
               placeholder="Buscar item..." 
               value={busca} 
               onChange={e => setBusca(e.target.value)} 
               style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px', color: isEscuro ? '#fff' : '#111', fontWeight: 'bold' }} 
            />
          </div>
        </div>
      </div>

      {/* 💡 ABA DE FILTRO POR FOTO (SUPERIOR) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <button onClick={() => setFiltroFoto('SEM_FOTO')} style={{ flex: '1 1 auto', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: filtroFoto === 'SEM_FOTO' ? '#ef4444' : themeCard, color: filtroFoto === 'SEM_FOTO' ? '#fff' : themeText, transition: '0.2s', boxShadow: filtroFoto === 'SEM_FOTO' ? '0 4px 10px rgba(239,68,68,0.3)' : '0 2px 5px rgba(0,0,0,0.02)' }}>
          🚫 SEM FOTO ({totalSemFoto})
        </button>
        <button onClick={() => setFiltroFoto('COM_FOTO')} style={{ flex: '1 1 auto', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: filtroFoto === 'COM_FOTO' ? '#22c55e' : themeCard, color: filtroFoto === 'COM_FOTO' ? '#fff' : themeText, transition: '0.2s', boxShadow: filtroFoto === 'COM_FOTO' ? '0 4px 10px rgba(34,197,94,0.3)' : '0 2px 5px rgba(0,0,0,0.02)' }}>
          📷 COM FOTO ({totalComFoto})
        </button>
        <button onClick={() => setFiltroFoto('TODOS')} style={{ flex: '1 1 auto', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: filtroFoto === 'TODOS' ? '#3b82f6' : themeCard, color: filtroFoto === 'TODOS' ? '#fff' : themeText, transition: '0.2s', boxShadow: filtroFoto === 'TODOS' ? '0 4px 10px rgba(59,130,246,0.3)' : '0 2px 5px rgba(0,0,0,0.02)' }}>
          📦 TODOS
        </button>
      </div>

      {/* 💡 BARRA ROLÁVEL DE CATEGORIAS */}
      <MenuHorizontal style={{ display: 'flex', gap: '10px', paddingBottom: '15px', marginBottom: '10px' }}>
         {categoriasPossiveis.map(cat => (
            <button 
               key={cat} 
               onClick={() => setCategoriaAtiva(cat)} 
               style={{ 
                  padding: '10px 20px', 
                  borderRadius: '20px', 
                  border: 'none', 
                  backgroundColor: categoriaAtiva === cat ? '#111' : (isEscuro ? '#1e293b' : '#e2e8f0'), 
                  color: categoriaAtiva === cat ? '#fff' : (isEscuro ? '#94a3b8' : '#475569'), 
                  fontWeight: 'bold', 
                  fontSize: '11px', 
                  cursor: 'pointer', 
                  whiteSpace: 'nowrap',
                  transition: '0.2s'
               }}
            >
               {cat}
            </button>
         ))}
      </MenuHorizontal>

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: themeText, fontWeight: 'bold' }}>🔄 Carregando banco de dados...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' }}>
          {produtosFiltrados.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94a3b8', padding: '40px', backgroundColor: themeCard, borderRadius: '16px' }}>Nenhum produto atende a este filtro.</div>
          ) : (
            produtosFiltrados.map(produto => {
              const isSelecionado = produtoSelecionado === produto.id;
              const isUploading = uploading[produto.id];
              // 💡 Extração segura da primeira URL
              const fotoCapa = (produto.foto_url && String(produto.foto_url).trim() !== '') ? String(produto.foto_url).split(',')[0] : null;

              return (
                <div 
                  key={produto.id} 
                  onClick={() => setProdutoSelecionado(produto.id)}
                  style={{ 
                    backgroundColor: themeCard, 
                    borderRadius: '16px', 
                    padding: '12px', 
                    cursor: 'pointer',
                    border: isSelecionado ? '3px solid #f97316' : `1px solid ${themeBorder}`,
                    boxShadow: isSelecionado ? '0 0 20px rgba(249,115,22,0.4)' : '0 4px 10px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    position: 'relative',
                    transform: isSelecionado ? 'scale(1.03)' : 'scale(1)'
                  }}
                >
                  {isSelecionado && (
                    <div style={{ position: 'absolute', top: '-12px', background: '#f97316', color: '#fff', fontSize: '10px', padding: '4px 10px', borderRadius: '10px', fontWeight: '900', zIndex: 10, animation: 'pulse 1.5s infinite' }}>
                      ⚡ PRONTO PARA COLAR (CTRL+V)
                    </div>
                  )}

                  {fotoCapa && (
                    <button 
                      onClick={(e) => deletarFotoRecente(e, produto.id)} 
                      style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', color: '#fff', border: 'none', width: '25px', height: '25px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                      title="Apagar Imagem"
                    >
                      ✕
                    </button>
                  )}

                  <div style={{ 
                    width: '100%', 
                    aspectRatio: '1', 
                    backgroundColor: isEscuro ? '#0f172a' : '#f1f5f9', 
                    borderRadius: '12px', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    overflow: 'hidden',
                    border: `2px dashed ${isSelecionado ? '#f97316' : themeBorder}`
                  }}>
                    {isUploading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '30px' }}>⏳</span>
                         <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#3b82f6', marginTop: '5px' }}>Salvando...</span>
                      </div>
                    ) : fotoCapa ? (
                      <img src={fotoCapa} alt={produto.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}>
                        <span style={{ fontSize: '30px' }}>📷</span>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '5px' }}>Sem Imagem</span>
                      </div>
                    )}
                  </div>

                  <strong style={{ fontSize: '13px', color: themeText, textAlign: 'center', lineHeight: '1.2', textTransform: 'uppercase' }}>
                    {produto.nome}
                  </strong>
                  <span style={{ fontSize: '10px', background: isEscuro ? '#1e293b' : '#e2e8f0', color: isEscuro ? '#94a3b8' : '#475569', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                    {produto.categoria || 'Sem Categoria'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {mensagemFlutuante && (
        <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#22c55e', color: '#fff', padding: '15px 30px', borderRadius: '50px', fontWeight: '900', fontSize: '14px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', zIndex: 20000 }}>
          {mensagemFlutuante}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}