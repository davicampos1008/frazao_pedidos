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
  const [lojaAtiva, setLojaAtiva] = useState(null); 
  
  const [mostrarSugestoesNome, setMostrarSugestoesNome] = useState(false); 
  
  const [usuarioAberto, setUsuarioAberto] = useState(null);
  const [editando, setEditando] = useState(false);
  
  const [dados, setDados] = useState({ 
    id: null, 
    nome: '', 
    codigo: '', 
    senha: '', 
    telefone: '', 
    perfil: 'operador', 
    status: true, 
    loja: '', 
    codigo_loja: '' 
  });

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

  const handleSelectLoja = (e) => {
    const idDaLoja = e.target.value;
    const lojaSelecionada = listaLojas.find(l => String(l.codigo_loja) === String(idDaLoja));
    
    if (!lojaSelecionada) return;

    const nomeDaLoja = lojaSelecionada['Nome Fantasia'] || lojaSelecionada.nome_fantasia || lojaSelecionada.Nome_Fantasia || 'LOJA DESCONHECIDA';

    if (!dados.id) {
        const prefixo = String(idDaLoja).padStart(2, '0');
        const usuariosDaLoja = usuarios.filter(u => String(u.codigo_loja) === String(idDaLoja));
        const proximoNumero = (usuariosDaLoja.length + 1).toString().padStart(2, '0');
        setDados({ ...dados, loja: nomeDaLoja, codigo: `${prefixo}${proximoNumero}`, codigo_loja: idDaLoja });
    } else {
        setDados({ ...dados, loja: nomeDaLoja, codigo_loja: idDaLoja });
    }
  };

  async function salvar() {
    if (!dados.nome.trim()) return alert("⚠️ NOME é obrigatório!");
    if (!dados.codigo_loja) return alert("⚠️ SELECIONE UMA LOJA!");
    if (!dados.senha.trim()) return alert("⚠️ SENHA é obrigatória!");

    const lojaVinculada = listaLojas.find(l => String(l.codigo_loja) === String(dados.codigo_loja));
    const nomeLojaReal = lojaVinculada ? (lojaVinculada['Nome Fantasia'] || lojaVinculada.nome_fantasia) : dados.loja;

    const payload = {
        nome: dados.nome.trim(),
        codigo: dados.codigo,
        senha: dados.senha.trim(),
        telefone: dados.telefone || '',
        perfil: dados.perfil || 'operador',
        status: dados.status !== false,
        loja: nomeLojaReal,
        codigo_loja: dados.codigo_loja
    };

    if (dados.id) {
        payload.id = dados.id;
    }

    const { error } = await supabase.from('usuarios').upsert([payload]);
    
    if (!error) { 
      alert("✅ V.I.R.T.U.S: Cadastro atualizado com sucesso!"); 
      setUsuarioAberto(null); 
      carregarDados(); 
    } else { 
      alert("Erro Crítico: " + error.message); 
    }
  }

  async function alternarStatus() {
    if (!dados.id) return alert("Erro: ID não localizado.");
    const novoStatus = !dados.status;
    if (window.confirm(novoStatus ? "REATIVAR acesso?" : "BLOQUEAR acesso?")) {
      const { error } = await supabase.from('usuarios').update({ status: novoStatus }).eq('id', dados.id);
      if (!error) { setDados({ ...dados, status: novoStatus }); carregarDados(); }
    }
  }

  const lojasOrdenadas = [...listaLojas].sort((a, b) => 
    Number(a.codigo_loja) - Number(b.codigo_loja)
  );

  const usuariosExibidos = usuarios.filter(u => {
    const matchesBusca = u.nome?.toLowerCase().includes(busca.toLowerCase());
    const matchesLoja = lojaAtiva !== null 
      ? Number(u.codigo_loja) === Number(lojaAtiva) 
      : true;
    return matchesBusca && matchesLoja;
  });

  const usuariosFiltradosNome = dados.nome && dados.nome.length > 2 
    ? usuarios.filter(u => u.nome?.toLowerCase().includes(dados.nome.toLowerCase()) && u.id !== dados.id) 
    : [];

  const cssLabel = { fontSize: design.inputs.labelTamanho, fontWeight: '900', color: design.inputs.labelCor, display: 'block', marginBottom: '6px' };
  const cssInput = (bloqueado) => ({ width: '100%', padding: design.inputs.padding, borderRadius: design.inputs.raio, border: design.inputs.borda, backgroundColor: bloqueado ? design.inputs.fundoBloqueado : design.inputs.fundo, outline: 'none', boxSizing: 'border-box' });
  const cssGrupo = { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: '#fdfdfd', borderRadius: '20px', border: '1px solid #f1f5f9' };

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: design.geral.fonte, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      {/* HEADER E BUSCA */}
      <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
        <input placeholder="Procurar funcionário..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, padding: '18px', borderRadius: design.geral.raioBordaGlobal, border: 'none', boxShadow: design.geral.sombraPadrao, outline: 'none' }} />
        <button 
          onClick={() => { 
            setDados({ id: null, nome: '', codigo: '', senha: '', telefone: '', perfil: 'operador', status: true, loja: '', codigo_loja: '' }); 
            setUsuarioAberto({novo: true}); 
            setEditando(true); 
          }}
          style={{ backgroundColor: design.botoes.primario, color: design.botoes.texto, border: 'none', padding: '0 30px', borderRadius: design.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}
        >
          + NOVO
        </button>
      </div>

      {/* CARDS DE LOJAS (ORGANIZAÇÃO POR UNIDADE) */}
      <div>
        <h3 style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '900', marginBottom: '15px', letterSpacing: '1px' }}>SELECIONE A UNIDADE</h3>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '15px', scrollbarWidth: 'none' }}>
          <div 
            onClick={() => setLojaAtiva(null)}
            style={{ 
              minWidth: '120px', padding: '15px', borderRadius: '18px', cursor: 'pointer', textAlign: 'center',
              backgroundColor: !lojaAtiva ? design.botoes.primario : '#fff',
              color: !lojaAtiva ? '#fff' : '#64748b',
              boxShadow: design.geral.sombraPadrao, transition: '0.3s', flexShrink: 0,
              border: !lojaAtiva ? 'none' : '1px solid #e2e8f0'
            }}
          >
            <strong style={{ fontSize: '11px' }}>VER TODAS</strong>
          </div>

          {lojasOrdenadas.map(loja => {
            const ativo = Number(lojaAtiva) === Number(loja.codigo_loja);
            return (
              <div 
                key={loja.codigo_loja}
                onClick={() => setLojaAtiva(ativo ? null : loja.codigo_loja)}
                style={{ 
                  minWidth: '150px', padding: '15px', borderRadius: '18px', cursor: 'pointer',
                  backgroundColor: ativo ? design.botoes.secundario : '#fff',
                  color: ativo ? '#fff' : '#111',
                  boxShadow: design.geral.sombraPadrao, transition: '0.3s', flexShrink: 0,
                  border: ativo ? 'none' : '1px solid #e2e8f0'
                }}
              >
                <div style={{ fontSize: '9px', color: ativo ? design.botoes.primario : '#94a3b8', fontWeight: '900' }}>CÓD. {loja.codigo_loja}</div>
                <div style={{ fontSize: '12px', fontWeight: '700', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {loja['Nome Fantasia'] || loja.nome_fantasia || 'LOJA'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LISTAGEM DE USUÁRIOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {usuariosExibidos.map(u => (
          <div key={u.id || u.codigo} onClick={() => { setUsuarioAberto(u); setDados({ ...u }); setEditando(false); }} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: design.geral.raioBordaGlobal, boxShadow: design.geral.sombraPadrao, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', opacity: u.status !== false ? 1 : 0.6 }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: design.botoes.primario }}>{u.nome?.charAt(0)}</div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '13px' }}>{u.nome}</strong>
              <small style={{ color: '#64748b', fontSize: '11px' }}>Cód: {u.codigo} | {u.loja}</small>
            </div>
            <span>{u.status !== false ? '🟢' : '🔴'}</span>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {usuarioAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: design.modal.overlay, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: design.modal.fundo, width: '90%', maxWidth: '520px', padding: design.modal.padding, borderRadius: design.modal.raio, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={() => setUsuarioAberto(null)} style={{ position: 'absolute', top: '25px', right: '25px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>

            <h2 style={{ color: design.modal.tituloCor, fontWeight: '900', marginBottom: '5px' }}>{usuarioAberto.novo ? 'NOVO CADASTRO' : 'PERFIL DO USUÁRIO'}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
              <div style={cssGrupo}>
                <div style={{ position: 'relative' }}>
                  <label style={cssLabel}>NOME COMPLETO *</label>
                  <input 
                    disabled={!editando} 
                    value={dados.nome} 
                    onChange={e => { setDados({...dados, nome: e.target.value.toUpperCase()}); setMostrarSugestoesNome(true); }} 
                    style={cssInput(!editando)} 
                  />
                  {mostrarSugestoesNome && editando && usuariosFiltradosNome.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', borderRadius: '12px', zIndex: 99999, maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0' }}>
                      <div style={{ padding: '10px', fontSize: '11px', color: '#f97316', fontWeight: 'bold' }}>Possível Duplicata:</div>
                      {usuariosFiltradosNome.map(u => (
                        <div key={u.id} onClick={() => { setDados(u); setUsuarioAberto(u); setMostrarSugestoesNome(false); }} style={{ padding: '15px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                          {u.nome} ({u.loja})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={cssLabel}>TELEFONE</label>
                  <input disabled={!editando} value={dados.telefone} onChange={handleTelefoneChange} style={cssInput(!editando)} />
                </div>
              </div>

              <div style={{ ...cssGrupo, borderColor: '#ffedd5', backgroundColor: '#fff7ed' }}>
                <div style={{ position: 'relative' }}>
                  <label style={cssLabel}>UNIDADE DE TRABALHO *</label>
                  <select 
                    disabled={!editando}
                    value={dados.codigo_loja || ''}
                    onChange={handleSelectLoja}
                    style={{ ...cssInput(!editando), borderColor: '#fed7aa', fontWeight: 'bold', color: '#111' }}
                  >
                    <option value="" disabled>Selecione uma loja da rede...</option>
                    {lojasOrdenadas.map(loja => (
                      <option key={loja.codigo_loja} value={loja.codigo_loja}>
                        {loja['Nome Fantasia'] || loja.nome_fantasia}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>CÓDIGO</label>
                    <input readOnly value={dados.codigo} placeholder="Auto-gerado" style={{ ...cssInput(true), fontWeight: '900', color: design.botoes.primario, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={cssLabel}>SENHA *</label>
                    <input disabled={!editando} value={dados.senha} onChange={e => setDados({...dados, senha: e.target.value})} style={cssInput(!editando)} />
                  </div>
                </div>
              </div>

              <div style={cssGrupo}>
                <label style={cssLabel}>PERMISSÃO / CARGO *</label>
                <select disabled={!editando} value={dados.perfil} onChange={e => setDados({...dados, perfil: e.target.value})} style={cssInput(!editando)}>
                  <option value="operador">👤 OPERADOR (App de Pedidos)</option>
                  <option value="admin">🛡️ ADMINISTRADOR (Acesso Total)</option>
                  <option value="faturista">🧾 AUX. FISCAL (Apenas leitura e edição de NFs)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {editando ? (
                <button onClick={salvar} style={{ height: design.botoes.altura, backgroundColor: design.botoes.primario, color: design.botoes.texto, borderRadius: design.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>SALVAR ALTERAÇÕES</button>
              ) : (
                <>
                  <button onClick={() => setEditando(true)} style={{ height: design.botoes.altura, backgroundColor: design.botoes.secundario, color: design.botoes.texto, borderRadius: design.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>HABILITAR EDIÇÃO</button>
                  {!usuarioAberto.novo && (
                    <button onClick={alternarStatus} style={{ height: '48px', background: 'none', border: `2px solid ${dados.status !== false ? '#ef4444' : '#22c55e'}`, color: dados.status !== false ? '#ef4444' : '#22c55e', borderRadius: design.botoes.raio, fontWeight: '900', cursor: 'pointer' }}>
                      {dados.status !== false ? 'BLOQUEAR ACESSO' : 'REATIVAR ACESSO'}
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