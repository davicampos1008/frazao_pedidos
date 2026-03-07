import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO (Otimizado)
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
      let inteiro = partes[0] || '0', decimal = partes[1] || '00';
      if (decimal.length === 1) decimal += '0';
      precoFinal = `R$ ${inteiro},${decimal.substring(0, 2)}`;
    }

    let statusCalculado = acaoForcada || (precoFinal === 'R$ 0,00' ? 'pendente' : 'ativo');

    const payload = {
      preco: (acaoForcada === 'sem_preco' || acaoForcada === 'falta') ? 'R$ 0,00' : precoFinal,
      peso_caixa: pPesoCaixa,
      status_cotacao: statusCalculado
    };

    if (statusCalculado === 'ativo' || statusCalculado === 'mantido') {
      payload.preco_anterior = payload.preco;
    }

    aoSalvar(produto.id, payload);
    const { error } = await supabase.from('produtos').update(payload).eq('id', produto.id);
    setStatusAviso(error ? '❌' : '✅');
    if (!error) setTimeout(() => setStatusAviso(''), 2000);
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `5px solid ${corBorda}` }}>
      <div onClick={() => abrirModal(produto)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '80%' }}>
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${produto.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <div style={{ overflow: 'hidden' }}>
            <strong style={{ display: 'block', fontSize: '14px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto.nome}</strong>
            <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
              <span style={{fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.unidade_medida || 'UN'}</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input type="text" value={preco} onChange={e => setPreco(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} placeholder="0,00" style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: '900', fontSize: '14px', backgroundColor: '#f8fafc' }} />
        </div>
        {produto.unidade_medida === 'KG' && (
          <div style={{ position: 'relative', width: '100px' }}>
            <input type="text" value={pesoCaixa} onChange={e => setPesoCaixa(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} placeholder="Peso" style={{ width: '100%', padding: '10px 30px 10px 10px', borderRadius: '8px', border: '1px solid #eab308', fontWeight: 'bold', backgroundColor: '#fefce8' }} />
            <span style={{ position: 'absolute', right: '10px', top: '10px', color: '#ca8a04', fontWeight: 'bold', fontSize: '11px' }}>Kg</span>
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
  
  // Estados Globais de Configuração
  const [configGlobal, setConfigGlobal] = useState({ is_feriado: false, nao_funciona: false, data_teste: '' });
  
  const [modalAberto, setModalAberto] = useState(false);
  const [prodModal, setProdModal] = useState(null);
  const [formModal, setFormModal] = useState({ preco: '', status: 'pendente', promocao: false, novidade: false, fotos_novas: [], unidade: 'UN', peso_caixa: '' });

  useEffect(() => { 
    carregarDados(); 
    carregarConfiguracoes();
  }, []);

  async function carregarConfiguracoes() {
    const { data } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (data) setConfigGlobal({ is_feriado: data.is_feriado, nao_funciona: data.nao_funciona, data_teste: data.data_teste || '' });
  }

  async function carregarDados(silencioso = false) {
    if (!silencioso) setCarregando(true);
    const { data: prodData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (prodData) setProdutos(prodData);
    if (!silencioso) setCarregando(false);
  }

  const atualizarConfig = async (campo, valor) => {
    const novoEstado = { ...configGlobal, [campo]: valor };
    setConfigGlobal(novoEstado);
    await supabase.from('configuracoes').update({ [campo]: valor }).eq('id', 1);
  };

 // ... (Dentro do componente Precificacao)

  const zerarCotacao = async () => {
    if (!window.confirm("⚠️ ATENÇÃO: Deseja ZERAR a cotação e LIMPAR os pedidos? (As fotos serão mantidas)")) return;
    
    setCarregando(true);
    const dataAlvo = configGlobal.data_teste || new Date().toLocaleDateString('en-CA');

    // 1. Fecha a loja
    await supabase.from('configuracoes').update({ precos_liberados: false }).eq('id', 1);

    // 2. Apaga APENAS os pedidos da data que você está mexendo (Preserva histórico)
    await supabase.from('pedidos').delete().eq('data_pedido', dataAlvo);

    // 3. Reseta Preços (Mantendo fotos)
    const resetPayload = produtos.map(p => ({
      id: p.id,
      preco: 'R$ 0,00',
      status_cotacao: 'pendente',
      promocao: false,
      novidade: false
      // Repare que não enviamos foto_url aqui, logo o Supabase mantém a que existe
    }));

    for (let i = 0; i < resetPayload.length; i += 50) {
      await supabase.from('produtos').upsert(resetPayload.slice(i, i + 50));
    }

    setCarregando(false);
    alert("✅ Cotação limpa para o dia " + dataAlvo);
    carregarDados();
  };

  const finalizarCotacao = async () => {
    setCarregando(true);
    // Libera os preços no banco
    const { error } = await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
    
    if (!error) {
      alert("🚀 LOJA ABERTA COM SUCESSO!");
      setCarregando(false);
    } else {
      alert("Erro ao abrir loja: " + error.message);
      setCarregando(false);
    }
  };

  // ... (Resto do HTML com os botões de controle que fizemos antes)

  const finalizarCotacao = async () => {
    setCarregando(true);
    await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
    setCarregando(false);
    alert("🚀 LOJA ABERTA!");
  };

  const handleAtualizarLista = (id, payload) => setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));

  const listas = {
    pendentes: produtos.filter(p => !p.status_cotacao || p.status_cotacao === 'pendente'),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo' && p.preco !== 'R$ 0,00'),
    mantidos: produtos.filter(p => p.status_cotacao === 'mantido'),
    sem_preco: produtos.filter(p => p.status_cotacao === 'sem_preco'),
    falta: produtos.filter(p => p.status_cotacao === 'falta')
  };

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px' }}>
      
      {/* 🛠️ PAINEL DE CONTROLE GLOBAL */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '24px', marginBottom: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: '900', color: '#64748b' }}>⚙️ PAINEL DE CONTROLE V.I.R.T.U.S</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
            <button 
                onClick={() => atualizarConfig('is_feriado', !configGlobal.is_feriado)}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: configGlobal.is_feriado ? '#fef3c7' : '#f1f5f9', color: configGlobal.is_feriado ? '#92400e' : '#64748b' }}
            >
                {configGlobal.is_feriado ? '🚩 FERIADO: ATIVO' : '🏳️ FERIADO: NÃO'}
            </button>
            <button 
                onClick={() => atualizarConfig('nao_funciona', !configGlobal.nao_funciona)}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: configGlobal.nao_funciona ? '#fee2e2' : '#f1f5f9', color: configGlobal.nao_funciona ? '#991b1b' : '#64748b' }}
            >
                {configGlobal.nao_funciona ? '🚫 LOJA: FECHADA' : '✅ LOJA: OPERANDO'}
            </button>
        </div>

        {/* MODO TESTE */}
        <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: '900', color: '#94a3b8', display: 'block' }}>🧪 MODO TESTE (SIMULAR DATA)</label>
                <input 
                    type="date" 
                    value={configGlobal.data_teste} 
                    onChange={(e) => atualizarConfig('data_teste', e.target.value)}
                    style={{ width: '100%', border: '1px solid #cbd5e1', padding: '8px', borderRadius: '8px', marginTop: '5px' }}
                />
            </div>
            {configGlobal.data_teste && (
                <button onClick={() => atualizarConfig('data_teste', '')} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>SAIR TESTE</button>
            )}
        </div>
      </div>

      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>💲 PRECIFICAÇÃO</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Itens pendentes: <strong>{listas.pendentes.length}</strong></p>
          </div>
          <button onClick={zerarCotacao} style={{ background: '#333', color: '#ef4444', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
             🗑️ ZERAR COTAÇÃO
          </button>
        </div>
        <button onClick={finalizarCotacao} style={{ width: '100%', backgroundColor: '#22c55e', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: '900', fontSize: '15px', cursor: 'pointer' }}>
          🚀 FINALIZAR COTAÇÃO E ABRIR LOJA
        </button>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {Object.keys(listas).map(chave => (
          <button 
            key={chave}
            onClick={() => setAbaAtiva(chave)}
            style={{ 
              flexShrink: 0, padding: '12px 15px', borderRadius: '12px', border: 'none', fontWeight: '900', fontSize: '11px',
              backgroundColor: abaAtiva === chave ? '#3b82f6' : '#fff',
              color: abaAtiva === chave ? '#fff' : '#64748b'
            }}
          >
            {chave.toUpperCase()} ({listas[chave].length})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {listas[abaAtiva].filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())).map(p => (
           <LinhaProduto key={p.id} produto={p} corBorda="#3b82f6" abrirModal={() => {}} aoSalvar={handleAtualizarLista} />
        ))}
      </div>
    </div>
  );
}