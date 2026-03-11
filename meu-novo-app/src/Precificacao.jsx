import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO (Edição Rápida com Filtro de Unidades)
// ============================================================================
const LinhaProduto = React.memo(({ produto, abrirModal, aoSalvar, corBorda }) => {
  const [preco, setPreco] = useState(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
  const [pesoCaixaNum, setPesoCaixaNum] = useState('');
  const [pesoCaixaUnd, setPesoCaixaUnd] = useState('Kg');
  const [tipoEmbalagem, setTipoEmbalagem] = useState('CX'); 
  const [statusAviso, setStatusAviso] = useState('');
  
  const ignorarRadar = useRef(false);

  // Lista padrão de unidades do sistema
  const UNIDADES_SISTEMA = ['UN', 'KG', 'CX', 'PCT', 'DZ', 'MAÇO', 'BDJ', 'SACO'];

  useEffect(() => {
    if (ignorarRadar.current) return;

    setPreco(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
    setTipoEmbalagem(produto.tipo_embalagem || 'CX');
    
    if (produto.peso_caixa) {
       setPesoCaixaNum(String(produto.peso_caixa).replace(/[^\d.,]/g, '').trim());
       const undEncontrada = String(produto.peso_caixa).replace(/[\d.,\s]/g, '').trim();
       setPesoCaixaUnd(undEncontrada || 'Kg');
    } else {
       setPesoCaixaNum('');
       setPesoCaixaUnd('Kg');
    }
  }, [produto.preco, produto.peso_caixa, produto.tipo_embalagem]);

  const dispararAutoSave = (pValor, pPesoNum, pPesoUnd, pTipoEmb, acaoForcada = null) => {
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
    let pesoCaixaFinal = pPesoNum ? `${pPesoNum}${pPesoUnd}` : '';

    if (!acaoForcada && 
        precoFinal === produto.preco && 
        pesoCaixaFinal === (produto.peso_caixa || '') && 
        pTipoEmb === (produto.tipo_embalagem || 'CX') && 
        statusCalculado === produto.status_cotacao) {
        return; 
    }

    setStatusAviso('⏳');
    ignorarRadar.current = true;

    const payload = {
      preco: (acaoForcada === 'sem_preco' || acaoForcada === 'falta') ? 'R$ 0,00' : precoFinal,
      peso_caixa: pesoCaixaFinal,
      tipo_embalagem: pTipoEmb,
      status_cotacao: statusCalculado
    };

    if (statusCalculado === 'ativo' || statusCalculado === 'mantido') {
        payload.preco_anterior = payload.preco;
    }

    aoSalvar(produto.id, payload);

    supabase.from('produtos').update(payload).eq('id', produto.id).then(({ error }) => {
       if (!error) {
         setStatusAviso('✅');
         setTimeout(() => setStatusAviso(''), 2000);
       } else {
         setStatusAviso('❌');
       }
       setTimeout(() => { ignorarRadar.current = false; }, 8000);
    });
  };

  const handleBlur = () => dispararAutoSave(preco, pesoCaixaNum, pesoCaixaUnd, tipoEmbalagem);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `5px solid ${corBorda}` }}>
      
      <div onClick={() => abrirModal(produto)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '80%' }}>
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${produto.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <div style={{ overflow: 'hidden' }}>
            <strong style={{ display: 'block', fontSize: '14px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto.nome}</strong>
            <span style={{fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.unidade_medida || 'UN'}</span>
          </div>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1.5 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input 
            type="text" value={preco} onChange={e => setPreco(e.target.value)} onBlur={handleBlur}
            style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: '900', fontSize: '14px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>

        {/* 💡 SÓ EXIBE SE A UNIDADE DO PESO FOR KG (Case-insensitive check) */}
        {String(pesoCaixaUnd).toUpperCase() === 'KG' && (
          <select 
            value={tipoEmbalagem} 
            onChange={e => { setTipoEmbalagem(e.target.value); dispararAutoSave(preco, pesoCaixaNum, pesoCaixaUnd, e.target.value); }}
            style={{ width: '75px', padding: '0 5px', borderRadius: '8px', border: '1px solid #3b82f6', outline: 'none', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#eff6ff', cursor: 'pointer' }}
          >
            <option value="CX">📦 CX</option>
            <option value="SACO">🛍️ SACO</option>
          </select>
        )}

        <div style={{ display: 'flex', flex: 1 }}>
          <input 
            type="text" value={pesoCaixaNum} onChange={e => setPesoCaixaNum(e.target.value)} onBlur={handleBlur} placeholder="Peso"
            style={{ width: '100%', padding: '10px', borderRadius: '8px 0 0 8px', border: '1px solid #eab308', outline: 'none', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#fefce8', textAlign: 'center' }}
          />
          <select 
            value={pesoCaixaUnd} 
            onChange={e => { setPesoCaixaUnd(e.target.value); dispararAutoSave(preco, pesoCaixaNum, e.target.value, tipoEmbalagem); }}
            style={{ width: '60px', borderRadius: '0 8px 8px 0', border: '1px solid #eab308', borderLeft: 'none', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#fefce8' }}
          >
            {UNIDADES_SISTEMA.map(u => <option key={u} value={u}>{u}</option>)}
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '5px', borderTop: '1px dashed #f1f5f9', paddingTop: '10px' }}>
        <button onClick={() => dispararAutoSave(produto.preco_anterior?.replace('R$ ', ''), pesoCaixaNum, pesoCaixaUnd, tipoEmbalagem, 'mantido')} style={{ flex: 1, padding: '8px', background: '#fefce8', color: '#eab308', border: '1px solid #fef08a', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>🔒 MANTER</button>
        <button onClick={() => dispararAutoSave('', pesoCaixaNum, pesoCaixaUnd, tipoEmbalagem, 'sem_preco')} style={{ flex: 1, padding: '8px', background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>⏸️ S/ PREÇO</button>
        <button onClick={() => dispararAutoSave('', pesoCaixaNum, pesoCaixaUnd, tipoEmbalagem, 'falta')} style={{ flex: 1, padding: '8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>🚫 FALTA</button>
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
  
  const [modalAberto, setModalAberto] = useState(false);
  const [prodModal, setProdModal] = useState(null);
  const [formModal, setFormModal] = useState({ preco: '', status: 'pendente', promocao: false, novidade: false, fotos_novas: [], unidade: 'UN', peso_caixa: '', tipo_embalagem: 'CX' });
  const [unidadePesoExtra, setUnidadePesoExtra] = useState('Kg');

  const UNIDADES_SISTEMA = ['UN', 'KG', 'CX', 'PCT', 'DZ', 'MAÇO', 'BDJ', 'SACO'];

  useEffect(() => { 
    carregarDados(); 
    const radar = setInterval(() => carregarDados(true), 15000);
    return () => clearInterval(radar);
  }, []);

  async function carregarDados(silencioso = false) {
    if (!silencioso) setCarregando(true);
    try {
      const { data: prodData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      if (prodData) setProdutos(prodData);
    } catch (error) { console.error("VIRTUS ERROR:", error); } 
    finally { if (!silencioso) setCarregando(false); }
  }

  const handleAtualizarLista = (id, payload) => {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
  };

  const abrirEdicaoCompleta = (produto) => {
    setProdModal(produto);
    let num = produto.peso_caixa ? String(produto.peso_caixa).replace(/[^\d.,]/g, '').trim() : '';
    let und = produto.peso_caixa ? String(produto.peso_caixa).replace(/[\d.,\s]/g, '').trim() : 'Kg';

    setUnidadePesoExtra(und);
    setFormModal({
      preco: produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '',
      status: produto.status_cotacao || 'pendente',
      promocao: produto.promocao || false,
      novidade: produto.novidade || false,
      fotos_novas: [],
      unidade: produto.unidade_medida || 'UN',
      peso_caixa: num,
      tipo_embalagem: produto.tipo_embalagem || 'CX'
    });
    setModalAberto(true);
  };

  const salvarModal = async () => {
    let v = String(formModal.preco || '').replace(/\./g, ',').replace(/[^\d,]/g, '').trim();
    let precoFinal = 'R$ 0,00';
    if (v) {
      let partes = v.split(',');
      let int = partes[0] || '0', dec = partes[1] || '00';
      if (dec.length === 1) dec += '0';
      precoFinal = `R$ ${int},${dec.substring(0,2)}`;
    }

    let pesoFinal = formModal.peso_caixa ? `${formModal.peso_caixa}${unidadePesoExtra}` : '';
    const payload = {
      preco: (formModal.status === 'falta' || formModal.status === 'sem_preco') ? 'R$ 0,00' : precoFinal,
      peso_caixa: pesoFinal,
      tipo_embalagem: formModal.tipo_embalagem,
      status_cotacao: formModal.status === 'pendente' && precoFinal !== 'R$ 0,00' ? 'ativo' : formModal.status,
      promocao: formModal.promocao,
      novidade: formModal.novidade,
      unidade_medida: formModal.unidade,
      foto_url: prodModal.foto_url
    };

    setCarregando(true);
    const { error } = await supabase.from('produtos').update(payload).eq('id', prodModal.id);
    if (!error) {
      handleAtualizarLista(prodModal.id, payload);
      setModalAberto(false);
    }
    setCarregando(false);
  };

  const listas = {
    pendentes: produtos.filter(p => !p.status_cotacao || p.status_cotacao === 'pendente'),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo' && p.preco !== 'R$ 0,00'),
    mantidos: produtos.filter(p => p.status_cotacao === 'mantido'),
    sem_preco: produtos.filter(p => p.status_cotacao === 'sem_preco'),
    falta: produtos.filter(p => p.status_cotacao === 'falta')
  };

  const CONFIG_ABAS = [
    { id: 'pendentes', nomeStr: 'PENDENTES', cor: '#3b82f6', icone: '⏳' },
    { id: 'prontos', nomeStr: 'PRONTOS', cor: '#22c55e', icone: '✅' },
    { id: 'mantidos', nomeStr: 'MANTIDOS', cor: '#eab308', icone: '🔒' },
    { id: 'sem_preco', nomeStr: 'S/ PREÇO', cor: '#f97316', icone: '⏸️' },
    { id: 'falta', nomeStr: 'FALTA', cor: '#ef4444', icone: '🚫' },
  ];

  if (carregando && produtos.length === 0) return <div style={{ padding: '50px', textAlign: 'center' }}>🔄 VIRTUS Carregando...</div>;

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px' }}>
      
      {/* HEADER E BUSCA IGUAIS... */}
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>💲 PRECIFICAÇÃO</h2>
        <p style={{ fontSize: '12px', color: '#94a3b8' }}>Faltam {listas.pendentes.length} itens.</p>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {CONFIG_ABAS.map(aba => (
          <button 
            key={aba.id} onClick={() => setAbaAtiva(aba.id)} 
            style={{ flexShrink: 0, padding: '10px 15px', borderRadius: '10px', border: 'none', fontWeight: 'bold', fontSize: '11px', backgroundColor: abaAtiva === aba.id ? aba.cor : '#fff', color: abaAtiva === aba.id ? '#fff' : '#64748b' }}
          >
            {aba.icone} {aba.nomeStr} ({listas[aba.id].length})
          </button>
        ))}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '10px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
        <span>🔍</span><input placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', width: '100%', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {listas[abaAtiva].filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())).map(p => (
           <LinhaProduto key={p.id} produto={p} corBorda={CONFIG_ABAS.find(a => a.id === (p.status_cotacao || 'pendentes'))?.cor || '#3b82f6'} abrirModal={abrirEdicaoCompleta} aoSalvar={handleAtualizarLista} />
        ))}
      </div>

      {/* MODAL DE EDIÇÃO COMPLETA */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '25px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>{prodModal.nome}</h3>
              <button onClick={() => setModalAberto(false)} style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* 💡 MODAL: SÓ EXIBE SE A UNIDADE DO PESO FOR KG */}
            {String(unidadePesoExtra).toUpperCase() === 'KG' && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>TIPO DE PRODUTO FINAL</label>
                <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                    <button onClick={() => setFormModal({...formModal, tipo_embalagem: 'CX'})} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: formModal.tipo_embalagem === 'CX' ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: formModal.tipo_embalagem === 'CX' ? '#eff6ff' : '#fff', fontWeight: 'bold' }}>📦 CAIXA</button>
                    <button onClick={() => setFormModal({...formModal, tipo_embalagem: 'SACO'})} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: formModal.tipo_embalagem === 'SACO' ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: formModal.tipo_embalagem === 'SACO' ? '#eff6ff' : '#fff', fontWeight: 'bold' }}>🛍️ SACO</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
               <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>PREÇO BASE (R$)</label>
                  <input type="text" value={formModal.preco} onChange={e => setFormModal({...formModal, preco: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '16px', fontWeight: 'bold' }} />
               </div>
               <div style={{ width: '140px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>PESO FINAL</label>
                  <div style={{ display: 'flex' }}>
                    <input type="text" value={formModal.peso_caixa} onChange={e => setFormModal({...formModal, peso_caixa: e.target.value})} style={{ width: '50%', padding: '12px', borderRadius: '10px 0 0 10px', border: '1px solid #eab308', textAlign: 'center' }} />
                    <select value={unidadePesoExtra} onChange={e => setUnidadePesoExtra(e.target.value)} style={{ width: '50%', borderRadius: '0 10px 10px 0', border: '1px solid #eab308', background: '#fefce8', fontWeight: 'bold', fontSize: '11px' }}>
                       {UNIDADES_SISTEMA.map(u => <option key={u} value={u}>{u}</option>)}
                       <option value="g">g</option>
                       <option value="L">L</option>
                       <option value="ml">ml</option>
                    </select>
                  </div>
               </div>
            </div>

            <button onClick={salvarModal} style={{ width: '100%', padding: '15px', background: '#111', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>💾 SALVAR</button>
          </div>
        </div>
      )}
    </div>
  );
}