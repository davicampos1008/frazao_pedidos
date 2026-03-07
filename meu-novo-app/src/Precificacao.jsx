import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO (V.I.R.T.U.S)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${produto.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <strong style={{ fontSize: '14px', color: '#111' }}>{produto.nome}</strong>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input type="text" value={preco} onChange={e => setPreco(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} placeholder="0,00" style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: '900', fontSize: '14px' }} />
        </div>
        {(produto.unidade_medida === 'KG' || produto.unidade_medida === 'CX') && (
          <div style={{ position: 'relative', width: '90px' }}>
            <input type="text" value={pesoCaixa} onChange={e => setPesoCaixa(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} placeholder="Kg" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #eab308', fontWeight: 'bold' }} />
          </div>
        )}
      </div>
    </div>
  );
});

export default function Precificacao() {
  const [produtos, setProdutos] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('pendentes');
  const [carregando, setCarregando] = useState(true);
  const [configGlobal, setConfigGlobal] = useState({ is_feriado: false, nao_funciona: false, data_teste: '' });
  
  // Estado para saber se o teste está "rodando" (data salva no banco)
  const [testeAtivo, setTesteAtivo] = useState(false);

  useEffect(() => { 
    carregarDados(); 
    carregarConfig();
  }, []);

  const carregarConfig = async () => {
    const { data } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (data) {
      setConfigGlobal({ 
        is_feriado: data.is_feriado, 
        nao_funciona: data.nao_funciona, 
        data_teste: data.data_teste || '' 
      });
      // Se existe uma data_teste preenchida no banco, o botão deve estar em modo "Finalizar"
      setTesteAtivo(!!data.data_teste);
    }
  };

  const carregarDados = async () => {
    setCarregando(true);
    const { data } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (data) setProdutos(data);
    setCarregando(false);
  };

  const gerenciarTeste = async () => {
    setCarregando(true);
    
    if (!testeAtivo) {
      // MODO: APLICAR TESTE
      if (!configGlobal.data_teste) {
        alert("Escolha uma data para o teste.");
        setCarregando(false);
        return;
      }
      const { error } = await supabase.from('configuracoes').update({
        data_teste: configGlobal.data_teste,
        is_feriado: configGlobal.is_feriado,
        nao_funciona: configGlobal.nao_funciona
      }).eq('id', 1);
      
      if (!error) {
        setTesteAtivo(true);
        alert(`🛠️ MODO TESTE ATIVADO: A loja agora opera como se fosse dia ${configGlobal.data_teste}`);
      }
    } else {
      // MODO: FINALIZAR TESTE
      const { error } = await supabase.from('configuracoes').update({
        data_teste: null, // Limpa a data de teste no banco
        is_feriado: false,
        nao_funciona: false
      }).eq('id', 1);
      
      if (!error) {
        setTesteAtivo(false);
        setConfigGlobal(prev => ({ ...prev, data_teste: '', is_feriado: false, nao_funciona: false }));
        alert("✅ TESTE FINALIZADO: A loja voltou ao horário e data real.");
      }
    }
    setCarregando(false);
  };

  const zerarCotacao = async () => {
    if (!window.confirm("🚨 ZERAR COTAÇÃO?\nIsso apagará PREÇOS e LISTAS DE PEDIDOS da data selecionada. Fotos mantidas.")) return;
    setCarregando(true);
    const dataAlvo = configGlobal.data_teste || new Date().toLocaleDateString('en-CA');
    await supabase.from('configuracoes').update({ precos_liberados: false }).eq('id', 1);
    await supabase.from('pedidos').delete().eq('data_pedido', dataAlvo);
    const lote = produtos.map(p => ({ id: p.id, preco: 'R$ 0,00', status_cotacao: 'pendente', promocao: false, novidade: false }));
    for (let i = 0; i < lote.length; i += 50) await supabase.from('produtos').upsert(lote.slice(i, i + 50));
    setCarregando(false);
    alert("✅ Cotação Zerada.");
    carregarDados();
  };

  const finalizarCotacao = async () => {
    await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
    alert("🚀 LOJA ABERTA!");
  };

  const listas = {
    pendentes: produtos.filter(p => p.status_cotacao === 'pendente'),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo'),
    outros: produtos.filter(p => !['pendente', 'ativo'].includes(p.status_cotacao))
  };

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px' }}>
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '24px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#64748b' }}>⚙️ PAINEL DE CONTROLE</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
          <button onClick={() => setConfigGlobal({...configGlobal, is_feriado: !configGlobal.is_feriado})} style={{ padding: '12px', borderRadius: '12px', border: 'none', fontWeight: 'bold', background: configGlobal.is_feriado ? '#fef3c7' : '#f1f5f9' }}>{configGlobal.is_feriado ? '🚩 FERIADO' : '🏳️ NORMAL'}</button>
          <button onClick={() => setConfigGlobal({...configGlobal, nao_funciona: !configGlobal.nao_funciona})} style={{ padding: '12px', borderRadius: '12px', border: 'none', fontWeight: 'bold', background: configGlobal.nao_funciona ? '#fee2e2' : '#f1f5f9' }}>{configGlobal.nao_funciona ? '🚫 FECHADA' : '✅ ABERTA'}</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input 
            type="date" 
            disabled={testeAtivo} // Trava o input enquanto o teste roda
            value={configGlobal.data_teste} 
            onChange={(e) => setConfigGlobal({...configGlobal, data_teste: e.target.value})} 
            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', opacity: testeAtivo ? 0.6 : 1 }} 
          />
          <button 
            onClick={gerenciarTeste} 
            disabled={carregando}
            style={{ 
              padding: '10px 20px', 
              background: testeAtivo ? '#ef4444' : '#3b82f6', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '10px', 
              fontWeight: 'bold',
              minWidth: '150px'
            }}
          >
            {carregando ? '...' : (testeAtivo ? '⏹️ FINALIZAR TESTE' : '🧪 APLICAR TESTE')}
          </button>
        </div>
        {testeAtivo && (
          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 'bold', textAlign: 'center' }}>
            ⚠️ O sistema está simulando o dia {configGlobal.data_teste}
          </p>
        )}
      </div>

      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>💲 PRECIFICAÇÃO</h2>
          <button onClick={zerarCotacao} style={{ background: '#333', color: '#ef4444', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 'bold' }}>🗑️ ZERAR</button>
        </div>
        <button onClick={finalizarCotacao} style={{ width: '100%', backgroundColor: '#22c55e', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: '900' }}>🚀 ABRIR LOJA</button>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
        {Object.keys(listas).map(k => (
          <button key={k} onClick={() => setAbaAtiva(k)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', fontWeight: 'bold', backgroundColor: abaAtiva === k ? '#3b82f6' : '#fff', color: abaAtiva === k ? '#fff' : '#64748b' }}>{k.toUpperCase()} ({listas[k].length})</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {listas[abaAtiva].map(p => (
           <LinhaProduto key={p.id} produto={p} corBorda="#3b82f6" abrirModal={() => {}} aoSalvar={(id, pay) => setProdutos(prev => prev.map(item => item.id === id ? {...item, ...pay} : item))} />
        ))}
      </div>
    </div>
  );
}