import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Lojas({ setTelaAtiva, setFuncionarioSelecionado }) {
  // 🎛️ PAINEL DE CONTROLE V.I.R.T.U.S - GESTÃO DE LOJAS
  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif",
      raioBordaGlobal: '20px',
      sombraSuave: '0 8px 30px rgba(0,0,0,0.04)',
      corTextoPrincipal: '#111111',
      corTextoSecundario: '#64748b'
    },
    cards: {
      fundo: '#ffffff',
      fundoBadge: '#111111', 
      corBadge: '#ffffff',   
      raioBadge: '14px',
      tamanhoBadge: '55px'
    },
    modal: {
      fundoEscuro: 'rgba(0,0,0,0.85)',
      fundoModal: '#ffffff',
      raioBorda: '32px',
      paddingInterno: '40px',
      corTitulo: '#f97316'
    },
    inputs: {
      fundoLivre: '#fcfcfc',
      fundoBloqueado: '#f1f5f9',
      borda: '1.5px solid #e2e8f0',
      raio: '12px',
      padding: '14px',
      corTitulos: '#f97316',
      tamanhoTitulos: '10px'
    },
    botoes: {
      salvar: '#f97316',
      editar: '#111111',
      textoCor: '#ffffff',
      altura: '54px',
      raio: '16px'
    }
  };

  const [lojas, setLojas] = useState([]);
  const [busca, setBusca] = useState('');
  const [lojaAberta, setLojaAberta] = useState(null); 
  const [editando, setEditando] = useState(false); 
  const [dadosLoja, setDadosLoja] = useState({
    nome_fantasia: '', razao_social: '', cnpj: '', responsavel: '', telefone: '', endereco: '', placa_caminhao: '', status: true
  });

  // --- MÁSCARAS ---
  const aplicarMascaraCNPJ = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);
  const aplicarMascaraTelefone = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15);
  const aplicarMascaraPlaca = (v) => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7);

  async function buscarLojas() {
    const { data, error } = await supabase.from('lojas').select('*').order('codigo_loja', { ascending: true });
    if (!error) setLojas(data || []);
  }

  useEffect(() => { buscarLojas(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      const campos = Array.from(document.querySelectorAll('.modal-virtus input:not([disabled]):not([readonly]), .modal-virtus button:not([disabled])'));
      const indexAtual = campos.indexOf(e.target);
      if (indexAtual > -1 && indexAtual < campos.length - 1) {
        campos[indexAtual + 1].focus();
      }
    }
  };

  const lojasFiltradas = lojas.filter(l => 
    l.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) || l.cnpj?.includes(busca)
  );

  // --- CONTROLE DE FLUXO ---
  const abrirNovaLoja = () => {
    setDadosLoja({ nome_fantasia: '', razao_social: '', cnpj: '', responsavel: '', telefone: '', endereco: '', placa_caminhao: '', status: true });
    setLojaAberta({ novo: true }); 
    setEditando(true);
  };

  const visualizarLoja = (loja) => {
    setLojaAberta(loja);
    // 💡 Tira os números do começo caso tenham sido salvos nas versões anteriores do app
    const nomeLimpo = loja.nome_fantasia ? loja.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim() : '';
    setDadosLoja({ ...loja, nome_fantasia: nomeLimpo, placa_caminhao: loja.placa_caminhao || '' });
    setEditando(false);
  };

  const fecharModal = () => {
    setLojaAberta(null);
    setEditando(false);
  };

  // --- AÇÕES DO BANCO DE DADOS ---
  async function salvarLoja() {
    if (!dadosLoja.nome_fantasia.trim()) return alert("⚠️ Preencha o Nome Fantasia.");
    if (!dadosLoja.cnpj.trim()) return alert("⚠️ Preencha o CNPJ.");

    let codigoFinal = dadosLoja.codigo_loja;

    if (lojaAberta.novo) {
      const maxCodigo = lojas.length > 0 ? Math.max(...lojas.map(l => parseInt(l.codigo_loja) || 0)) : 0;
      codigoFinal = maxCodigo + 1;
    }

    // O Nome Fantasia vai limpo, sem código na frente
    const nomeFinal = dadosLoja.nome_fantasia.trim().toUpperCase();

    const dadosParaSalvar = { 
      ...dadosLoja, 
      codigo_loja: codigoFinal,
      nome_fantasia: nomeFinal
    };
    
    delete dadosParaSalvar.novo; 

    const { error } = await supabase.from('lojas').upsert([dadosParaSalvar]);
    
    if (error) {
      alert("Erro ao salvar a loja: " + error.message);
    } else {
      alert(`✅ Loja salva com sucesso!`);
      buscarLojas();
      fecharModal();
    }
  }

  async function alternarStatus() {
    const novoStatus = !dadosLoja.status;
    const msg = novoStatus ? "ATIVAR esta unidade?" : "DESATIVAR esta unidade?";
    
    if (window.confirm(msg)) {
      const { error } = await supabase.from('lojas').update({ status: novoStatus }).eq('codigo_loja', dadosLoja.codigo_loja);
      if (!error) {
        setDadosLoja({ ...dadosLoja, status: novoStatus });
        buscarLojas();
      }
    }
  }

  // 💡 NOVO: Função para Apagar Loja (Exclusão Completa)
  async function excluirLoja() {
    const nome = dadosLoja.nome_fantasia;
    if (window.confirm(`🚨 ALERTA CRÍTICO: Excluir Loja\n\nVocê tem certeza absoluta que deseja EXCLUIR a loja ${nome}?\nIsso apagará o cadastro do banco de dados e as contas vinculadas a ela não poderão mais logar.`)) {
      if (window.confirm(`Confirme novamente: Você vai apagar a loja ${nome}. Deseja prosseguir?`)) {
        
        const { error } = await supabase.from('lojas').delete().eq('codigo_loja', dadosLoja.codigo_loja);
        
        if (error) {
          alert("Erro ao excluir: " + error.message);
        } else {
          alert(`✅ A loja ${nome} foi removida do sistema.`);
          buscarLojas();
          fecharModal();
        }
      }
    }
  }

  // --- ATALHOS CSS ---
  const cssLabel = { fontSize: configDesign.inputs.tamanhoTitulos, fontWeight: '900', color: configDesign.inputs.corTitulos, display: 'block', marginBottom: '6px' };
  const cssInput = (bloqueado) => ({ width: '100%', padding: configDesign.inputs.padding, borderRadius: configDesign.inputs.raio, border: configDesign.inputs.borda, backgroundColor: bloqueado ? configDesign.inputs.fundoBloqueado : configDesign.inputs.fundoLivre, outline: 'none', boxSizing: 'border-box' });
  const cssGrupo = { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: '#fdfdfd', borderRadius: '20px', border: '1px solid #f1f5f9' };

  return (
    <div style={{ width: '95%', maxWidth: '1000px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '50px' }}>
      
      {/* BUSCA E NOVO */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <input 
          placeholder="Pesquisar unidade por nome ou CNPJ..." 
          value={busca} 
          onChange={(e) => setBusca(e.target.value)} 
          style={{ flex: 1, padding: '18px', borderRadius: configDesign.geral.raioBordaGlobal, border: 'none', boxShadow: configDesign.geral.sombraSuave, outline: 'none' }}
        />
        <button onClick={abrirNovaLoja} style={{ backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, border: 'none', padding: '0 30px', borderRadius: configDesign.geral.raioBordaGlobal, fontWeight: '900', cursor: 'pointer' }}>
          + NOVA LOJA
        </button>
      </div>

      {/* LISTA DE LOJAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {lojasFiltradas.map((loja) => {
          const badgeVisual = String(loja.codigo_loja).padStart(2, '0');
          // Limpa a exibição pra tirar os números das lojas velhas
          const nomeLimpoVisual = loja.nome_fantasia ? loja.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim() : '';

          return (
            <div key={loja.id || loja.codigo_loja} onClick={() => visualizarLoja(loja)} style={{ backgroundColor: configDesign.cards.fundo, padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, boxShadow: configDesign.geral.sombraSuave, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', transition: '0.2s', opacity: loja.status ? 1 : 0.5 }}>
              <div style={{ width: configDesign.cards.tamanhoBadge, height: configDesign.cards.tamanhoBadge, backgroundColor: configDesign.cards.fundoBadge, borderRadius: configDesign.cards.raioBadge, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: configDesign.cards.corBadge, fontSize: '20px' }}>
                {badgeVisual}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '14px', color: configDesign.geral.corTextoPrincipal }}>{nomeLimpoVisual}</strong>
                <small style={{ color: configDesign.geral.corTextoSecundario, fontSize: '11px', display: 'block', marginTop: '2px' }}>🚚 Placa: {loja.placa_caminhao || 'Não informada'}</small>
              </div>
              <span style={{fontSize: '20px'}}>{loja.status ? '🟢' : '🔴'}</span>
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {lojaAberta && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: configDesign.modal.fundoEscuro, zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="modal-virtus" style={{ backgroundColor: configDesign.modal.fundoModal, width: '90%', maxWidth: '600px', padding: configDesign.modal.paddingInterno, borderRadius: configDesign.modal.raioBorda, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button onClick={fecharModal} style={{ position: 'absolute', top: '25px', right: '25px', border: 'none', background: '#f5f5f5', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            
            <h2 style={{ color: configDesign.modal.corTitulo, fontWeight: '900', marginBottom: '5px' }}>
              {lojaAberta.novo ? 'NOVO CADASTRO DE UNIDADE' : `UNIDADE ${String(dadosLoja.codigo_loja).padStart(2, '0')}`}
            </h2>
            <p style={{marginBottom: '20px', fontSize: '11px', color: '#999'}}>
                STATUS: <b style={{color: dadosLoja.status ? '#22c55e' : '#ef4444'}}>{dadosLoja.status ? 'ATIVA' : 'INATIVA'}</b>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* GRUPO 1: IDENTIFICAÇÃO */}
              <div style={cssGrupo}>
                <div>
                  <label style={cssLabel}>NOME FANTASIA *</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.nome_fantasia} onChange={e => setDadosLoja({...dadosLoja, nome_fantasia: e.target.value.toUpperCase()})} style={cssInput(!editando)} placeholder="Ex: FLAMINGO" />
                </div>
                <div>
                  <label style={cssLabel}>RAZÃO SOCIAL</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.razao_social} onChange={e => setDadosLoja({...dadosLoja, razao_social: e.target.value.toUpperCase()})} style={cssInput(!editando)} />
                </div>
              </div>

              {/* GRUPO 2: DOCUMENTO E CONTATO */}
              <div style={cssGrupo}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>CNPJ *</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.cnpj} onChange={e => setDadosLoja({...dadosLoja, cnpj: aplicarMascaraCNPJ(e.target.value)})} style={cssInput(!editando)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <label style={cssLabel}>TELEFONE *</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.telefone} onChange={e => setDadosLoja({...dadosLoja, telefone: aplicarMascaraTelefone(e.target.value)})} style={cssInput(!editando)} placeholder="(00) 00000-0000" />
                  </div>
                </div>
              </div>

              {/* GRUPO 3: LOGÍSTICA E LOCALIZAÇÃO */}
              <div style={cssGrupo}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={cssLabel}>NOME DO RESPONSÁVEL</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.responsavel} onChange={e => setDadosLoja({...dadosLoja, responsavel: e.target.value})} style={cssInput(!editando)} />
                  </div>
                  <div>
                    <label style={cssLabel}>PLACA DO CAMINHÃO</label>
                    <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.placa_caminhao} onChange={e => setDadosLoja({...dadosLoja, placa_caminhao: aplicarMascaraPlaca(e.target.value)})} style={cssInput(!editando)} placeholder="ABC1D23" />
                  </div>
                </div>
                <div>
                  <label style={cssLabel}>ENDEREÇO COMPLETO</label>
                  <input onKeyDown={handleKeyDown} disabled={!editando} value={dadosLoja.endereco} onChange={e => setDadosLoja({...dadosLoja, endereco: e.target.value})} style={cssInput(!editando)} />
                </div>
              </div>

            </div>

            {/* 💡 MENU AGRUPADO DE EDIÇÃO (AÇÕES TOTAIS) */}
            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!editando ? (
                <>
                  <button onClick={() => setEditando(true)} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.editar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>
                    EDITAR DADOS DA LOJA
                  </button>
                  
                  {/* Se for apenas edição, mostra as opções perigosas agrupadas */}
                  {!lojaAberta.novo && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={alternarStatus} style={{ flex: 1, height: '48px', background: 'none', border: `2px solid ${dadosLoja.status ? '#f59e0b' : '#22c55e'}`, color: dadosLoja.status ? '#d97706' : '#16a34a', borderRadius: configDesign.botoes.raio, fontWeight: '900', cursor: 'pointer', fontSize: '11px' }}>
                        {dadosLoja.status ? '⏸️ PAUSAR (DESATIVAR)' : '▶️ ATIVAR UNIDADE'}
                      </button>
                      <button onClick={excluirLoja} style={{ flex: 1, height: '48px', background: '#fef2f2', border: `1px solid #fecaca`, color: '#ef4444', borderRadius: configDesign.botoes.raio, fontWeight: '900', cursor: 'pointer', fontSize: '11px' }}>
                        🗑️ EXCLUIR DEFINITIVO
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button onKeyDown={handleKeyDown} onClick={salvarLoja} style={{ height: configDesign.botoes.altura, backgroundColor: configDesign.botoes.salvar, color: configDesign.botoes.textoCor, borderRadius: configDesign.botoes.raio, border: 'none', fontWeight: '900', cursor: 'pointer' }}>
                  ✅ CONFIRMAR E SALVAR
                </button>
              )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}