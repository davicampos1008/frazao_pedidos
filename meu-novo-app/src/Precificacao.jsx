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
          <div>
            <strong style={{ fontSize: '14px', color: '#111' }}>{produto.nome}</strong>
            <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
              <span style={{fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.unidade_medida}</span>
              {produto.peso_caixa && <span style={{fontSize: '9px', background: '#fefce8', color: '#ca8a04', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.peso_caixa}kg</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input type="text" value={preco} onChange={e => setPreco(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: '900', fontSize: '14px' }} />
        </div>
        {produto.unidade_medida === 'KG' && (
          <div style={{ position: 'relative', width: '90px' }}>
            <input type="text" value={pesoCaixa} onChange={e => setPesoCaixa(e.target.value)} onBlur={() => dispararAutoSave(preco, pesoCaixa)} placeholder="Kg" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #eab308', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#fefce8' }} />
          </div>
        )}
      </div>
    </div>
  );
});

export default function Precificacao() {
  // ... (mantenha seus states iguais)
  const [produtos, setProdutos] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [prodModal, setProdModal] = useState(null);
  const [formModal, setFormModal] = useState({ 
    preco: '', 
    status: 'pendente', 
    unidade: 'UN', 
    unidade_final: 'CX', // Novo: para saber se é Saco, Caixa, etc
    peso_caixa: '' 
  });

  // Funções carregarDados, revisar, etc (mantenha as que você já tem)

  const abrirEdicaoCompleta = (produto) => {
    setProdModal(produto);
    setFormModal({
      preco: produto.preco?.replace('R$ ', '') || '',
      status: produto.status_cotacao || 'pendente',
      promocao: produto.promocao || false,
      novidade: produto.novidade || false,
      unidade: produto.unidade_medida || 'UN',
      unidade_final: produto.unidade_final || 'CX', 
      peso_caixa: produto.peso_caixa || '',
      fotos_novas: []
    });
    setModalAberto(true);
  };

  const salvarModal = async () => {
    // ... (lógica de formatação de preço igual à sua)
    const payload = {
      preco: formModal.status === 'ativo' ? `R$ ${formModal.preco}` : 'R$ 0,00',
      peso_caixa: formModal.peso_caixa,
      unidade_medida: formModal.unidade,
      unidade_final: formModal.unidade_final, // Salva se é SACO ou CX
      status_cotacao: formModal.status,
      // ... outras propriedades
    };
    await supabase.from('produtos').update(payload).eq('id', prodModal.id);
    setModalAberto(false);
    carregarDados(true);
  };

  return (
    <div style={{ /* layout container */ }}>
      {/* ... Cabeçalho e Lista ... */}

      {modalAberto && (
        <div style={{ /* estilo do modal */ }}>
          <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '20px' }}>
            {/* Seção de Medida Inteligente */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', fontWeight: 'bold' }}>UNIDADE BASE</label>
                <select 
                  value={formModal.unidade} 
                  onChange={e => setFormModal({...formModal, unidade: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #f1f5f9' }}
                >
                  <option value="UN">UNIDADE (UN)</option>
                  <option value="KG">QUILO (KG)</option>
                </select>
              </div>

              {formModal.unidade === 'KG' && (
                <>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', fontWeight: 'bold' }}>FORMA FINAL</label>
                    <select 
                      value={formModal.unidade_final} 
                      onChange={e => setFormModal({...formModal, unidade_final: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #eab308', backgroundColor: '#fefce8' }}
                    >
                      <option value="CX">CAIXA</option>
                      <option value="SACO">SACO</option>
                      <option value="PCT">PACOTE</option>
                      <option value="FD">FARDO</option>
                    </select>
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 'bold' }}>PESO ({formModal.unidade_final})</label>
                    <input 
                      type="text" 
                      value={formModal.peso_caixa}
                      placeholder="Ex: 20"
                      onChange={e => setFormModal({...formModal, peso_caixa: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #eab308' }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* O resto do seu modal (Preço, Fotos, Botão Salvar) */}
            <button onClick={salvarModal}>SALVAR E FECHAR</button>
          </div>
        </div>
      )}
    </div>
  );
}