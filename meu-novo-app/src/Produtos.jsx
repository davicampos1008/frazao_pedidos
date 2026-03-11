import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Produtos() {
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif", raioBordaGlobal: '20px', sombraSuave: '0 8px 30px rgba(0,0,0,0.04)', corTextoPrincipal: '#111111', corTextoSecundario: '#64748b' },
    cards: { fundo: '#ffffff', fundoIcone: '#f0fdf4', corIcone: '#22c55e', raioIcone: '14px', tamanhoIcone: '55px' },
    modal: { fundoEscuro: 'rgba(0,0,0,0.85)', fundoModal: '#ffffff', raioBorda: '32px', paddingInterno: '40px', corTitulo: '#f97316' },
    inputs: { fundoLivre: '#fcfcfc', fundoBloqueado: '#f1f5f9', borda: '1.5px solid #e2e8f0', raio: '12px', padding: '14px', corTitulos: '#f97316', tamanhoTitulos: '10px' },
    botoes: { salvar: '#f97316', editar: '#111111', textoCor: '#ffffff', altura: '54px', raio: '16px' }
  };

  const [produtos, setProdutos] = useState([]);
  const [listaLojas, setListaLojas] = useState([]); // 💡 Nova lista de lojas
  const [busca, setBusca] = useState('');
  const [verBloqueados, setVerBloqueados] = useState(false);
  const [modalAberto, setModalAberto] = useState(null);
  const [editando, setEditando] = useState(false);
  
  // 💡 lojas_padrao agora é um ARRAY []
  const estadoInicial = { nome: '', categoria: 'Frutas', unidade_medida: 'KG', status: true, peso_caixa: '', lista_padrao: [] };
  const [dados, setDados] = useState(estadoInicial);

  async function carregarDados() {
    // Carrega Produtos
    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    // Carrega Lojas
    const { data: lData } = await supabase.from('lojas').select('*').order('codigo_loja', { ascending: true });
    setListaLojas(lData || []);
  }

  useEffect(() => { carregarDados(); }, []);

  // 💡 Lógica para marcar/desmarcar loja no produto
  const toggleLojaNaLista = (codigoLoja) => {
    if (!editando) return;
    
    let novaLista = [...(dados.lista_padrao || [])];
    if (novaLista.includes(codigoLoja)) {
      novaLista = novaLista.filter(id => id !== codigoLoja);
    } else {
      novaLista.push(codigoLoja);
    }
    setDados({ ...dados, lista_padrao: novaLista });
  };

  async function alternarStatusRapido(e, produto) {
    e.stopPropagation();
    const novoStatus = !produto.status;
    const { error } = await supabase.from('produtos').update({ status: novoStatus }).eq('id', produto.id);
    if (!error) carregarDados();
  }

  async function salvar() {
    if (!dados.nome.trim()) return alert("V.I.R.T.U.S: Nome obrigatório!");
    const { error } = await supabase.from('produtos').upsert([dados]);
    if (!error) { 
      setModalAberto(null); 
      carregarDados(); 
    } else {
      alert("Erro ao salvar: " + error.message);
    }
  }

  const filtrados = produtos.filter(p => {
    const correspondeBusca = p.nome?.toLowerCase().includes(busca.toLowerCase()) || p.categoria?.toLowerCase().includes(busca.toLowerCase());
    return verBloqueados ? correspondeBusca : (correspondeBusca && p.status);
  });

  const cssInput = (bloqueado) => ({ width: '100%', padding: configDesign.inputs.padding, borderRadius: configDesign.inputs.raio, border: configDesign.inputs.borda, backgroundColor: bloqueado ? configDesign.inputs.fundoBloqueado : configDesign.inputs.fundoLivre, outline: 'none', boxSizing: 'border-box' });

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
        <input placeholder="Procurar hortifruti..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '18px', borderRadius: configDesign.geral.raioBordaGlobal, border: 'none', boxShadow: configDesign.geral.sombraSuave, outline: 'none' }} />
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: configDesign.geral.corTextoSecundario }}>
          <input type="checkbox" checked={verBloqueados} onChange={e => setVerBloqueados(e.target.checked)} />
          Ver Bloqueados
        </label>

        <button 
          onClick={() => { setDados(estadoInicial); setModalAberto({novo: true}); setEditando(true); }}
          style={{ backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, border: 'none', padding: '15px 25px', borderRadius: configDesign.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}
        >
          + NOVO ITEM
        </button>
      </div>

      {/* GRID DE PRODUTOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filtrados.map(p => {
          const estaEmAlgumaLista = p.lista_padrao?.length > 0;
          return (
            <div key={p.id} onClick={() => { setModalAberto(p); setDados({ ...p, lista_padrao: p.lista_padrao || [] }); setEditando(false); }} style={{ backgroundColor: configDesign.cards.fundo, padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, boxShadow: configDesign.geral.sombraSuave, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', position: 'relative', opacity: p.status ? 1 : 0.6 }}>
              
              {/* Estrela indicando que pertence a alguma lista padrão */}
              {estaEmAlgumaLista && (
                <div style={{ position: 'absolute', top: '10px', right: '45px', fontSize: '14px' }}>
                  ⭐ <small style={{ fontSize: '10px', fontWeight: 'bold', color: '#f97316' }}>{p.lista_padrao.length}</small>
                </div>
              )}

              <div style={{ width: configDesign.cards.tamanhoIcone, height: configDesign.cards.tamanhoIcone, backgroundColor: configDesign.cards.fundoIcone, borderRadius: configDesign.cards.raioIcone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: configDesign.cards.corIcone }}>
                {p.nome?.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '13px' }}>{p.nome}</strong>
                <small style={{ color: configDesign.geral.corTextoSecundario, fontSize: '11px' }}>{p.categoria}</small>
              </div>

              <div onClick={(e) => alternarStatusRapido(e, p)} style={{ cursor: 'pointer', fontSize: '22px' }}>
                {p.status ? '🟢' : '🔴'}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE EDIÇÃO */}
      {modalAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: configDesign.modal.fundoEscuro, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: configDesign.modal.fundoModal, width: '90%', maxWidth: '480px', padding: '35px', borderRadius: configDesign.modal.raioBorda, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={() => setModalAberto(null)} style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>

            <h2 style={{ color: configDesign.modal.corTitulo, fontWeight: '900', fontSize: '20px', marginBottom: '20px' }}>DETALHES DO ITEM</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: '900', color: '#f97316' }}>NOME DO PRODUTO</label>
                <input disabled={!editando} value={dados.nome} onChange={e => setDados({...dados, nome: e.target.value.toUpperCase()})} style={cssInput(!editando)} />
              </div>

              {/* SEÇÃO LISTA PADRÃO POR LOJA */}
              <div style={{ padding: '15px', backgroundColor: '#fff7ed', borderRadius: '15px', border: '1px solid #ffedd5' }}>
                <label style={{ fontSize: '10px', fontWeight: '900', color: '#f97316', display: 'block', marginBottom: '10px' }}>
                  ADICIONAR À LISTA PADRÃO DAS LOJAS:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {listaLojas.map(loja => (
                    <div 
                      key={loja.codigo_loja} 
                      onClick={() => toggleLojaNaLista(loja.codigo_loja)}
                      style={{ 
                        padding: '10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', cursor: editando ? 'pointer' : 'default',
                        backgroundColor: dados.lista_padrao?.includes(loja.codigo_loja) ? '#f97316' : '#fff',
                        color: dados.lista_padrao?.includes(loja.codigo_loja) ? '#fff' : '#64748b',
                        border: '1px solid #e2e8f0', textAlign: 'center', transition: '0.2s'
                      }}
                    >
                      {loja['Nome Fantasia'] || loja.nome_fantasia}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: '900', color: '#f97316' }}>CATEGORIA</label>
                  <select disabled={!editando} value={dados.categoria} onChange={e => setDados({...dados, categoria: e.target.value})} style={cssInput(!editando)}>
                    <option value="Frutas">Frutas</option>
                    <option value="Verduras & Fungos">Verduras</option>
                    <option value="Legumes">Legumes</option>
                    <option value="Raízes, Tubérculos & Grãos">Raízes</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: '900', color: '#f97316' }}>MEDIDA</label>
                  <select disabled={!editando} value={dados.unidade_medida} onChange={e => setDados({...dados, unidade_medida: e.target.value})} style={cssInput(!editando)}>
                    <option value="KG">KG</option>
                    <option value="UN">UN</option>
                    <option value="MAÇO">MAÇO</option>
                    <option value="CX">CX</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editando ? (
                <button onClick={salvar} style={{ height: '50px', backgroundColor: '#f97316', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer' }}>SALVAR</button>
              ) : (
                <button onClick={() => setEditando(true)} style={{ height: '50px', backgroundColor: '#111', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer' }}>EDITAR FICHA</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}