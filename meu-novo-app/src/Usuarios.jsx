import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Usuarios() {
  const design = {
    geral: { 
      fonte: "'Inter', sans-serif", 
      corFundoApp: '#f4f4f5',
      raioBordaGlobal: '20px', 
      sombraPadrao: '0 8px 30px rgba(0,0,0,0.04)' 
    },
    modal: { 
      overlay: 'rgba(0,0,0,0.85)', 
      fundo: '#ffffff', 
      raio: '32px', 
      padding: '40px', 
      tituloCor: '#f97316' 
    },
    inputs: {
      fundo: '#fcfcfc',
      fundoBloqueado: '#f1f5f9',
      borda: '1.5px solid #e2e8f0',
      raio: '12px',
      padding: '14px',
      labelCor: '#f97316',
      labelTamanho: '10px'
    },
    botoes: { 
      primario: '#f97316', 
      secundario: '#111111', 
      texto: '#ffffff',
      altura: '54px',
      raio: '16px'
    }
  };

  const [usuarios, setUsuarios] = useState([]);
  const [listaLojas, setListaLojas] = useState([]); 
  const [busca, setBusca] = useState('');
  const [lojaDigitada, setLojaDigitada] = useState('');
  
  const [mostrarSugestoesLoja, setMostrarSugestoesLoja] = useState(false);
  const [mostrarSugestoesNome, setMostrarSugestoesNome] = useState(false); // 💡 Controle de Nomes
  
  const [usuarioAberto, setUsuarioAberto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [dados, setDados] = useState({ nome: '', codigo: '', senha: '', telefone: '', perfil: 'operador', status: true, loja: '' });

  async function carregarDados() {
    const { data: dataUsuarios } = await supabase.from('usuarios').select('*').order('nome', { ascending: true });
    setUsuarios(dataUsuarios || []);

    const { data: dataLojas } = await supabase.from('lojas').select('*');
    setListaLojas(dataLojas || []);
  }

  useEffect(() => { carregarDados(); }, []);

  const formatarTelefone = (valor) => {
    if (!valor) return '';
    let apenasNumeros = valor.replace(/\D/g, ''); 
    if (apenasNumeros.length > 11) apenasNumeros = apenasNumeros.slice(0, 11); 
    if (apenasNumeros.length === 0) return '';
    if (apenasNumeros.length <= 2) return `(${apenasNumeros}`;
    if (apenasNumeros.length <= 7) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`;
  };

  const handleTelefoneChange = (e) => {
    setDados({ ...dados, telefone: formatarTelefone(e.target.value) });
  };

  const selecionarLoja = (loja) => {
    const nomeDaLoja = loja['Nome Fantasia'] || loja.nome_fantasia || loja.Nome_Fantasia || 'LOJA DESCONHECIDA';
    const idDaLoja = loja.codigo_loja;

    if (!idDaLoja) {
      alert("Erro V.I.R.T.U.S: Loja sem 'codigo_loja' cadastrado.");
      return;
    }
    
    const prefixo = String(idDaLoja).padStart(2, '0');
    const usuariosDaLoja = usuarios.filter(u => u.codigo?.startsWith(prefixo));
    const proximoNumero = (usuariosDaLoja.length + 1).toString().padStart(2, '0');
    
    setDados({ ...dados, loja: nomeDaLoja, codigo: `${prefixo}${proximoNumero}` });
    setLojaDigitada(nomeDaLoja);
    setMostrarSugestoesLoja(false);
  };

  // 🛡️ TRAVA V.I.R.T.U.S: Validação rigorosa
  async function salvar() {
    if (!dados.nome.trim()) return alert("⚠️ V.I.R.T.U.S INFORMA: O campo NOME COMPLETO é obrigatório!");
    if (!dados.loja.trim() || !dados.codigo) return alert("⚠️ V.I.R.T.U.S INFORMA: Você precisa buscar e selecionar uma LOJA para gerar o código de acesso!");
    if (!dados.senha.trim()) return alert("⚠️ V.I.R.T.U.S INFORMA: A SENHA é obrigatória!");

    // 💡 TRAVA: Impede criar usuários com o mesmo nome exato na mesma loja.
    const duplicado = usuarios.find(u => u.nome === dados.nome && u.loja === dados.loja && u.codigo !== dados.codigo);
    if (duplicado) {
       return alert(`⚠️ V.I.R.T.U.S INFORMA: Já existe um usuário com o nome "${dados.nome}" cadastrado nesta loja! Selecione na lista de sugestões caso queira apenas atualizar.`);
    }

    const { error } = await supabase.from('usuarios').upsert([dados]);
    if (!error) { 
      alert("✅ Usuário salvo com sucesso no sistema!"); 
      setUsuarioAberto(null); 
      carregarDados(); 
    } else { 
      alert("Erro no Banco de Dados: " + error.message); 
    }
  }

  async function alternarStatus() {
    if (!dados.codigo) return alert("Erro: Código não localizado.");
    const novoStatus = !dados.status;
    if (window.confirm(novoStatus ? "REATIVAR acesso deste usuário?" : "BLOQUEAR acesso deste usuário?")) {
      const { error } = await supabase.from('usuarios').update({ status: novoStatus }).eq('codigo', dados.codigo);
      if (!error) { setDados({ ...dados, status: novoStatus }); carregarDados(); }
    }
  }

  const lojasFiltradas = listaLojas.filter(l => {
    const nome = l['Nome Fantasia'] || l.nome_fantasia || l.Nome_Fantasia || '';
    return nome.toUpperCase().includes(lojaDigitada.toUpperCase());
  });

  const usuariosFiltradosNome = dados.nome ? usuarios.filter(u => u.nome?.toLowerCase().includes(dados.nome.toLowerCase()) && u.codigo !== dados.codigo) : [];

  const cssLabel = { fontSize: design.inputs.labelTamanho, fontWeight: '900', color: design.inputs.labelCor, display: 'block', marginBottom: '6px' };
  const cssInput = (bloqueado) => ({ width: '100%', padding: design.inputs.padding, borderRadius: design.inputs.raio, border: design.inputs.borda, backgroundColor: bloqueado ? design.inputs.fundoBloqueado : design.inputs.fundo, outline: 'none', boxSizing: 'border-box' });
  const cssGrupo = { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: '#fdfdfd', borderRadius: '20px', border: '1px solid #f1f5f9' };

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: design.geral.fonte, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      <div style={{ display: 'flex', gap: '15px' }}>
        <input placeholder="Procurar funcionário..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '18px', borderRadius: design.geral.raioBordaGlobal, border: 'none', boxShadow: design.geral.sombraPadrao, outline: 'none' }} />
        <button 
          onClick={() => { setDados({ nome: '', codigo: '', senha: '', telefone: '', perfil: 'operador', status: true, loja: '' }); setLojaDigitada(''); setUsuarioAberto({novo: true}); setEditando(true); }}
          style={{ backgroundColor: design.botoes.primario, color: design.botoes.texto, border: 'none', padding: '0 30px', borderRadius: design.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}
        >
          + NOVO
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {usuarios.filter(u => u.nome?.toLowerCase().includes(busca.toLowerCase())).map(u => (
          <div key={u.codigo} onClick={() => { setUsuarioAberto(u); setDados({ ...u, telefone: u.telefone || '' }); setLojaDigitada(u.loja || ''); setEditando(false); setMostrarSugestoesLoja(false); setMostrarSugestoesNome(false); }} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: design.geral.raioBordaGlobal, boxShadow: design.geral.sombraPadrao, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', opacity: u.status !== false ? 1 : 0.6 }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: design.botoes.primario }}>{u.nome?.charAt(0)}</div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '13px' }}>{u.nome}</strong>
              <small style={{ color: '#64748b', fontSize: '11px' }}>Cód: {u.codigo} | {u.telefone || 'Sem telefone'} | {u.loja}</small>
            </div>
            <span>{u.status !== false ? '🟢' : '🔴'}</span>
          </div>
        ))}
      </div>

      {usuarioAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: design.modal.overlay, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: design.modal.fundo, width: '90%', maxWidth: '520px', padding: design.modal.padding, borderRadius: design.modal.raio, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={() => setUsuarioAberto(null)} style={{ position: 'absolute', top: '25px', right: '25px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>

            <h2 style={{ color: design.modal.tituloCor, fontWeight: '900', marginBottom: '5px' }}>{usuarioAberto.novo ? 'NOVO CADASTRO' : 'PERFIL DO USUÁRIO'}</h2>
            <p style={{fontSize: '11px', color: '#999', marginBottom: '20px'}}>STATUS: <b style={{color: dados.status !== false ? '#22c55e' : '#ef4444'}}>{dados.status !== false ? 'ACESSO LIBERADO' : 'BLOQUEADO'}</b></p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={cssGrupo}>
                <div style={{ position: 'relative' }}>
                  <label style={cssLabel}>NOME COMPLETO *</label>
                  <input 
                    disabled={!editando} 
                    value={dados.nome} 
                    onChange={e => {
                      setDados({...dados, nome: e.target.value.toUpperCase()});
                      setMostrarSugestoesNome(true);
                    }} 
                    onClick={() => { if(editando) setMostrarSugestoesNome(true); }}
                    style={cssInput(!editando)} 
                    placeholder="EX: JOÃO DA SILVA" 
                  />
                  {/* 💡 CAIXA DE SUGESTÃO NOME USUÁRIO */}
                  {mostrarSugestoesNome && editando && usuariosFiltradosNome.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', borderRadius: '12px', zIndex: 99999, maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', marginTop: '5px' }}>
                      <div style={{ padding: '10px', fontSize: '11px', color: '#f97316', fontWeight: 'bold', backgroundColor: '#fff7ed' }}>⚠️ Nomes parecidos já cadastrados:</div>
                      {usuariosFiltradosNome.map(u => (
                        <div key={u.codigo} onClick={() => { setDados(u); setUsuarioAberto(u); setLojaDigitada(u.loja || ''); setMostrarSugestoesNome(false); }} style={{ padding: '15px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 'bold', color: '#111' }}>
                          {u.nome} <span style={{ color: '#999', fontSize: '10px', marginLeft: '5px' }}>(Loja: {u.loja})</span>
                        </div>
                      ))}
                      <div onClick={() => setMostrarSugestoesNome(false)} style={{ padding: '10px', textAlign: 'center', backgroundColor: '#f8fafc', color: '#ef4444', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>FECHAR ✕</div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={cssLabel}>TELEFONE (WHATSAPP)</label>
                  <input disabled={!editando} value={dados.telefone} onChange={handleTelefoneChange} placeholder="(00) 00000-0000" maxLength="15" style={cssInput(!editando)} />
                </div>
              </div>

              <div style={{ ...cssGrupo, borderColor: '#ffedd5', backgroundColor: '#fff7ed' }}>
                <div style={{ position: 'relative' }}>
                  <label style={cssLabel}>BUSCAR UNIDADE DE TRABALHO *</label>
                  <input 
                    disabled={!editando}
                    placeholder="DIGITE O NOME DA LOJA..."
                    value={lojaDigitada}
                    onChange={(e) => { setLojaDigitada(e.target.value.toUpperCase()); setMostrarSugestoesLoja(true); }}
                    onClick={() => { if(editando) setMostrarSugestoesLoja(true); }}
                    style={{ ...cssInput(!editando), borderColor: '#fed7aa' }}
                  />
                  {mostrarSugestoesLoja && editando && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', borderRadius: '12px', zIndex: 99999, maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', marginTop: '5px' }}>
                      {lojasFiltradas.length > 0 ? (
                        lojasFiltradas.map(loja => (
                          <div key={loja.id || loja.codigo_loja || Math.random()} onClick={() => selecionarLoja(loja)} style={{ padding: '15px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 'bold', color: '#111' }}>
                            {loja['Nome Fantasia'] || loja.nome_fantasia || loja.Nome_Fantasia} 
                            <span style={{ color: '#999', fontSize: '10px', marginLeft: '5px' }}>(Cód: {loja.codigo_loja || '?'})</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '15px', fontSize: '12px', color: '#999', textAlign: 'center', fontWeight: 'bold' }}>Nenhuma loja encontrada.</div>
                      )}
                      <div onClick={() => setMostrarSugestoesLoja(false)} style={{ padding: '10px', textAlign: 'center', backgroundColor: '#f8fafc', color: '#ef4444', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>FECHAR LISTA ✕</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>CÓDIGO GERADO</label>
                    <input readOnly value={dados.codigo} placeholder="AUTOMÁTICO" style={{ ...cssInput(true), fontWeight: '900', color: design.botoes.primario, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={cssLabel}>SENHA *</label>
                    <input disabled={!editando} value={dados.senha} onChange={e => setDados({...dados, senha: e.target.value})} style={cssInput(!editando)} />
                  </div>
                </div>
              </div>

              <div style={cssGrupo}>
                <label style={cssLabel}>NÍVEL DE PERMISSÃO NO SISTEMA *</label>
                <select disabled={!editando} value={dados.perfil} onChange={e => setDados({...dados, perfil: e.target.value})} style={cssInput(!editando)}>
                  <option value="operador">👤 OPERADOR (ACESSO LIMITADO)</option>
                  <option value="admin">🛡️ ADMINISTRADOR (ACESSO TOTAL)</option>
                </select>
              </div>

            </div>

            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editando ? (
                <button onClick={salvar} style={{ height: design.botoes.altura, backgroundColor: design.botoes.primario, color: design.botoes.texto, borderRadius: design.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>SALVAR CADASTRO</button>
              ) : (
                <>
                  <button onClick={() => setEditando(true)} style={{ height: design.botoes.altura, backgroundColor: design.botoes.secundario, color: design.botoes.texto, borderRadius: design.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>HABILITAR EDIÇÃO</button>
                  {!usuarioAberto.novo && (
                    <button onClick={alternarStatus} style={{ height: '48px', background: 'none', border: `2px solid ${dados.status !== false ? '#ef4444' : '#22c55e'}`, color: dados.status !== false ? '#ef4444' : '#22c55e', borderRadius: design.botoes.raio, fontWeight: '900', cursor: 'pointer', fontSize: '13px' }}>
                      {dados.status !== false ? 'BLOQUEAR ESTE USUÁRIO' : 'REATIVAR ESTE USUÁRIO'}
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