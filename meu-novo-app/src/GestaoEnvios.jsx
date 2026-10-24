import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Helper para remover acentos e padronizar textos para busca inteligente
const removerAcentos = (texto) => {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export default function GestaoEnvios() {
  const [abaGeral, setAbaGeral] = useState('conferencia'); // 'conferencia', 'guia_envio'
  const [subAbaConferencia, setSubAbaConferencia] = useState('CEASA_DOM_QUA'); 
  const [subAbaEnvio, setSubAbaEnvio] = useState('pendentes'); // 'pendentes', 'feitos'
  
  const [fornecedores, setFornecedores] = useState([]);
  const [guiasSalvas, setGuiasSalvas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  
  const [buscaConferencia, setBuscaConferencia] = useState('');
  const [buscaEnvio, setBuscaEnvio] = useState('');

  // Estados temporários de seleção para a aba de envios (multi-seleção)
  const [selecoesTemp, setSelecoesTemp] = useState({});

  // Controle local de checklist para marcar quem já foi enviado na conferência
  // Estrutura: { [`${fornecedor_id}_${opcao_envio}`]: true | false }
  const [enviadosChecklist, setEnviadosChecklist] = useState({});

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const { data: dForn } = await supabase
        .from('fornecedores')
        .select('*')
        .order('nome_fantasia', { ascending: true });
      setFornecedores(dForn || []);

      const { data: dGuias } = await supabase
        .from('guia_transmissao_fornecedores')
        .select('*');
      setGuiasSalvas(dGuias || []);

      const inicialSelecoes = {};
      (dGuias || []).forEach(g => {
        inicialSelecoes[g.fornecedor_id] = g.opcao_envio ? g.opcao_envio.split(',') : [];
      });
      setSelecoesTemp(inicialSelecoes);

    } catch (err) {
      console.error("Erro ao carregar guia de transmissão:", err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Alterna o status de "Enviado / Não Enviado" na checklist da conferência
  const toggleStatusEnviado = (fornecedorId, rota) => {
    const chave = `${fornecedorId}_${rota}`;
    setEnviadosChecklist(prev => ({
      ...prev,
      [chave]: !prev[chave]
    }));
  };

  // Lógica de multi-seleção com exclusividade para 'NAO_MANDAR'
  const handleToggleOpcao = (fornecedorId, opcaoId) => {
    setSelecoesTemp(prev => {
      const atual = prev[fornecedorId] || [];

      if (opcaoId === 'NAO_MANDAR') {
        return { ...prev, [fornecedorId]: atual.includes('NAO_MANDAR') ? [] : ['NAO_MANDAR'] };
      }

      let novasOpcoes = atual.filter(op => op !== 'NAO_MANDAR');

      if (novasOpcoes.includes(opcaoId)) {
        novasOpcoes = novasOpcoes.filter(op => op !== opcaoId);
      } else {
        novasOpcoes.push(opcaoId);
      }

      return { ...prev, [fornecedorId]: novasOpcoes };
    });
  };

  const salvarGuiaFornecedor = async (fornecedor) => {
    const opcoesEscolhidas = selecoesTemp[fornecedor.id] || [];
    if (opcoesEscolhidas.length === 0) {
      alert("⚠️ Selecione pelo menos uma opção!");
      return;
    }

    try {
      setCarregando(true);
      const payload = {
        fornecedor_id: fornecedor.id,
        nome_fornecedor: String(fornecedor.nome_fantasia || fornecedor.nome_completo || '').toUpperCase().trim(),
        opcao_envio: opcoesEscolhidas.join(','),
        status: 'feito',
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('guia_transmissao_fornecedores')
        .upsert(payload, { onConflict: 'fornecedor_id' });

      if (error) throw error;
      carregarDados();
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    } finally {
      setCarregando(false);
    }
  };

  const redefinirFornecedor = async (fornecedorId) => {
    if (!window.confirm("Deseja voltar este fornecedor para a lista de pendentes?")) return;
    try {
      setCarregando(true);
      const { error } = await supabase
        .from('guia_transmissao_fornecedores')
        .delete()
        .eq('fornecedor_id', fornecedorId);

      if (error) throw error;
      carregarDados();
    } catch (e) {
      alert("Erro ao redefinir: " + e.message);
    } finally {
      setCarregando(false);
    }
  };

  const idsFeitos = new Set(guiasSalvas.map(g => String(g.fornecedor_id)));
  const fornecedoresPendentes = fornecedores.filter(f => !idsFeitos.has(String(f.id)));
  const fornecedoresFeitos = fornecedores.filter(f => idsFeitos.has(String(f.id)));

  const filtrarListaInteligente = (lista, termoBusca, campoNome = 'nome_fantasia') => {
    if (!termoBusca || !termoBusca.trim()) return lista;
    const termoLimpo = removerAcentos(termoBusca);
    return lista.filter(item => {
      const valorCampo = item[campoNome] || item.nome_completo || item.nome_fornecedor || '';
      return removerAcentos(valorCampo).includes(termoLimpo);
    });
  };

  const OPCOES = [
    { id: 'NAO_MANDAR', label: '🚫 Não mandar', color: '#ef4444', bg: '#fef2f2' },
    { id: 'CEASA_DOM_QUA', label: '🚚 CEASA (DOM/QUA)', color: '#16a34a', bg: '#f0fdf4' },
    { id: 'CEILANDIA_SEG_QUI', label: '🚚 Ceilândia (SEG/QUI)', color: '#2563eb', bg: '#eff6ff' },
    { id: 'CEILANDIA_TER_SEX', label: '🚚 Ceilândia (TER/SEX)', color: '#ca8a04', bg: '#fefce8' }
  ];

  const qtdCeasa = guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEASA_DOM_QUA')).length;
  const qtdCeil1 = guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_SEG_QUI')).length;
  const qtdCeil2 = guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_TER_SEX')).length;

  // Componente de Renderização dos Itens de Conferência com Checklist
  const renderItemConferencia = (g, rotaKey) => {
    const chave = `${g.fornecedor_id}_${rotaKey}`;
    const jaEnviado = !!enviadosChecklist[chave];

    return (
      <div 
        key={g.id} 
        onClick={() => toggleStatusEnviado(g.fornecedor_id, rotaKey)}
        style={{ 
          padding: '8px 12px', 
          backgroundColor: jaEnviado ? '#dcfce7' : '#ffffff', 
          borderRadius: '8px', 
          border: jaEnviado ? '1px solid #86efac' : '1px solid #cbd5e1', 
          display: 'flex', 
          alignItems: 'center', 
          justify: 'space-between', 
          cursor: 'pointer',
          transition: 'all 0.15s ease-in-out'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input 
            type="checkbox" 
            checked={jaEnviado} 
            onChange={() => {}} // Lógica gerenciada pelo onClick da div pai
            style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
          />
          <span style={{ 
            fontSize: '12px', 
            fontWeight: 'bold', 
            color: jaEnviado ? '#15803d' : '#0f172a',
            textDecoration: jaEnviado ? 'line-through' : 'none'
          }}>
            📦 {g.nome_fornecedor}
          </span>
        </div>

        <span style={{ 
          fontSize: '10px', 
          fontWeight: '900', 
          color: jaEnviado ? '#15803d' : '#94a3b8', 
          backgroundColor: jaEnviado ? '#bbf7d0' : '#f1f5f9',
          padding: '2px 8px',
          borderRadius: '12px'
        }}>
          {jaEnviado ? '✓ ENVIADO' : 'PENDENTE'}
        </span>
      </div>
    );
  };

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      
      {/* CABEÇALHO COMPACTO */}
      <div style={{ backgroundColor: '#111', padding: '12px 20px', borderRadius: '14px', color: 'white', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          📋 GUIA DE TRANSMISSÃO
        </h2>

        <button 
          onClick={carregarDados}
          disabled={carregando}
          style={{ padding: '6px 14px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
        >
          {carregando ? '⏳...' : '🔄 Atualizar Listas'}
        </button>
      </div>

      {/* ABAS PRINCIPAIS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
        <button 
          onClick={() => setAbaGeral('conferencia')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: abaGeral === 'conferencia' ? '#22c55e' : '#fff', color: abaGeral === 'conferencia' ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
        >
          📊 Guia de Conferência
        </button>
        <button 
          onClick={() => setAbaGeral('guia_envio')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: abaGeral === 'guia_envio' ? '#f97316' : '#fff', color: abaGeral === 'guia_envio' ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
        >
          🚚 Guia de Envio ({fornecedoresPendentes.length} pendentes)
        </button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* ABA 1: GUIA DE CONFERÊNCIA (CHECKLIST DE ENVIADOS) */}
      {/* ---------------------------------------------------------------- */}
      {abaGeral === 'conferencia' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
          
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSubAbaConferencia('CEASA_DOM_QUA')}
              style={{ flex: 1, minWidth: '150px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: subAbaConferencia === 'CEASA_DOM_QUA' ? '#22c55e' : '#f1f5f9', color: subAbaConferencia === 'CEASA_DOM_QUA' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
            >
              🚚 CEASA (DOM/QUA) ({qtdCeasa})
            </button>
            <button
              onClick={() => setSubAbaConferencia('CEILANDIA_SEG_QUI')}
              style={{ flex: 1, minWidth: '150px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: subAbaConferencia === 'CEILANDIA_SEG_QUI' ? '#3b82f6' : '#f1f5f9', color: subAbaConferencia === 'CEILANDIA_SEG_QUI' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
            >
              🚚 Ceilândia (SEG/QUI) ({qtdCeil1})
            </button>
            <button
              onClick={() => setSubAbaConferencia('CEILANDIA_TER_SEX')}
              style={{ flex: 1, minWidth: '150px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: subAbaConferencia === 'CEILANDIA_TER_SEX' ? '#eab308' : '#f1f5f9', color: subAbaConferencia === 'CEILANDIA_TER_SEX' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
            >
              🚚 Ceilândia (TER/SEX) ({qtdCeil2})
            </button>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <input 
              type="text" 
              placeholder="🔍 Buscar fornecedor na lista selecionada..." 
              value={buscaConferencia} 
              onChange={(e) => setBuscaConferencia(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
            {subAbaConferencia === 'CEASA_DOM_QUA' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#15803d' }}>
                    🚚 CHECKLIST: CEASA (DOM / QUA)
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Clique no card para marcar/desmarcar</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEASA_DOM_QUA')), buscaConferencia, 'nome_fornecedor').length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhum fornecedor encontrado nesta lista.</span>
                  ) : (
                    filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEASA_DOM_QUA')), buscaConferencia, 'nome_fornecedor').map(g => renderItemConferencia(g, 'CEASA_DOM_QUA'))
                  )}
                </div>
              </>
            )}

            {subAbaConferencia === 'CEILANDIA_SEG_QUI' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1d4ed8' }}>
                    🚚 CHECKLIST: CEILÂNDIA (SEG / QUI)
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Clique no card para marcar/desmarcar</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_SEG_QUI')), buscaConferencia, 'nome_fornecedor').length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhum fornecedor encontrado nesta lista.</span>
                  ) : (
                    filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_SEG_QUI')), buscaConferencia, 'nome_fornecedor').map(g => renderItemConferencia(g, 'CEILANDIA_SEG_QUI'))
                  )}
                </div>
              </>
            )}

            {subAbaConferencia === 'CEILANDIA_TER_SEX' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#a16207' }}>
                    🚚 CHECKLIST: CEILÂNDIA (TER / SEX)
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Clique no card para marcar/desmarcar</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_TER_SEX')), buscaConferencia, 'nome_fornecedor').length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhum fornecedor encontrado nesta lista.</span>
                  ) : (
                    filtrarListaInteligente(guiasSalvas.filter(g => g.opcao_envio && g.opcao_envio.includes('CEILANDIA_TER_SEX')), buscaConferencia, 'nome_fornecedor').map(g => renderItemConferencia(g, 'CEILANDIA_TER_SEX'))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* ABA 2: GUIA DE ENVIO (PENDENTES / FEITOS) */}
      {/* ---------------------------------------------------------------- */}
      {abaGeral === 'guia_envio' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                onClick={() => setSubAbaEnvio('pendentes')}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: subAbaEnvio === 'pendentes' ? '#f97316' : '#f1f5f9', color: subAbaEnvio === 'pendentes' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
              >
                ⏳ Pendentes ({fornecedoresPendentes.length})
              </button>
              <button 
                onClick={() => setSubAbaEnvio('feitos')}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: subAbaEnvio === 'feitos' ? '#22c55e' : '#f1f5f9', color: subAbaEnvio === 'feitos' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
              >
                ✅ Feitos ({fornecedoresFeitos.length})
              </button>
            </div>

            <input 
              type="text" 
              placeholder="🔍 Pesquisar..." 
              value={buscaEnvio} 
              onChange={(e) => setBuscaEnvio(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', outline: 'none' }}
            />
          </div>

          {subAbaEnvio === 'pendentes' ? (
            filtrarListaInteligente(fornecedoresPendentes, buscaEnvio).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '25px', background: '#f8fafc', borderRadius: '10px', fontSize: '12px' }}>
                🎉 Nenhum fornecedor pendente!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtrarListaInteligente(fornecedoresPendentes, buscaEnvio).map(forn => {
                  const selAtuais = selecoesTemp[forn.id] || [];

                  return (
                    <div key={forn.id} style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', minWidth: '160px', flex: '1' }}>
                        {forn.nome_fantasia || forn.nome_completo}
                      </span>

                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {OPCOES.map(op => {
                          const selecionado = selAtuais.includes(op.id);
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => handleToggleOpcao(forn.id, op.id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: selecionado ? `2px solid ${op.color}` : '1px solid #cbd5e1',
                                background: selecionado ? op.bg : '#fff',
                                color: selecionado ? op.color : '#64748b',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {selecionado ? '✓ ' : ''}{op.label}
                            </button>
                          );
                        })}
                      </div>

                      <button 
                        onClick={() => salvarGuiaFornecedor(forn)}
                        disabled={selAtuais.length === 0}
                        style={{ padding: '5px 10px', backgroundColor: selAtuais.length > 0 ? '#16a34a' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: selAtuais.length > 0 ? 'pointer' : 'not-allowed', fontSize: '10px' }}
                      >
                        💾 OK
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            filtrarListaInteligente(fornecedoresFeitos, buscaEnvio).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '25px', background: '#f8fafc', borderRadius: '10px', fontSize: '12px' }}>
                Nenhum fornecedor concluído encontrado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtrarListaInteligente(fornecedoresFeitos, buscaEnvio).map(forn => {
                  const selAtuais = selecoesTemp[forn.id] || [];

                  return (
                    <div key={forn.id} style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', minWidth: '160px', flex: '1' }}>
                        {forn.nome_fantasia || forn.nome_completo}
                      </span>

                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {OPCOES.map(op => {
                          const selecionado = selAtuais.includes(op.id);
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => handleToggleOpcao(forn.id, op.id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: selecionado ? `2px solid ${op.color}` : '1px solid #cbd5e1',
                                background: selecionado ? op.bg : '#fff',
                                color: selecionado ? op.color : '#94a3b8',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {selecionado ? '✓ ' : ''}{op.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => salvarGuiaFornecedor(forn)}
                          style={{ padding: '5px 8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '10px' }}
                          title="Salvar alteração"
                        >
                          💾 Salvar
                        </button>
                        <button 
                          onClick={() => redefinirFornecedor(forn.id)}
                          style={{ padding: '5px 8px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '10px' }}
                          title="Voltar para pendentes"
                        >
                          ↩ Pendente
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

    </div>
  );
}