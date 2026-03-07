import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO (Otimizado e Sem Fornecedor)
// ============================================================================
const LinhaProduto = React.memo(({ produto, abrirModal, aoSalvar, corBorda }) => {
  const [preco, setPreco] = useState(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
  const [pesoCaixa, setPesoCaixa] = useState(produto.peso_caixa || '');
  const [statusAviso, setStatusAviso] = useState('');

  useEffect(() => {
    setPreco(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
    setPesoCaixa(produto.peso_caixa || '');
  }, [produto.preco, produto.peso_caixa]);

  const dispararAutoSave = async (pValor, pPesoCaixa, acaoForcada = null) => {
    setStatusAviso('⏳');
    let v = String(pValor || '').replace(/[^\d,.]/g, '').trim();
    if (v.includes('.') && !v.includes(',')) v = v.replace('.', ','); 
    v = v.replace(/[^\d,]/g, ''); 
    
    let precoFinal = 'R$ 0,00';
    if (v) {
      let partes = v.split(',');
      let inteiro = partes[0] || '0';
      let decimal = partes[1] || '';
      if (decimal.length === 0) decimal = '00';
      else if (decimal.length === 1) decimal += '0';
      else decimal = decimal.substring(0, 2);
      precoFinal = `R$ ${inteiro},${decimal}`;
    }

    let statusCalculado = acaoForcada || (precoFinal === 'R$ 0,00' ? 'pendente' : 'ativo');
    const payload = {
      preco: acaoForcada === 'sem_preco' || acaoForcada === 'falta' ? 'R$ 0,00' : precoFinal,
      peso_caixa: pPesoCaixa,
      status_cotacao: statusCalculado
    };

    if (statusCalculado === 'ativo' || statusCalculado === 'mantido') {
      payload.preco_anterior = payload.preco;
    }

    aoSalvar(produto.id, payload);
    const { error } = await supabase.from('produtos').update(payload).eq('id', produto.id);
    if (!error) {
      setStatusAviso('✅');
      setTimeout(() => setStatusAviso(''), 2000);
    } else {
      setStatusAviso('❌');
    }
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `5px solid ${corBorda}` }}>
      <div onClick={() => abrirModal(produto)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${produto.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <strong>{produto.nome}</strong>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '11px' }}>R$</span>
          <input type="text" value={preco} onChange={e => setPreco(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
        </div>
        {produto.unidade_medida === 'KG' && (
          <div style={{ position: 'relative', width: '100px' }}>
            <input type="text" value={pesoCaixa} onChange={e => setPesoCaixa(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #eab308' }} />
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// TELA PRINCIPAL: PRECIFICACAO
// ============================================================================
export default function Precificacao() {
  const [produtos, setProdutos] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('pendentes');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [panelConfigAberto, setPanelConfigAberto] = useState(false);
  
  // Estados de Configuração
  const [configGlobal, setConfigGlobal] = useState({ is_feriado: false, nao_funciona: false, data_teste: '' });

  useEffect(() => { 
    carregarDados(); 
    carregarConfig();
  }, []);

  async function carregarConfig() {
    const { data } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (data) {
      setConfigGlobal({
        is_feriado: data.is_feriado || false,
        nao_funciona: data.nao_funciona || false,
        data_teste: data.data_teste || ''
      });
    }
  }

  async function carregarDados(silencioso = false) {
    if (!silencioso) setCarregando(true);
    const { data } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (data) setProdutos(data);
    if (!silencioso) setCarregando(false);
  }

  // --- FUNÇÕES DO PAINEL DE CONFIGURAÇÃO ---
  
  const atualizarConfigBanco = async (campo, valor) => {
    const novoEstado = { ...configGlobal, [campo]: valor };
    setConfigGlobal(novoEstado); // Atualiza UI
    await supabase.from('configuracoes').update({ [campo]: valor }).eq('id', 1);
  };

  const aplicarTesteData = async () => {
    if (!configGlobal.data_teste) return alert("Escolha uma data.");
    await supabase.from('configuracoes').update({ data_teste: configGlobal.data_teste }).eq('id', 1);
    alert("🧪 Data de teste aplicada!");
  };

  const finalizarTesteData = async () => {
    await supabase.from('configuracoes').update({ data_teste: null }).eq('id', 1);
    setConfigGlobal({ ...configGlobal, data_teste: '' });
    alert("✅ Teste finalizado. Data resetada.");
  };

  const listas = {
    pendentes: produtos.filter(p => !p.status_cotacao || p.status_cotacao === 'pendente'),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo'),
    mantidos: produtos.filter(p => p.status_cotacao === 'mantido'),
    sem_preco: produtos.filter(p => p.status_cotacao === 'sem_preco'),
    falta: produtos.filter(p => p.status_cotacao === 'falta')
  };

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '10px', fontFamily: 'sans-serif' }}>
      
      {/* BOTÃO ENGRENAGEM */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button onClick={() => setPanelConfigAberto(!panelConfigAberto)} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px', borderRadius: '10px', cursor: 'pointer' }}>⚙️ CONFIG</button>
      </div>

      {/* CARD DE CONFIGURAÇÕES */}
      {panelConfigAberto && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '20px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>Painel de Controle</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
            <button 
              onClick={() => atualizarConfigBanco('nao_funciona', !configGlobal.nao_funciona)}
              style={{ padding: '12px', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: configGlobal.nao_funciona ? '#fee2e2' : '#f1f5f9', color: configGlobal.nao_funciona ? '#ef4444' : '#444' }}
            >
              {configGlobal.nao_funciona ? '🚫 LOJA FECHADA' : '✅ LOJA ABERTA'}
            </button>
            <button 
              onClick={() => atualizarConfigBanco('is_feriado', !configGlobal.is_feriado)}
              style={{ padding: '12px', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: configGlobal.is_feriado ? '#fef3c7' : '#f1f5f9', color: configGlobal.is_feriado ? '#ca8a04' : '#444' }}
            >
              {configGlobal.is_feriado ? '🚩 É FERIADO' : '🏳️ DIA NORMAL'}
            </button>
          </div>
          
          <div style={{ borderTop: '1px solid #eee', paddingTop: '15px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>SIMULAR DATA (TESTE):</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="date" 
                value={configGlobal.data_teste} 
                onChange={(e) => setConfigGlobal({ ...configGlobal, data_teste: e.target.value })} 
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} 
              />
              <button onClick={aplicarTesteData} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold' }}>APLICAR</button>
              <button onClick={finalizarTesteData} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold' }}>RESET</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>💲 PRECIFICAÇÃO</h2>
        <button onClick={async () => {
          await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
          alert("🚀 LOJA ABERTA!");
        }} style={{ width: '100%', marginTop: '15px', backgroundColor: '#22c55e', color: 'white', border: 'none', padding: '15px', borderRadius: '12px', fontWeight: 'bold' }}>ABRIR LOJA AGORA</button>
      </div>

      {/* BUSCA E LISTA */}
      <div style={{ marginBottom: '15px', background: '#fff', padding: '10px', borderRadius: '10px' }}>
        <input placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} style={{ width: '100%', border: 'none', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {listas[abaAtiva].filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())).map(p => (
           <LinhaProduto key={p.id} produto={p} corBorda="#3b82f6" aoSalvar={handleAtualizarLista} abrirModal={() => {}} />
        ))}
      </div>
    </div>
  );

  function handleAtualizarLista(id, payload) {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
  }
}