/*
  ConfigCaixas
  - Tela para gerenciar quantas unidades de cada produto cabem em 1 caixa.
  - Isso servirá como base para o cálculo volumétrico das rotas dos motoristas.
*/
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient'; // Ajuste o caminho se necessário

export default function ConfigCaixas() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  
  // Controle de abas: 'todos', 'pendentes', 'prontos'
  const [abaAtiva, setAbaAtiva] = useState('pendentes');
  
  // Texto da barra de pesquisa
  const [busca, setBusca] = useState('');
  
  // Estado para armazenar valores que estão sendo digitados antes de salvar (para os agrupados)
  const [valoresEditando, setValoresEditando] = useState({});
  
  // Sistema de notificações temporárias
  const [notificacoes, setNotificacoes] = useState([]);

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random(); // Evita erro de IDs duplicados
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => {
      setNotificacoes(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Função para carregar produtos do banco
  const carregarProdutos = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true });

      if (error) throw error;
      setProdutos(data || []);
      
      if (!silencioso) mostrarNotificacao('✅ Produtos sincronizados com sucesso!', 'sucesso');
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      mostrarNotificacao('❌ Erro ao buscar produtos.', 'alerta');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const limparTexto = (str) => {
    if (!str) return '';
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") 
      .replace(/\s+/g, '') 
      .toLowerCase();
  };

  // 💡 FUNÇÃO CORRIGIDA: Salva e muda de aba instantaneamente, sem recarregar a tela
  const salvarConfiguracao = async (idProduto, valor, nomeProduto) => {
    // 1. Altera a tela instantaneamente (o item sai de pendente e vai pra pronto na hora)
    setProdutos(prev => prev.map(p => 
      p.id === idProduto ? { ...p, unidades_por_caixa: valor } : p
    ));

    mostrarNotificacao(`📦 ${nomeProduto} salvo!`, 'sucesso');

    // 2. Envia para o banco de dados por trás de forma invisível
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ unidades_por_caixa: valor })
        .eq('id', idProduto);

      if (error) throw error;
    } catch (error) {
      console.error("Erro ao salvar no banco:", error);
      mostrarNotificacao(`❌ Erro de conexão ao salvar ${nomeProduto}.`, 'alerta');
    }
  };

  const produtosFiltrados = produtos.filter(p => {
    const taPronto = p.unidades_por_caixa !== null;
    if (abaAtiva === 'pendentes' && taPronto) return false;
    if (abaAtiva === 'prontos' && !taPronto) return false;

    if (busca) {
      const termoBusca = limparTexto(busca);
      const nomeProduto = limparTexto(p.nome);
      if (!nomeProduto.includes(termoBusca)) return false;
    }

    return true;
  });

  const produtosPorCategoria = produtosFiltrados.reduce((acc, p) => {
    const cat = p.categoria || 'Sem Categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px', paddingBottom: '100px' }}>
      
      {/* Notificações Flutuantes */}
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
        {notificacoes.map(notif => (
          <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? '#ef4444' : '#22c55e', color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>
            {notif.mensagem}
          </div>
        ))}
      </div>

      {/* Cabeçalho */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>📦 SETUP DE CAIXARIA</h2>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>Defina a volumetria para organizar o caminhão.</p>
        </div>
        <button 
          onClick={() => carregarProdutos(false)} 
          style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}
        >
          🔄 SINCRONIZAR NOVOS
        </button>
      </div>

      {/* Barra de Pesquisa */}
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '2px solid #e2e8f0' }}>
        <span style={{ fontSize: '18px' }}>🔍</span>
        <input 
          placeholder="Pesquisar produto (ignoramos acentos e espaços)..." 
          value={busca} 
          onChange={e => setBusca(e.target.value)} 
          style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '15px', fontWeight: 'bold', color: '#334155' }} 
        />
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button 
          onClick={() => setAbaAtiva('todos')} 
          style={{ flex: 1, minWidth: '100px', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'todos' ? '#8b5cf6' : '#fff', color: abaAtiva === 'todos' ? '#fff' : '#64748b' }}
        >
          📋 TODOS ({produtos.length})
        </button>
        <button 
          onClick={() => setAbaAtiva('pendentes')} 
          style={{ flex: 1, minWidth: '100px', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pendentes' ? '#f97316' : '#fff', color: abaAtiva === 'pendentes' ? '#fff' : '#64748b' }}
        >
          ⚠️ PENDENTES ({produtos.filter(p => p.unidades_por_caixa === null).length})
        </button>
        <button 
          onClick={() => setAbaAtiva('prontos')} 
          style={{ flex: 1, minWidth: '100px', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'prontos' ? '#10b981' : '#fff', color: abaAtiva === 'prontos' ? '#fff' : '#64748b' }}
        >
          ✅ PRONTOS ({produtos.filter(p => p.unidades_por_caixa !== null).length})
        </button>
      </div>

      {/* Lista de Produtos */}
      {carregando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontWeight: 'bold' }}>Carregando banco de dados...</div>
      ) : Object.keys(produtosPorCategoria).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#fff', borderRadius: '16px', color: '#64748b', fontWeight: 'bold' }}>
          Nenhum produto encontrado nesta aba ou pesquisa.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(produtosPorCategoria).map(([categoria, lista]) => (
            <div key={categoria} style={{ backgroundColor: '#f8fafc', borderRadius: '16px', padding: '15px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#334155', fontSize: '14px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🏷️ {categoria} <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '8px', fontSize: '10px' }}>{lista.length}</span>
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                {lista.map(produto => {
                  const taPronto = produto.unidades_por_caixa !== null;
                  
                  return (
                    <div key={produto.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '15px', borderLeft: taPronto ? '5px solid #10b981' : '5px solid #f97316', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <strong style={{ display: 'block', color: '#111', fontSize: '14px', lineHeight: '1.2' }}>{produto.nome}</strong>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>Unidade: {produto.unidade_medida || 'UN'}</span>
                        </div>
                        {taPronto && (
                          <span style={{ fontSize: '10px', background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                            {produto.unidades_por_caixa === 0 ? '❌ Sem Caixa' : 
                             produto.unidades_por_caixa === 1 ? '📦 1 = 1 Cx' : 
                             `📦 ${produto.unidades_por_caixa} = 1 Cx`}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
                        <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}>COMO ESSE ITEM OCUPA CAIXA?</p>
                        
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button 
                            onClick={() => salvarConfiguracao(produto.id, 1, produto.nome)}
                            style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', background: produto.unidades_por_caixa === 1 ? '#111' : '#fff', color: produto.unidades_por_caixa === 1 ? '#fff' : '#334155', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            1 por Caixa<br/><span style={{fontSize:'9px', fontWeight:'normal'}}>(Ex: Tomate)</span>
                          </button>
                          
                          <button 
                            onClick={() => salvarConfiguracao(produto.id, 0, produto.nome)}
                            style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', background: produto.unidades_por_caixa === 0 ? '#ef4444' : '#fff', color: produto.unidades_por_caixa === 0 ? '#fff' : '#334155', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            Não usa Cx<br/><span style={{fontSize:'9px', fontWeight:'normal'}}>(Ex: Morango)</span>
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Agrupados:</span>
                          <input 
                            type="number" 
                            placeholder="Qtd..." 
                            value={valoresEditando[produto.id] !== undefined ? valoresEditando[produto.id] : (produto.unidades_por_caixa > 1 ? produto.unidades_por_caixa : '')}
                            onChange={(e) => setValoresEditando({...valoresEditando, [produto.id]: e.target.value})}
                            style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #ccc', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}
                          />
                          <span style={{ fontSize: '10px', color: '#64748b' }}>= 1 Cx</span>
                          
                          <button 
                            onClick={() => {
                              const valorNum = parseInt(valoresEditando[produto.id]);
                              if (!valorNum || valorNum <= 1) return alert('Digite um valor maior que 1 para agrupar (ex: 20).');
                              salvarConfiguracao(produto.id, valorNum, produto.nome);
                            }}
                            style={{ marginLeft: 'auto', background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            SALVAR
                          </button>
                        </div>
                      </div>
                      
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}