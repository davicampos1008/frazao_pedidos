import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Produtos() {
  // 🎛️ PAINEL DE CONTROLE V.I.R.T.U.S - GESTÃO DE PRODUTOS (HORTIFRUTI)
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif", raioBordaGlobal: '20px', sombraSuave: '0 8px 30px rgba(0,0,0,0.04)', corTextoPrincipal: '#111111', corTextoSecundario: '#64748b' },
    cards: { fundo: '#ffffff', fundoIcone: '#f0fdf4', corIcone: '#22c55e', raioIcone: '14px', tamanhoIcone: '55px' },
    modal: { fundoEscuro: 'rgba(0,0,0,0.85)', fundoModal: '#ffffff', raioBorda: '32px', paddingInterno: '40px', corTitulo: '#f97316' },
    inputs: { fundoLivre: '#fcfcfc', fundoBloqueado: '#f1f5f9', borda: '1.5px solid #e2e8f0', raio: '12px', padding: '14px', corTitulos: '#f97316', tamanhoTitulos: '10px' },
    botoes: { salvar: '#f97316', editar: '#111111', textoCor: '#ffffff', altura: '54px', raio: '16px' }
  };

  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(null);
  const [editando, setEditando] = useState(false);
  
  // 💡 ESTADO INICIAL AJUSTADO PARA O HORTIFRUTI (Limpo)
  const estadoInicial = { nome: '', categoria: 'FRUTAS', unidade_medida: 'KG', status: true };
  const [dados, setDados] = useState(estadoInicial);

  async function carregarProdutos() {
    const { data, error } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (!error) setProdutos(data || []);
  }

  useEffect(() => { carregarProdutos(); }, []);

  // --- ⚡ NAVEGAÇÃO RÁPIDA (V.I.R.T.U.S ENTER FLOW COM AUTO-SALVAMENTO) ---
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      const campos = Array.from(document.querySelectorAll('.modal-virtus input:not([disabled]):not([readonly]), .modal-virtus select:not([disabled]), .modal-virtus button:not([disabled])'));
      const indexAtual = campos.indexOf(e.target);
      
      // Se não for o último, pula para o próximo
      if (indexAtual > -1 && indexAtual < campos.length - 1) {
        campos[indexAtual + 1].focus();
      } 
      // 💡 V.I.R.T.U.S MÁGICA: Se for o último (o botão), clica nele!
      else if (indexAtual === campos.length - 1) {
        campos[indexAtual].click();
      }
    }
  };

  // --- 🛡️ SALVAMENTO BLINDADO ---
  async function salvar() {
    if (!dados.nome) {
      return alert("⚠️ V.I.R.T.U.S INFORMA: O Nome do Produto é obrigatório!");
    }

    const { error } = await supabase.from('produtos').upsert([dados]);
    if (!error) { 
      alert("✅ Produto salvo com sucesso!"); 
      setModalAberto(null); 
      carregarProdutos(); 
    } else { 
      alert("Erro no Banco de Dados: " + error.message); 
    }
  }

  async function alternarStatus() {
    const novoStatus = !dados.status;
    const msg = novoStatus ? "REATIVAR este produto no sistema?" : "BLOQUEAR este produto (não aparecerá em lugar nenhum)?";
    if (window.confirm(msg)) {
      const { error } = await supabase.from('produtos').update({ status: novoStatus }).eq('id', dados.id);
      if (!error) { setDados({ ...dados, status: novoStatus }); carregarProdutos(); }
    }
  }

  const filtrados = produtos.filter(p => 
    p.nome?.toLowerCase().includes(busca.toLowerCase()) || 
    p.categoria?.toLowerCase().includes(busca.toLowerCase())
  );

  // --- ATALHOS CSS ---
  const cssLabel = { fontSize: configDesign.inputs.tamanhoTitulos, fontWeight: '900', color: configDesign.inputs.corTitulos, display: 'block', marginBottom: '6px' };
  const cssInput = (bloqueado) => ({ width: '100%', padding: configDesign.inputs.padding, borderRadius: configDesign.inputs.raio, border: configDesign.inputs.borda, backgroundColor: bloqueado ? configDesign.inputs.fundoBloqueado : configDesign.inputs.fundoLivre, outline: 'none', boxSizing: 'border-box' });
  const cssGrupo = { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: '#fdfdfd', borderRadius: '20px', border: '1px solid #f1f5f9' };

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      {/* HEADER DE BUSCA INTELIGENTE */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <input placeholder="Procurar hortifruti por nome ou categoria..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '18px', borderRadius: configDesign.geral.raioBordaGlobal, border: 'none', boxShadow: configDesign.geral.sombraSuave, outline: 'none' }} />
        <button 
          onClick={() => { setDados(estadoInicial); setModalAberto({novo: true}); setEditando(true); }}
          style={{ backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, border: 'none', padding: '0 30px', borderRadius: configDesign.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}
        >
          + NOVO PRODUTO
        </button>
      </div>

      {/* LISTAGEM DE PRODUTOS (CARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filtrados.map(p => (
          <div key={p.id} onClick={() => { setModalAberto(p); setDados(p); setEditando(false); }} style={{ backgroundColor: configDesign.cards.fundo, padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, boxShadow: configDesign.geral.sombraSuave, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', transition: '0.2s', opacity: p.status ? 1 : 0.5 }}>
            <div style={{ width: configDesign.cards.tamanhoIcone, height: configDesign.cards.tamanhoIcone, backgroundColor: configDesign.cards.fundoIcone, borderRadius: configDesign.cards.raioIcone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: configDesign.cards.corIcone, fontSize: '20px', position: 'relative' }}>
              {p.nome?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '13px', color: configDesign.geral.corTextoPrincipal }}>{p.nome}</strong>
              <small style={{ color: configDesign.geral.corTextoSecundario, fontSize: '11px', display: 'block', marginTop: '2px' }}>{p.categoria} | Vendido em {p.unidade_medida}</small>
            </div>
            <span style={{fontSize: '18px'}}>{p.status ? '🟢' : '🔴'}</span>
          </div>
        ))}
      </div>

      {/* MODAL DE CADASTRO/EDIÇÃO */}
      {modalAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: configDesign.modal.fundoEscuro, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="modal-virtus" style={{ backgroundColor: configDesign.modal.fundoModal, width: '90%', maxWidth: '500px', padding: configDesign.modal.paddingInterno, borderRadius: configDesign.modal.raioBorda, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={() => setModalAberto(null)} style={{ position: 'absolute', top: '25px', right: '25px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>

            <h2 style={{ color: configDesign.modal.corTitulo, fontWeight: '900', marginBottom: '5px' }}>
              {modalAberto.novo ? 'NOVO PRODUTO' : 'FICHA DO PRODUTO'}
            </h2>
            <p style={{fontSize: '11px', color: '#999', marginBottom: '20px'}}>STATUS: <b style={{color: dados.status ? '#22c55e' : '#ef4444'}}>{dados.status ? 'ATIVO NO SISTEMA' : 'BLOQUEADO'}</b></p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* GRUPO 1: IDENTIFICAÇÃO BÁSICA */}
              <div style={cssGrupo}>
                <div>
                  <label style={cssLabel}>NOME DO PRODUTO (Fruta, Verdura, etc) *</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dados.nome} onChange={e => setDados({...dados, nome: e.target.value.toUpperCase()})} style={cssInput(!editando)} placeholder="Ex: BANANA PRATA" />
                </div>
              </div>

              {/* GRUPO 2: CLASSIFICAÇÃO */}
              <div style={cssGrupo}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>CATEGORIA *</label>
                    <select onKeyDown={handleKeyDown} disabled={!editando} value={dados.categoria} onChange={e => setDados({...dados, categoria: e.target.value.toUpperCase()})} style={cssInput(!editando)}>
                      <option value="FRUTAS">🍎 FRUTAS</option>
                      <option value="VERDURAS">🥬 VERDURAS</option>
                      <option value="LEGUMES">🥕 LEGUMES</option>
                      <option value="HORTALISSAS">🌿 HORTALIÇAS</option>
                      <option value="CAIXARIAS">📦 CAIXARIAS</option>
                      <option value="EMBANDEJADOS">🍱 EMBANDEJADOS</option>
                      <option value="SACARIAS">🥔 SACARIAS</option>
                      <option value="VARIADOS">🛒 VARIADOS</option>
                    </select>
                  </div>
                  <div>
                    <label style={cssLabel}>VENDIDO POR *</label>
                    <select onKeyDown={handleKeyDown} disabled={!editando} value={dados.unidade_medida} onChange={e => setDados({...dados, unidade_medida: e.target.value})} style={cssInput(!editando)}>
                      <option value="KG">KG (Quilo)</option>
                      <option value="UN">UN (Unidade)</option>
                      <option value="BDJ">Bandeja</option>
                      <option value="MAÇO">Maço</option>
                      <option value="DZ">Dúzia</option>
                      <option value="CX">Caixa</option>
                      <option value="SACO">Saco</option>
                    </select>
                  </div>
                </div>
              </div>

            </div>

            {/* BOTÕES DE AÇÃO */}
            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editando ? (
                // 💡 Botão agora tem o onKeyDown, e quando recebe o Enter pela função principal, ele é clicado virtualmente
                <button onKeyDown={handleKeyDown} onClick={salvar} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>SALVAR PRODUTO</button>
              ) : (
                <>
                  <button onClick={() => setEditando(true)} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.editar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>HABILITAR EDIÇÃO</button>
                  {!modalAberto.novo && (
                    <button onClick={alternarStatus} style={{ height: '48px', background: 'none', border: `2px solid ${dados.status ? '#ef4444' : '#22c55e'}`, color: dados.status ? '#ef4444' : '#22c55e', borderRadius: configDesign.botoes.raio, fontWeight: '900', cursor: 'pointer', fontSize: '13px' }}>
                      {dados.status ? 'BLOQUEAR NO SISTEMA' : 'REATIVAR NO SISTEMA'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}