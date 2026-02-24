import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Fornecedores() {
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif", raioBordaGlobal: '20px', sombraSuave: '0 8px 30px rgba(0,0,0,0.04)', corTextoPrincipal: '#111111', corTextoSecundario: '#64748b' },
    cards: { fundo: '#ffffff', fundoIcone: '#fff7ed', corIcone: '#f97316', raioIcone: '14px', tamanhoIcone: '55px' },
    modal: { fundoEscuro: 'rgba(0,0,0,0.85)', fundoModal: '#ffffff', raioBorda: '32px', paddingInterno: '40px', corTitulo: '#f97316' },
    inputs: { fundoLivre: '#fcfcfc', fundoBloqueado: '#f1f5f9', borda: '1.5px solid #e2e8f0', raio: '12px', padding: '14px', corTitulos: '#f97316', tamanhoTitulos: '10px' },
    botoes: { salvar: '#f97316', editar: '#111111', textoCor: '#ffffff', altura: '54px', raio: '16px' }
  };

  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(null);
  const [editando, setEditando] = useState(false);
  
  // 💡 Controle de sugestões para evitar duplicidades
  const [mostrarSugestoesNome, setMostrarSugestoesNome] = useState(false);

  const estadoInicial = { nome_fantasia: '', nome_completo: '', telefone: '', tipo_documento: 'CNPJ', documento: '', tipo_pix: 'CNPJ/CPF', chave_pix: '' };
  const [dados, setDados] = useState(estadoInicial);

  async function carregarFornecedores() {
    const { data, error } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
    if (!error) setFornecedores(data || []);
  }

  useEffect(() => { carregarFornecedores(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      const campos = Array.from(document.querySelectorAll('.modal-virtus input:not([disabled]):not([readonly]), .modal-virtus select:not([disabled]), .modal-virtus button:not([disabled])'));
      const indexAtual = campos.indexOf(e.target);
      if (indexAtual > -1 && indexAtual < campos.length - 1) {
        campos[indexAtual + 1].focus();
      }
    }
  };

  const formatarTelefone = (valor) => {
    let v = valor.replace(/\D/g, ''); 
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length === 0) return '';
    if (v.length <= 2) return `(${v}`;
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  };

  const formatarDocumento = (valor, tipo) => {
    let v = valor.replace(/\D/g, '');
    if (tipo === 'CPF') {
      if (v.length > 11) v = v.slice(0, 11);
      if (v.length <= 3) return v;
      if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
      if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
      return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
    } else {
      if (v.length > 14) v = v.slice(0, 14);
      if (v.length <= 2) return v;
      if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
      if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
      if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
      return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
    }
  };

  const handleChangeDocType = (e) => {
    setDados({ ...dados, tipo_documento: e.target.value, documento: '' });
  };

  async function salvar() {
    if (!dados.nome_fantasia || !dados.telefone || !dados.documento || !dados.chave_pix) {
      return alert("⚠️ V.I.R.T.U.S INFORMA: Faltam campos obrigatórios (Fantasia, Telefone, Documento ou Pix)!");
    }
    
    if (dados.tipo_documento === 'CPF' && !dados.nome_completo) {
      return alert("⚠️ V.I.R.T.U.S INFORMA: Para pessoa física (CPF), o NOME COMPLETO é obrigatório!");
    }

    // 🛡️ TRAVA DE DUPLICIDADE: Impede criar novo se já existe nome igual e é um cadastro novo
    if (!dados.id && fornecedores.find(f => f.nome_fantasia === dados.nome_fantasia)) {
       return alert("⚠️ Já existe um fornecedor com este Nome Fantasia! Selecione-o na lista de sugestões se deseja atualizar.");
    }

    const { error } = await supabase.from('fornecedores').upsert([dados]);
    if (!error) { 
      alert("✅ Fornecedor registrado com sucesso!"); 
      setModalAberto(null); 
      carregarFornecedores(); 
    } else { 
      alert("Erro no Banco de Dados: " + error.message); 
    }
  }

  const filtrados = fornecedores.filter(f => f.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) || f.nome_completo?.toLowerCase().includes(busca.toLowerCase()));

  // 💡 LÓGICA DE PESQUISA AUTOMÁTICA EM TEMPO REAL
  const fornecedoresFiltradosNome = dados.nome_fantasia && dados.nome_fantasia.length > 2 
    ? fornecedores.filter(f => f.nome_fantasia?.toLowerCase().includes(dados.nome_fantasia.toLowerCase()) && f.id !== dados.id) 
    : [];
    
  const fornecedorTelefoneExistente = dados.telefone && dados.telefone.length > 13 
    ? fornecedores.find(f => f.telefone === dados.telefone && f.id !== dados.id) 
    : null;

  const cssLabel = { fontSize: configDesign.inputs.tamanhoTitulos, fontWeight: '900', color: configDesign.inputs.corTitulos, display: 'block', marginBottom: '6px' };
  const cssInput = (bloqueado) => ({ width: '100%', padding: configDesign.inputs.padding, borderRadius: configDesign.inputs.raio, border: configDesign.inputs.borda, backgroundColor: bloqueado ? configDesign.inputs.fundoBloqueado : configDesign.inputs.fundoLivre, outline: 'none', boxSizing: 'border-box' });
  const cssGrupo = { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: '#fdfdfd', borderRadius: '20px', border: '1px solid #f1f5f9' };

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      <div style={{ display: 'flex', gap: '15px' }}>
        <input placeholder="Procurar fornecedor por Nome Fantasia ou Razão Social..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '18px', borderRadius: configDesign.geral.raioBordaGlobal, border: 'none', boxShadow: configDesign.geral.sombraSuave, outline: 'none' }} />
        <button onClick={() => { setDados(estadoInicial); setModalAberto({novo: true}); setEditando(true); }} style={{ backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, border: 'none', padding: '0 30px', borderRadius: configDesign.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}>+ NOVO FORNECEDOR</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {filtrados.map(f => (
          <div key={f.id} onClick={() => { setModalAberto(f); setDados(f); setEditando(false); }} style={{ backgroundColor: configDesign.cards.fundo, padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, boxShadow: configDesign.geral.sombraSuave, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', transition: '0.2s' }}>
            <div style={{ width: configDesign.cards.tamanhoIcone, height: configDesign.cards.tamanhoIcone, backgroundColor: configDesign.cards.fundoIcone, borderRadius: configDesign.cards.raioIcone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: configDesign.cards.corIcone, fontSize: '20px' }}>{f.nome_fantasia?.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '14px', color: configDesign.geral.corTextoPrincipal }}>{f.nome_fantasia}</strong>
              <small style={{ color: configDesign.geral.corTextoSecundario, fontSize: '11px', display: 'block', marginTop: '2px' }}>{f.tipo_documento}: {f.documento}</small>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: configDesign.modal.fundoEscuro, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="modal-virtus" style={{ backgroundColor: configDesign.modal.fundoModal, width: '90%', maxWidth: '600px', padding: configDesign.modal.paddingInterno, borderRadius: configDesign.modal.raioBorda, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={() => setModalAberto(null)} style={{ position: 'absolute', top: '25px', right: '25px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>

            <h2 style={{ color: configDesign.modal.corTitulo, fontWeight: '900', marginBottom: '25px' }}>{modalAberto.novo ? 'NOVO FORNECEDOR' : 'FICHA DO FORNECEDOR'}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={cssGrupo}>
                <div style={{ position: 'relative' }}>
                  <label style={cssLabel}>NOME FANTASIA (NOME COMERCIAL) *</label>
                  <input 
                    onKeyDown={handleKeyDown} 
                    disabled={!editando} 
                    value={dados.nome_fantasia} 
                    onChange={e => {
                      setDados({...dados, nome_fantasia: e.target.value.toUpperCase()});
                      setMostrarSugestoesNome(true);
                    }} 
                    onClick={() => { if(editando) setMostrarSugestoesNome(true); }}
                    style={cssInput(!editando)} 
                    placeholder="Ex: DISTRIBUIDORA VALE VERDE" 
                  />
                  
                  {/* 💡 CAIXA DE SUGESTÃO PARA EVITAR DUPLICAÇÃO DE FORNECEDORES */}
                  {mostrarSugestoesNome && editando && fornecedoresFiltradosNome.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', borderRadius: '12px', zIndex: 99999, maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', marginTop: '5px' }}>
                      <div style={{ padding: '10px', fontSize: '11px', color: '#f97316', fontWeight: 'bold', backgroundColor: '#fff7ed' }}>⚠️ Já existe um fornecedor com nome parecido:</div>
                      {fornecedoresFiltradosNome.map(f => (
                        <div key={f.id} onClick={() => { setDados(f); setModalAberto(f); setMostrarSugestoesNome(false); }} style={{ padding: '15px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 'bold', color: '#111' }}>
                          {f.nome_fantasia} <span style={{ color: '#999', fontSize: '10px', marginLeft: '5px' }}>(Clique para editar este cadastro)</span>
                        </div>
                      ))}
                      <div onClick={() => setMostrarSugestoesNome(false)} style={{ padding: '10px', textAlign: 'center', backgroundColor: '#f8fafc', color: '#ef4444', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>FECHAR ✕</div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={cssLabel}>NOME COMPLETO / RAZÃO SOCIAL {dados.tipo_documento === 'CPF' ? '*' : '(Opcional para CNPJ)'}</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dados.nome_completo} onChange={e => setDados({...dados, nome_completo: e.target.value.toUpperCase()})} style={cssInput(!editando)} placeholder="Ex: VALE VERDE ALIMENTOS LTDA" />
                </div>
              </div>

              <div style={cssGrupo}>
                <div>
                  <label style={cssLabel}>TELEFONE / WHATSAPP *</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dados.telefone} onChange={e => setDados({...dados, telefone: formatarTelefone(e.target.value)})} style={cssInput(!editando)} placeholder="(00) 00000-0000" />
                  
                  {/* 💡 ALERTA DE TELEFONE JÁ EXISTENTE */}
                  {fornecedorTelefoneExistente && editando && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '8px', marginTop: '8px', color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
                      ⚠️ ALERTA: Este número já está sendo usado pelo fornecedor: <br/><span style={{ color: '#b91c1c' }}>{fornecedorTelefoneExistente.nome_fantasia}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>PESSOA *</label>
                    <select onKeyDown={handleKeyDown} disabled={!editando} value={dados.tipo_documento} onChange={handleChangeDocType} style={cssInput(!editando)}>
                      <option value="CNPJ">JURÍDICA</option>
                      <option value="CPF">FÍSICA</option>
                    </select>
                  </div>
                  <div>
                    <label style={cssLabel}>NÚMERO DO {dados.tipo_documento} *</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dados.documento} onChange={e => setDados({...dados, documento: formatarDocumento(e.target.value, dados.tipo_documento)})} style={cssInput(!editando)} placeholder={dados.tipo_documento === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'} />
                  </div>
                </div>
              </div>

              <div style={{ ...cssGrupo, borderColor: '#dcfce3', backgroundColor: '#f0fdf4' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '15px' }}>
                  <div>
                    <label style={{...cssLabel, color: '#16a34a'}}>TIPO DE CHAVE PIX *</label>
                    <select onKeyDown={handleKeyDown} disabled={!editando} value={dados.tipo_pix} onChange={e => setDados({...dados, tipo_pix: e.target.value})} style={cssInput(!editando)}>
                      <option value="CNPJ/CPF">CNPJ / CPF</option>
                      <option value="E-mail">E-MAIL</option>
                      <option value="Telefone">TELEFONE</option>
                      <option value="Aleatória">CHAVE ALEATÓRIA</option>
                    </select>
                  </div>
                  <div>
                    <label style={{...cssLabel, color: '#16a34a'}}>CHAVE PIX PARA PAGAMENTO *</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dados.chave_pix} onChange={e => setDados({...dados, chave_pix: e.target.value})} style={cssInput(!editando)} placeholder="Digite a chave PIX..." />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editando ? (
                <button onKeyDown={handleKeyDown} onClick={salvar} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>SALVAR FORNECEDOR</button>
              ) : (
                <button onClick={() => setEditando(true)} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.editar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>HABILITAR EDIÇÃO</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}